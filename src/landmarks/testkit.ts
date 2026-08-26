import type { NormFrame, RawFrame, Landmark } from "./types";

/**
 * Shared test fixtures. Not imported by the app, so it is tree-shaken out of
 * the bundle; it lives here (not in a .test.ts) only so multiple test files can
 * share it.
 */

/** A minimal NormFrame with one hand at a given global wrist position/speed. */
export function normFrameAt(
  tMs: number,
  rightWrist: [number, number, number] | null,
  leftWrist: [number, number, number] | null = null,
): NormFrame {
  const hand = (w: [number, number, number] | null): Float32Array => {
    const a = new Float32Array(63);
    if (w) {
      a[0] = w[0];
      a[1] = w[1];
      a[2] = w[2];
    }
    return a;
  };
  return {
    tMs,
    present: [leftWrist !== null, rightWrist !== null],
    handsGlobal: [hand(leftWrist), hand(rightWrist)],
    handsLocal: [hand(leftWrist), hand(rightWrist)],
    palmNormal: [new Float32Array(3), new Float32Array(3)],
    pose: new Float32Array(12),
  };
}

/** A raw hand as 21 landmarks all near a wrist point (only landmark 0 matters here). */
export function rawHandAt(x: number, y: number, z = 0): Landmark[] {
  const pts: Landmark[] = [{ x, y, z }];
  for (let i = 1; i < 21; i++) pts.push({ x: x + i * 0.001, y: y + i * 0.001, z });
  return pts;
}

export function rawFrame(
  tMs: number,
  left: Landmark[] | null,
  right: Landmark[] | null,
): RawFrame {
  return { tMs, hands: { left, right }, pose: null };
}
