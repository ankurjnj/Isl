import { describe, it, expect } from "vitest";
import { smoothHandIdentity } from "./smooth";
import { rawHandAt, rawFrame } from "./testkit";
import type { Landmark, RawFrame } from "./types";

/**
 * Crossing-hands fixture. Two hands cross in the middle of a sign. A naive
 * positional labeler (which is roughly what MediaPipe does) puts whichever hand
 * is currently leftmost into the "left" slot, so the two hands SWAP slots at
 * the crossing. Identity smoothing should keep each hand in its own slot.
 */
function buildCrossing(): { frames: RawFrame[]; handA: Landmark[][]; handB: Landmark[][] } {
  const N = 20;
  const framesA: Landmark[][] = [];
  const framesB: Landmark[][] = [];
  const frames: RawFrame[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    // A passes slightly higher than B, so as they cross they never occupy the
    // same point — position still distinguishes them in 3D, which is exactly
    // the information MediaPipe's x-only handedness label throws away.
    const a = rawHandAt(t, 0.36); // A: left → right, higher
    const b = rawHandAt(1 - t, 0.44); // B: right → left, lower
    framesA.push(a);
    framesB.push(b);
    // Naive labeler: smaller x goes in the left slot.
    const aIsLeft = a[0]!.x <= b[0]!.x;
    frames.push(rawFrame(i * 30, aIsLeft ? a : b, aIsLeft ? b : a));
  }
  return { frames, handA: framesA, handB: framesB };
}

function slotOfA(frame: RawFrame, aRef: Landmark[]): 0 | 1 | -1 {
  if (frame.hands.left === aRef) return 0;
  if (frame.hands.right === aRef) return 1;
  return -1;
}

function countSwaps(frames: RawFrame[], aRefs: Landmark[][]): number {
  let swaps = 0;
  let prev = slotOfA(frames[0]!, aRefs[0]!);
  for (let i = 1; i < frames.length; i++) {
    const cur = slotOfA(frames[i]!, aRefs[i]!);
    if (cur !== -1 && prev !== -1 && cur !== prev) swaps++;
    if (cur !== -1) prev = cur;
  }
  return swaps;
}

describe("smoothHandIdentity", () => {
  it("measurably reduces mid-sign hand swaps on a crossing fixture", () => {
    const { frames, handA } = buildCrossing();
    const rawSwaps = countSwaps(frames, handA);
    const smoothed = smoothHandIdentity(frames);
    const smoothSwaps = countSwaps(smoothed, handA);

    expect(rawSwaps).toBeGreaterThan(0); // the naive labeler really does swap
    expect(smoothSwaps).toBeLessThan(rawSwaps);
    expect(smoothSwaps).toBe(0); // A keeps its slot throughout
  });

  it("keeps a single detection assigned to a stable slot", () => {
    const frames: RawFrame[] = [
      rawFrame(0, null, rawHandAt(0.6, 0.4)),
      rawFrame(30, null, rawHandAt(0.62, 0.4)),
      rawFrame(60, null, rawHandAt(0.64, 0.4)),
    ];
    const out = smoothHandIdentity(frames);
    // All three should land in the same slot (right, matching the input).
    expect(out.every((f) => f.hands.right !== null && f.hands.left === null)).toBe(true);
  });

  it("passes timestamps and pose through untouched", () => {
    const { frames } = buildCrossing();
    const out = smoothHandIdentity(frames);
    expect(out.map((f) => f.tMs)).toEqual(frames.map((f) => f.tMs));
  });
});
