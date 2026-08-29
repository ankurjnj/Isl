/**
 * Signed distance functions for composing real 3D solids.
 *
 * Model space is x, y in [-0.5, 0.5] and z in [0, 1], with z = 0 the ground.
 * Negative is inside. Distances are only approximate for the scaled
 * primitives, which is fine: the only consumer is a voxeliser that asks
 * "inside or outside", and the smooth-union blend radius is tuned by eye.
 */
export interface Sdf {
  (x: number, y: number, z: number): number;
  /**
   * Optional axis-aligned bound [x0, y0, z0, x1, y1, z1] enclosing the solid.
   *
   * `union` uses it to skip parts that cannot possibly be nearest. Without it a
   * model built from fifty primitives evaluates all fifty at every one of a
   * million voxels; with it the cost tracks how many parts are actually near a
   * given point.
   */
  bounds?: [number, number, number, number, number, number];
}

function withBounds(fn: (x: number, y: number, z: number) => number, b: Sdf['bounds']): Sdf {
  const f = fn as Sdf;
  f.bounds = b;
  return f;
}

/**
 * Can this part beat a best-so-far of `best`? Six comparisons, no square root.
 *
 * A point more than `best` away along any single axis is more than `best` away
 * from the box, and so from anything inside it. The margin is clamped at zero:
 * with a negative `best` (the point is already inside something) an inflated
 * margin would skip a part the point genuinely lies within.
 */
function mayBeat(b: NonNullable<Sdf['bounds']>, x: number, y: number, z: number, best: number): boolean {
  const m = best > 0 ? best : 0;
  return x >= b[0] - m && x <= b[3] + m
      && y >= b[1] - m && y <= b[4] + m
      && z >= b[2] - m && z <= b[5] + m;
}

function merge(parts: Sdf[], pad = 0): Sdf['bounds'] {
  const out: [number, number, number, number, number, number] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    if (!p.bounds) return undefined;
    for (let i = 0; i < 3; i++) out[i] = Math.min(out[i], p.bounds[i] - pad);
    for (let i = 3; i < 6; i++) out[i] = Math.max(out[i], p.bounds[i] + pad);
  }
  return out;
}

export function sphere(cx: number, cy: number, cz: number, r: number): Sdf {
  return withBounds((x, y, z) => Math.hypot(x - cx, y - cy, z - cz) - r,
    [cx - r, cy - r, cz - r, cx + r, cy + r, cz + r]);
}

export function ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): Sdf {
  return withBounds((x, y, z) => {
    const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
    const k = Math.hypot(px, py, pz);
    // Scaled-sphere bound: exact sign, distance shrunk by the smallest radius.
    return (k - 1) * Math.min(rx, ry, rz);
  }, [cx - rx, cy - ry, cz - rz, cx + rx, cy + ry, cz + rz]);
}

/** A round-ended rod between two points -- trunks, limbs, tails. */
export function capsule(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  r: number,
): Sdf {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz || 1;
  return withBounds((x, y, z) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / len2));
    return Math.hypot(x - ax - dx * t, y - ay - dy * t, z - az - dz * t) - r;
  }, [Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.min(az, bz) - r,
      Math.max(ax, bx) + r, Math.max(ay, by) + r, Math.max(az, bz) + r]);
}

/** A vertical frustum: radius r0 at z0 tapering to r1 at z1. Cones and cylinders both. */
export function frustum(cx: number, cy: number, z0: number, z1: number, r0: number, r1: number): Sdf {
  const r = Math.max(r0, r1);
  return withBounds((x, y, z) => {
    const t = Math.max(0, Math.min(1, (z - z0) / (z1 - z0 || 1)));
    const r = r0 + (r1 - r0) * t;
    const radial = Math.hypot(x - cx, y - cy) - r;
    const vertical = Math.max(z0 - z, z - z1);
    return Math.max(radial, vertical);
  }, [cx - r, cy - r, Math.min(z0, z1), cx + r, cy + r, Math.max(z0, z1)]);
}

export function box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): Sdf {
  return withBounds(
    (x, y, z) => Math.max(Math.abs(x - cx) - hx, Math.abs(y - cy) - hy, Math.abs(z - cz) - hz),
    [cx - hx, cy - hy, cz - hz, cx + hx, cy + hy, cz + hz]);
}

export function union(...parts: Sdf[]): Sdf {
  return withBounds((x, y, z) => {
    let m = Infinity;
    for (const p of parts) {
      // A part whose bound is further away than the best distance so far
      // cannot lower the minimum, so it need not be evaluated at all.
      if (p.bounds && !mayBeat(p.bounds, x, y, z, m)) continue;
      const d = p(x, y, z);
      if (d < m) m = d;
    }
    return m;
  }, merge(parts));
}

/** Union with a blended seam, so joints read as fillets rather than creases. */
export function smoothUnion(k: number, ...parts: Sdf[]): Sdf {
  // No culling here: the blend reads every part's distance, not just the
  // nearest, so an approximated far value would change the surface.
  return withBounds((x, y, z) => {
    let m = parts[0](x, y, z);
    for (let i = 1; i < parts.length; i++) {
      const b = parts[i](x, y, z);
      const t = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - m) / k));
      m = b * (1 - t) + m * t - k * t * (1 - t);
    }
    return m;
  }, merge(parts, k));
}

export function subtract(from: Sdf, what: Sdf): Sdf {
  return withBounds((x, y, z) => Math.max(from(x, y, z), -what(x, y, z)), from.bounds);
}

