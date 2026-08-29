import { Bitmap, bounds } from './bitmap';
import { Sdf } from './sdf';

/**
 * Crop to the drawn content.
 *
 * An outline arrives padded -- text centred in its canvas, an upload with
 * margins -- and that padding is not neutral here: it lifts the subject off the
 * ground, leaving it floating above whatever base is meant to carry it.
 */
function cropped(b: Bitmap): { at: (u: number, v: number) => number; aspect: number } {
  const bb = bounds(b) ?? { x0: 0, y0: 0, x1: b.w - 1, y1: b.h - 1 };
  const w = bb.x1 - bb.x0 + 1;
  const h = bb.y1 - bb.y0 + 1;
  return {
    // u, v in [0, 1]; v = 0 is the top of the content.
    at: (u, v) => {
      const x = bb.x0 + Math.min(w - 1, Math.max(0, Math.floor(u * w)));
      const y = bb.y0 + Math.min(h - 1, Math.max(0, Math.floor(v * h)));
      return b.data[y * b.w + x];
    },
    aspect: h / w,
  };
}

/**
 * Turn a 2D silhouette into a real solid by sweeping it about the vertical
 * axis. Used for uploaded images, where all we are given is an outline: a lathe
 * is a genuine three-dimensional interpretation of one, rather than a slab.
 * Row 0 of the bitmap is the top of the picture.
 */
export function revolveSilhouette(b: Bitmap): Sdf {
  const bb = bounds(b) ?? { x0: 0, y0: 0, x1: b.w - 1, y1: b.h - 1 };
  const cw = bb.x1 - bb.x0 + 1;
  const ch = bb.y1 - bb.y0 + 1;

  // Half-width of the outline at each row, as a fraction of its own width.
  const half = new Float64Array(ch);
  for (let i = 0; i < ch; i++) {
    let lo = -1, hi = -1;
    for (let x = bb.x0; x <= bb.x1; x++) {
      if (b.data[(bb.y0 + i) * b.w + x]) { if (lo < 0) lo = x; hi = x; }
    }
    half[i] = lo < 0 ? 0 : ((hi - lo) / 2 + 0.5) / cw;
  }

  // A slim axial core. An outline with a gap in it -- a bead above a neck, a
  // shape whose middle rows are empty -- revolves into parts that float apart,
  // and a floating part cannot print. The core is the turned-object equivalent
  // of a spindle: thin enough not to change the profile, enough to hold it.
  let smallest = Infinity;
  for (const r of half) if (r > 0 && r < smallest) smallest = r;
  const spine = Number.isFinite(smallest) ? Math.max(0.012, smallest * 0.3) : 0.02;
  const aspect = ch / cw;

  const f = ((x: number, y: number, z: number) => {
    if (z < 0 || z > aspect) return 1;
    const row = Math.min(ch - 1, Math.max(0, Math.floor((1 - z / aspect) * ch)));
    const rad = Math.hypot(x, y);
    const r = half[row];
    return Math.min(r <= 0 ? 1 : rad - r, rad - spine);
  }) as Sdf;
  f.bounds = [-0.5, -0.5, 0, 0.5, 0.5, aspect];
  return f;
}

/**
 * Extrude a 2D outline through the depth axis at a fixed thickness.
 *
 * Reserved for lettering, where this is not a shortcut but the correct solid --
 * three-dimensional text *is* an extruded outline, the way a cast nameplate is.
 * Anything else should be a modelled solid or a lathe.
 */
export function extrudeSilhouette(b: Bitmap, halfDepth = 0.16, plinth = 0.06): Sdf {
  const { at, aspect } = cropped(b);
  const top = plinth + aspect;

  const f = ((x: number, y: number, z: number) => {
    // A plinth under the whole outline. Separate letters are separate solids,
    // so a word without one prints as loose glyphs -- or, once disconnected
    // parts are pruned, as a single surviving letter. This is what makes it a
    // nameplate rather than a pile of characters.
    if (z <= plinth) return Math.max(Math.abs(x) - 0.5, Math.abs(y) - halfDepth, -z);
    if (z > top) return 1;
    if (!at(x + 0.5, 1 - (z - plinth) / aspect)) return 1;
    return Math.abs(y) - halfDepth;
  }) as Sdf;
  f.bounds = [-0.5, -halfDepth, 0, 0.5, halfDepth, top];
  return f;
}

