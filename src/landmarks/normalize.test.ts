import { describe, it, expect } from "vitest";
import { normalizeFrame } from "./normalize";
import { type Vec3, rotZ, add } from "./vec";
import type { Landmark, RawFrame } from "./types";

/* ── Fixture scene ──────────────────────────────────────────────────────────
 * A "scene" places a canonical (shoulder-relative) point into image space:
 *     image = origin + scale · Rot(tilt) · canonical
 * so a near camera has a large scale, a far camera a small one, and a tilted
 * camera a nonzero rotation. normalizeFrame must invert all three and recover
 * the canonical coordinates — that is the whole point of the module.
 */
type Scene = { origin: Vec3; scale: number; tilt: number };

const NEAR: Scene = { origin: [0.5, 0.45, 0], scale: 0.6, tilt: 0 };
const FAR: Scene = { origin: [0.5, 0.5, 0], scale: 0.22, tilt: 0 };
const TILTED: Scene = { origin: [0.4, 0.55, 0], scale: 0.4, tilt: 0.35 };

function place(canonical: Vec3, s: Scene): Landmark {
  const r = rotZ(canonical, Math.cos(s.tilt), Math.sin(s.tilt));
  const [x, y, z] = add(s.origin, [r[0] * s.scale, r[1] * s.scale, r[2] * s.scale]);
  return { x, y, z };
}

// Canonical shoulders/elbows (shoulder-relative, unit shoulder width).
const SHOULDER_L: Vec3 = [-0.5, 0, 0];
const SHOULDER_R: Vec3 = [0.5, 0, 0];
const ELBOW_L: Vec3 = [-0.6, 0.6, 0];
const ELBOW_R: Vec3 = [0.6, 0.6, 0];

/** A distinct, valid 21-point hand shape placed at a shoulder-relative offset. */
function canonicalHand(offset: Vec3): Vec3[] {
  const base: Record<number, Vec3> = {
    0: [0, 0, 0], // wrist
    5: [0.1, -0.3, 0.02], // index MCP
    9: [0.0, -0.33, 0.01], // middle MCP
    13: [-0.06, -0.31, 0.0], // ring MCP
    17: [-0.13, -0.26, -0.01], // pinky MCP
  };
  const pts: Vec3[] = [];
  for (let i = 0; i < 21; i++) {
    const b = base[i] ?? [0.02 * i - 0.2, -0.02 * i, 0.001 * i];
    pts.push(add(offset, b));
  }
  return pts;
}

function frame(handOffset: Vec3, scene: Scene, tMs = 0): RawFrame {
  const pose: Landmark[] = [];
  for (let i = 0; i < 15; i++) pose.push({ x: 0, y: 0, z: 0 });
  pose[11] = place(SHOULDER_L, scene);
  pose[12] = place(SHOULDER_R, scene);
  pose[13] = place(ELBOW_L, scene);
  pose[14] = place(ELBOW_R, scene);
  const hand = canonicalHand(handOffset).map((c) => place(c, scene));
  return { tMs, hands: { left: null, right: hand }, pose };
}

function meanL2(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) ** 2;
  return Math.sqrt(s / a.length);
}

const HAND_OFFSET: Vec3 = [0.3, -0.4, 0]; // hand up and to one side

describe("normalizeFrame — invariance", () => {
  it("recovers the same global trajectory at near, far, and tilted", () => {
    const near = normalizeFrame(frame(HAND_OFFSET, NEAR));
    const far = normalizeFrame(frame(HAND_OFFSET, FAR));
    const tilted = normalizeFrame(frame(HAND_OFFSET, TILTED));

    // Spec done-criterion: same sign at two distances within 0.1 mean L2.
    expect(meanL2(near.handsGlobal[1], far.handsGlobal[1])).toBeLessThan(0.01);
    expect(meanL2(near.handsGlobal[1], tilted.handsGlobal[1])).toBeLessThan(0.01);
  });

  it("puts the wrist at the expected shoulder-relative location", () => {
    const n = normalizeFrame(frame(HAND_OFFSET, TILTED));
    // Wrist (landmark 0) global position should be the offset itself.
    expect(n.handsGlobal[1][0]).toBeCloseTo(HAND_OFFSET[0], 4);
    expect(n.handsGlobal[1][1]).toBeCloseTo(HAND_OFFSET[1], 4);
  });

  it("handsLocal (handshape) is invariant to where the hand is in frame", () => {
    const a = normalizeFrame(frame([0.3, -0.4, 0], NEAR));
    const b = normalizeFrame(frame([-0.2, -0.1, 0.05], TILTED));
    // Same shape, different place → identical handsLocal.
    expect(meanL2(a.handsLocal[1], b.handsLocal[1])).toBeLessThan(1e-3);
  });

  it("synthetic 2× scale is identity in normalized space", () => {
    const s1 = normalizeFrame(frame(HAND_OFFSET, { origin: [0.5, 0.5, 0], scale: 0.3, tilt: 0 }));
    const s2 = normalizeFrame(frame(HAND_OFFSET, { origin: [0.5, 0.5, 0], scale: 0.6, tilt: 0 }));
    expect(meanL2(s1.handsGlobal[1], s2.handsGlobal[1])).toBeLessThan(1e-4);
  });
});

describe("normalizeFrame — robustness", () => {
  it("missing hand → zeros, present=false, never NaN", () => {
    const f = frame(HAND_OFFSET, NEAR);
    f.hands.right = null; // now both hands missing
    const n = normalizeFrame(f);
    expect(n.present).toEqual([false, false]);
    for (const arr of [n.handsGlobal[0], n.handsGlobal[1], n.handsLocal[1], n.palmNormal[1]]) {
      expect(arr.every((x) => Number.isFinite(x))).toBe(true);
      expect(arr.every((x) => x === 0)).toBe(true);
    }
  });

  it("missing pose does not produce NaN", () => {
    const f = frame(HAND_OFFSET, NEAR);
    f.pose = null;
    const n = normalizeFrame(f);
    expect(n.handsGlobal[1].every((x) => Number.isFinite(x))).toBe(true);
    expect(n.handsLocal[1].every((x) => Number.isFinite(x))).toBe(true);
  });

  it("palmNormal is a unit vector for a present hand", () => {
    const n = normalizeFrame(frame(HAND_OFFSET, NEAR));
    const pn = n.palmNormal[1];
    const mag = Math.hypot(pn[0]!, pn[1]!, pn[2]!);
    expect(mag).toBeCloseTo(1, 5);
  });
});
