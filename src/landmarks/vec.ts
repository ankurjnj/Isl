/** Tiny 3D vector helpers. PURE. No allocation-heavy abstractions — DTW calls
 *  these a lot, so they stay plain tuples. */

export type Vec3 = readonly [number, number, number];

export const v = (x: number, y: number, z: number): Vec3 => [x, y, z];

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

/** Normalize to unit length; returns [0,0,0] for a zero vector (never NaN). */
export const unit = (a: Vec3): Vec3 => {
  const L = len(a);
  return L < 1e-9 ? [0, 0, 0] : [a[0] / L, a[1] / L, a[2] / L];
};

/** Rotate about the z-axis (the image plane) by the given cos/sin. */
export const rotZ = (a: Vec3, c: number, s: number): Vec3 => [
  a[0] * c - a[1] * s,
  a[0] * s + a[1] * c,
  a[2],
];

/** Angle between two vectors in radians, clamped against float error. */
export const angleBetween = (a: Vec3, b: Vec3): number => {
  const d = dot(unit(a), unit(b));
  return Math.acos(Math.max(-1, Math.min(1, d)));
};
