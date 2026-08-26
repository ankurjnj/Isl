import type { NormFrame } from "@/landmarks/types";
import { FEATURE_WEIGHTS } from "@/config/thresholds";

/**
 * Per-frame feature vectors for DTW (Part 6 slice v0.4). PURE.
 *
 * A frame becomes one flat vector:
 *   [ handsGlobal(L,R) · w_global | handsLocal(L,R) · w_local | present · w_presence ]
 *
 * handsGlobal carries LOCATION, handsLocal carries HANDSHAPE. Keeping both is
 * what lets the recognizer (and the scorer) separate "wrong place" from "wrong
 * shape" — the dual representation is never collapsed (Part 6.4).
 */

const HAND_DIM = 63; // 21 landmarks × 3
export const FEATURE_DIM = HAND_DIM * 4 + 2; // global(2) + local(2) + presence(2)

function writeFrame(
  out: Float32Array,
  frame: NormFrame,
  swapHands: boolean,
): void {
  const l = swapHands ? 1 : 0;
  const r = swapHands ? 0 : 1;
  const wg = FEATURE_WEIGHTS.global;
  const wl = FEATURE_WEIGHTS.local;
  const wp = FEATURE_WEIGHTS.presence;

  let o = 0;
  for (let k = 0; k < HAND_DIM; k++) out[o++] = frame.handsGlobal[l]![k]! * wg;
  for (let k = 0; k < HAND_DIM; k++) out[o++] = frame.handsGlobal[r]![k]! * wg;
  for (let k = 0; k < HAND_DIM; k++) out[o++] = frame.handsLocal[l]![k]! * wl;
  for (let k = 0; k < HAND_DIM; k++) out[o++] = frame.handsLocal[r]![k]! * wl;
  out[o++] = (frame.present[l] ? 1 : 0) * wp;
  out[o++] = (frame.present[r] ? 1 : 0) * wp;
}

/**
 * Turn a clip into a matrix of feature vectors, one row per frame.
 * `swapHands` mirrors left/right — used for symmetric signs, where either
 * hand-assignment is acceptable (Part 6 v0.4).
 */
export function clipFeatures(frames: NormFrame[], swapHands = false): Float32Array[] {
  return frames.map((f) => {
    const row = new Float32Array(FEATURE_DIM);
    writeFrame(row, f, swapHands);
    return row;
  });
}
