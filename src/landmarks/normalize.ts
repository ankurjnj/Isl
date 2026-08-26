import {
  type Vec3,
  sub,
  mul,
  cross,
  dot,
  unit,
  len,
  rotZ,
} from "./vec";
import {
  type RawFrame,
  type NormFrame,
  type Landmark,
  HAND_LANDMARK_COUNT,
  LEFT,
  RIGHT,
} from "./types";

/**
 * Landmark normalization (Part 6 slice v0.2). PURE.
 *
 * Every future bug traces back to this module, so it is written to be read.
 * The seven steps below are the spec's, in order. The dual output —
 * handsGlobal (shoulder-relative → LOCATION) and handsLocal (wrist-relative,
 * palm-framed → HANDSHAPE) — is the whole trick and is never collapsed.
 *
 * Guarantees: a missing hand yields all-zeros with present[i] = false, and no
 * output is ever NaN.
 */

// MediaPipe pose indices.
const POSE_L_SHOULDER = 11;
const POSE_R_SHOULDER = 12;
const POSE_L_ELBOW = 13;
const POSE_R_ELBOW = 14;
const POSE_KEEP = [POSE_L_SHOULDER, POSE_R_SHOULDER, POSE_L_ELBOW, POSE_R_ELBOW];

// MediaPipe hand indices used for the palm frame.
const WRIST = 0;
const INDEX_MCP = 5;
const PINKY_MCP = 17;
const MIDDLE_MCP = 9;

const ZERO_HAND = () => new Float32Array(HAND_LANDMARK_COUNT * 3); // 63
const ZERO_NORMAL = () => new Float32Array(3);

const toVec = (l: Landmark): Vec3 => [l.x, l.y, l.z];

/** Rigid+scale frame derived from the shoulders. */
type ShoulderFrame = {
  origin: Vec3; // shoulder midpoint
  scale: number; // shoulder width
  c: number; // cos(-θ) to level the shoulder line
  s: number; // sin(-θ)
  ok: boolean;
};

function shoulderFrame(pose: Landmark[] | null): ShoulderFrame {
  const neutral: ShoulderFrame = { origin: [0, 0, 0], scale: 1, c: 1, s: 0, ok: false };
  if (!pose) return neutral;
  const ls = pose[POSE_L_SHOULDER];
  const rs = pose[POSE_R_SHOULDER];
  if (!ls || !rs) return neutral;

  const L = toVec(ls);
  const R = toVec(rs);
  const origin: Vec3 = mul(sub(add3(L, R), [0, 0, 0]), 0.5);
  const shoulder = sub(R, L); // left → right, in image space
  const width = len(shoulder);
  if (width < 1e-6) return { ...neutral, origin };

  // Rotate so the shoulder line is horizontal: undo its tilt about z.
  const theta = Math.atan2(shoulder[1], shoulder[0]);
  return { origin, scale: width, c: Math.cos(-theta), s: Math.sin(-theta), ok: true };
}

const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Apply origin → scale → level-rotation to a point (steps 1–3). */
function toGlobal(p: Vec3, f: ShoulderFrame): Vec3 {
  const t = sub(p, f.origin);
  const scaled: Vec3 = [t[0] / f.scale, t[1] / f.scale, t[2] / f.scale];
  return rotZ(scaled, f.c, f.s);
}

/** Build the per-hand palm basis from landmarks 0, 5, 17 (steps 5–6). */
function palmBasis(hand: Landmark[]): { basis: [Vec3, Vec3, Vec3]; normal: Vec3; scale: number } {
  const w = toVec(hand[WRIST]!);
  const i = toVec(hand[INDEX_MCP]!);
  const p = toVec(hand[PINKY_MCP]!);
  const m = toVec(hand[MIDDLE_MCP]!);

  const e1 = unit(sub(i, w)); // toward the index knuckle
  const normal = unit(cross(sub(i, w), sub(p, w))); // palm normal
  const e2 = unit(cross(normal, e1)); // completes a right-handed frame
  const scale = Math.max(len(sub(m, w)), 1e-6); // palm size → hand-size invariant
  return { basis: [e1, e2, normal], normal, scale };
}

function handLocal(hand: Landmark[]): { local: Float32Array; normal: Float32Array } {
  const w = toVec(hand[WRIST]!);
  const { basis, normal, scale } = palmBasis(hand);
  const out = new Float32Array(HAND_LANDMARK_COUNT * 3);
  for (let k = 0; k < HAND_LANDMARK_COUNT; k++) {
    const rel = sub(toVec(hand[k]!), w);
    // Project onto the palm basis, scaled by hand size.
    out[k * 3 + 0] = dot(rel, basis[0]) / scale;
    out[k * 3 + 1] = dot(rel, basis[1]) / scale;
    out[k * 3 + 2] = dot(rel, basis[2]) / scale;
  }
  return { local: out, normal: Float32Array.from(normal) };
}

function handGlobal(hand: Landmark[], f: ShoulderFrame): Float32Array {
  const out = new Float32Array(HAND_LANDMARK_COUNT * 3);
  for (let k = 0; k < HAND_LANDMARK_COUNT; k++) {
    const g = toGlobal(toVec(hand[k]!), f);
    out[k * 3 + 0] = g[0];
    out[k * 3 + 1] = g[1];
    out[k * 3 + 2] = g[2];
  }
  return out;
}

function normPose(pose: Landmark[] | null, f: ShoulderFrame): Float32Array {
  const out = new Float32Array(POSE_KEEP.length * 3);
  if (!pose) return out;
  POSE_KEEP.forEach((idx, j) => {
    const lm = pose[idx];
    if (!lm) return;
    const g = toGlobal(toVec(lm), f);
    out[j * 3 + 0] = g[0];
    out[j * 3 + 1] = g[1];
    out[j * 3 + 2] = g[2];
  });
  return out;
}

/** Normalize one raw frame. Never throws, never returns NaN. */
export function normalizeFrame(raw: RawFrame): NormFrame {
  const f = shoulderFrame(raw.pose);
  const hands: [Landmark[] | null, Landmark[] | null] = [
    raw.hands.left,
    raw.hands.right,
  ];

  const handsGlobal: [Float32Array, Float32Array] = [ZERO_HAND(), ZERO_HAND()];
  const handsLocal: [Float32Array, Float32Array] = [ZERO_HAND(), ZERO_HAND()];
  const palmNormal: [Float32Array, Float32Array] = [ZERO_NORMAL(), ZERO_NORMAL()];
  const present: [boolean, boolean] = [false, false];

  for (const slot of [LEFT, RIGHT] as const) {
    const hand = hands[slot];
    if (!hand || hand.length < HAND_LANDMARK_COUNT) continue; // missing → zeros
    present[slot] = true;
    handsGlobal[slot] = handGlobal(hand, f);
    const { local, normal } = handLocal(hand);
    handsLocal[slot] = local;
    palmNormal[slot] = normal;
  }

  return {
    tMs: raw.tMs,
    present,
    handsGlobal,
    handsLocal,
    palmNormal,
    pose: normPose(raw.pose, f),
  };
}

export function normalizeFrames(raw: RawFrame[]): NormFrame[] {
  return raw.map(normalizeFrame);
}
