/**
 * Core landmark + frame types (Part 6.4). PURE — no React, no DOM.
 *
 * The dual handsGlobal / handsLocal representation is the whole trick: it is
 * what lets the app say "right shape, wrong place" instead of one opaque
 * number. Do not collapse it (Part 6.4).
 */

export type Handedness =
  | "one_handed"
  | "symmetric"
  | "asymmetric_two_handed";

export type Landmark = {
  x: number;
  y: number;
  z: number;
  visibility?: number;
};

/** Raw output straight from MediaPipe, after the mirror-handedness fix. */
export type RawFrame = {
  tMs: number;
  hands: { left: Landmark[] | null; right: Landmark[] | null };
  pose: Landmark[] | null;
};

/**
 * A normalized frame. Camera distance, position, and shoulder tilt have all
 * been removed. Arrays are flat Float32Array for cheap DTW.
 *
 *   handsGlobal — shoulder-relative → LOCATION
 *   handsLocal  — wrist-relative    → HANDSHAPE
 *   palmNormal  — unit normal       → ORIENTATION
 */
export type NormFrame = {
  tMs: number;
  present: [boolean, boolean]; // [left, right]
  handsGlobal: [Float32Array, Float32Array];
  handsLocal: [Float32Array, Float32Array];
  palmNormal: [Float32Array, Float32Array];
  pose: Float32Array;
};

export type TrackingQuality = {
  meanHandConfidence: number;
  framesDropped: number;
  bothHandsSeenRatio: number;
  /** Gate ALL scoring on this (Part 6.4, Part 7 §7). */
  usable: boolean;
};

export type Attempt = {
  frames: NormFrame[]; // exactly ATTEMPT_FRAMES (64)
  durationMs: number;
  quality: TrackingQuality;
};

/** Which hand slot an index refers to. Kept explicit for readability. */
export const LEFT = 0 as const;
export const RIGHT = 1 as const;

/** Number of 3D landmarks MediaPipe reports per hand. */
export const HAND_LANDMARK_COUNT = 21;