/** Repeat a part around the vertical axis -- fins, arms, battlements. */
export function radialArray(n: number, make: (angle: number) => Sdf): Sdf {
  const parts: Sdf[] = [];
  for (let i = 0; i < n; i++) parts.push(make((i / n) * Math.PI * 2));
  return union(...parts);
}

/** Place a part at polar coordinates, for use inside radialArray. */
export function atAngle(angle: number, radius: number, make: (cx: number, cy: number) => Sdf): Sdf {
  return make(Math.cos(angle) * radius, Math.sin(angle) * radius);
}

/** Rotate a part about the vertical axis. Lets fins, wings and limbs be placed
 *  at an angle instead of only along the grid axes. */
export function rotateZ(angle: number, part: Sdf): Sdf {
  const c = Math.cos(-angle), s = Math.sin(-angle);
  const fn = (x: number, y: number, z: number) => part(x * c - y * s, x * s + y * c, z);
  if (!part.bounds) return fn as Sdf;
  // Enclose the rotated bound: a radial extent is rotation-invariant, so the
  // corner radius in xy is a safe box either way round.
  const b = part.bounds;
  const r = Math.max(Math.hypot(b[0], b[1]), Math.hypot(b[3], b[4]), Math.hypot(b[0], b[4]), Math.hypot(b[3], b[1]));
  return withBounds(fn, [-r, -r, b[2], r, r, b[5]]);
}

/** Rotate a part about the x axis, for tilting a limb or a roof plane. */
export function rotateX(angle: number, part: Sdf): Sdf {
  const c = Math.cos(-angle), s = Math.sin(-angle);
  return (x, y, z) => part(x, y * c - z * s, y * s + z * c);
}

/**
 * A tapering blade: a rectangular frustum.
 *
 * Fins, roof planes and wings need a plate that narrows, which neither a box
 * (no taper) nor a frustum (circular) can express. Built analytically rather
 * than as a stack of shrinking boxes -- the stacked version cost 24 primitives
 * each and made a four-finned rocket take sixteen seconds to voxelise.
 */
export function blade(
  cx: number, cy: number, z0: number, z1: number,
  halfX0: number, halfX1: number, thickness: number,
): Sdf {
  const hx = Math.max(halfX0, halfX1);
  return withBounds((x, y, z) => {
    const t = Math.max(0, Math.min(1, (z - z0) / (z1 - z0 || 1)));
    const hx = halfX0 + (halfX1 - halfX0) * t;
    return Math.max(
      Math.abs(x - cx) - hx,
      Math.abs(y - cy) - thickness,
      Math.max(z0 - z, z - z1),
    );
  }, [cx - hx, cy - thickness, z0, cx + hx, cy + thickness, z1]);
}

/** A box that tapers to a smaller footprint with height: roofs, spires, obelisks. */
export function taperedBox(
  cx: number, cy: number, z0: number, z1: number,
  half0: number, half1: number,
): Sdf {
  const h = Math.max(half0, half1);
  return withBounds((x, y, z) => {
    const t = Math.max(0, Math.min(1, (z - z0) / (z1 - z0 || 1)));
    const hh = half0 + (half1 - half0) * t;
    return Math.max(Math.abs(x - cx) - hh, Math.abs(y - cy) - hh, Math.max(z0 - z, z - z1));
  }, [cx - h, cy - h, z0, cx + h, cy + h, z1]);
}

/** Shift a part along z -- lifting a subject onto whatever it stands on. */
export function translateZ(dz: number, part: Sdf): Sdf {
  const fn = (x: number, y: number, z: number) => part(x, y, z - dz);
  if (!part.bounds) return fn as Sdf;
  const b = part.bounds;
  return withBounds(fn, [b[0], b[1], b[2] + dz, b[3], b[4], b[5] + dz]);
}

/**
 * Scale a part about the origin. Distances scale with it, so the result is
 * still a true distance field rather than a merely correctly-signed one.
 */
export function scaled(k: number, part: Sdf): Sdf {
  const fn = (x: number, y: number, z: number) => part(x / k, y / k, z / k) * k;
  if (!part.bounds) return fn as Sdf;
  const b = part.bounds;
  return withBounds(fn, [b[0] * k, b[1] * k, b[2] * k, b[3] * k, b[4] * k, b[5] * k]);
}

/**
 * Rotate a part about the y axis -- leaning a mast, canting a wing.
 *
 * No bound is derived: the callers that need one wrap the result in a `union`,
 * which falls back to evaluating every part when any bound is missing.
 */
export function rotateY(angle: number, part: Sdf): Sdf {
  const c = Math.cos(-angle), s = Math.sin(-angle);
  return (x, y, z) => part(x * c + z * s, y, -x * s + z * c);
}

/**
 * Fit a composed model into the space the carver expects: x and y within
 * [-0.5, 0.5], z from 0 up.
 *
 * Assembled models are authored in whatever units read naturally for the part
 * at hand, and a subject standing on a mount is taller than one standing on the
 * ground. Rather than hand-tuning every recipe to land in the same box, the
 * assembly is measured and scaled once at the end.
 */
export function fitToSpace(part: Sdf): Sdf {
  const b = part.bounds;
  if (!b || !Number.isFinite(b[0])) return part;
  const radial = Math.max(Math.abs(b[0]), Math.abs(b[3]), Math.abs(b[1]), Math.abs(b[4]));
  const tall = b[5] - b[2];
  // Whichever is tighter: half a unit across, or a unit tall.
  const k = Math.min(radial > 0 ? 0.5 / radial : 1, tall > 0 ? 1 / tall : 1);
  return translateZ(-b[2] * k, scaled(k, part));
}
