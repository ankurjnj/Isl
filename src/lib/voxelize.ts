import { Bitmap } from './bitmap';
import { Sdf } from './sdf';

/**
 * Turn a 2D silhouette into a real solid by sweeping it about the vertical
 * axis. Used for uploaded images, where all we are given is an outline: a lathe
 * is a genuine three-dimensional interpretation of one, rather than a slab.
 * Row 0 of the bitmap is the top of the picture.
 */
export function revolveSilhouette(b: Bitmap): Sdf {
  // Half-width of the outline at each row, in model units.
  const half = new Float64Array(b.h);
  for (let y = 0; y < b.h; y++) {
    let lo = -1, hi = -1;
    for (let x = 0; x < b.w; x++) {
      if (b.data[y * b.w + x]) { if (lo < 0) lo = x; hi = x; }
    }
    half[y] = lo < 0 ? 0 : ((hi - lo) / 2 + 0.5) / b.w;
  }
  return (x, y, z) => {
    const row = Math.min(b.h - 1, Math.max(0, Math.floor((1 - z) * b.h)));
    const r = half[row];
    return r <= 0 ? 1 : Math.hypot(x, y) - r;
  };
}

/**
 * Extrude a 2D outline through the depth axis at a fixed thickness.
 *
 * Reserved for lettering, where this is not a shortcut but the correct solid --
 * three-dimensional text *is* an extruded outline, the way a cast nameplate is.
 * Anything else should be a modelled solid or a lathe.
 */
export function extrudeSilhouette(b: Bitmap, halfDepth = 0.16): Sdf {
  return (x, y, z) => {
    const col = Math.min(b.w - 1, Math.max(0, Math.floor((x + 0.5) * b.w)));
    const row = Math.min(b.h - 1, Math.max(0, Math.floor((1 - z) * b.h)));
    if (!b.data[row * b.w + col]) return 1;
    return Math.abs(y) - halfDepth;
  };
}
