/**
 * Signed distance functions for composing real 3D solids.
 *
 * Model space is x, y in [-0.5, 0.5] and z in [0, 1], with z = 0 the ground.
 * Negative is inside. Distances are only approximate for the scaled
 * primitives, which is fine: the only consumer is a voxeliser that asks
 * "inside or outside", and the smooth-union blend radius is tuned by eye.
 */
export type Sdf = (x: number, y: number, z: number) => number;

export function sphere(cx: number, cy: number, cz: number, r: number): Sdf {
  return (x, y, z) => Math.hypot(x - cx, y - cy, z - cz) - r;
}

export function ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): Sdf {
  return (x, y, z) => {
    const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
    const k = Math.hypot(px, py, pz);
    // Scaled-sphere bound: exact sign, distance shrunk by the smallest radius.
    return (k - 1) * Math.min(rx, ry, rz);
  };
}

/** A round-ended rod between two points -- trunks, limbs, tails. */
export function capsule(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  r: number,
): Sdf {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz || 1;
  return (x, y, z) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / len2));
    return Math.hypot(x - ax - dx * t, y - ay - dy * t, z - az - dz * t) - r;
  };
}

/** A vertical frustum: radius r0 at z0 tapering to r1 at z1. Cones and cylinders both. */
export function frustum(cx: number, cy: number, z0: number, z1: number, r0: number, r1: number): Sdf {
  return (x, y, z) => {
    const t = Math.max(0, Math.min(1, (z - z0) / (z1 - z0 || 1)));
    const r = r0 + (r1 - r0) * t;
    const radial = Math.hypot(x - cx, y - cy) - r;
    const vertical = Math.max(z0 - z, z - z1);
    return Math.max(radial, vertical);
  };
}

export function box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): Sdf {
  return (x, y, z) => Math.max(Math.abs(x - cx) - hx, Math.abs(y - cy) - hy, Math.abs(z - cz) - hz);
}

export function union(...parts: Sdf[]): Sdf {
  return (x, y, z) => {
    let m = Infinity;
    for (const p of parts) m = Math.min(m, p(x, y, z));
    return m;
  };
}

/** Union with a blended seam, so joints read as fillets rather than creases. */
export function smoothUnion(k: number, ...parts: Sdf[]): Sdf {
  return (x, y, z) => {
    let m = parts[0](x, y, z);
    for (let i = 1; i < parts.length; i++) {
      const b = parts[i](x, y, z);
      const t = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - m) / k));
      m = b * (1 - t) + m * t - k * t * (1 - t);
    }
    return m;
  };
}

export function subtract(from: Sdf, what: Sdf): Sdf {
  return (x, y, z) => Math.max(from(x, y, z), -what(x, y, z));
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
