import { Bitmap, makeBitmap } from './bitmap';
import { Contour, flattenPath } from './path';

/**
 * Scanline-fill polygon contours into a binary bitmap using the even-odd rule
 * (so inner contours punch holes, e.g. the gap in a doughnut).
 *
 * Rasterisation happens at `ss`x resolution and is then downsampled with a
 * coverage threshold. At the module sizes we work with (30-80 px per side) a
 * plain 1x rasteriser drops thin features like legs and antennae entirely;
 * supersampling plus a coverage vote keeps them.
 */
export function fillContours(
  contours: Contour[],
  w: number,
  h: number,
  opts: { ss?: number; coverage?: number } = {},
): Bitmap {
  const ss = opts.ss ?? 4;
  const coverage = opts.coverage ?? 0.35;
  const out = makeBitmap(w, h);
  if (!contours.length) return out;

  // Fit all contours into the w x h box, preserving aspect ratio.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of contours) {
    for (let i = 0; i < c.length; i += 2) {
      if (c[i] < minX) minX = c[i];
      if (c[i] > maxX) maxX = c[i];
      if (c[i + 1] < minY) minY = c[i + 1];
      if (c[i + 1] > maxY) maxY = c[i + 1];
    }
  }
  const sw = maxX - minX || 1;
  const sh = maxY - minY || 1;
  const W = w * ss, H = h * ss;
  const scale = Math.min(W / sw, H / sh);
  const ox = (W - sw * scale) / 2 - minX * scale;
  const oy = (H - sh * scale) / 2 - minY * scale;

  // Edge list in device space, skipping horizontal edges (they contribute no
  // crossings and would otherwise produce double counts at vertices).
  const edges: number[] = []; // x0, y0, x1, y1
  for (const c of contours) {
    const n = c.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x0 = c[i * 2] * scale + ox, y0 = c[i * 2 + 1] * scale + oy;
      const x1 = c[j * 2] * scale + ox, y1 = c[j * 2 + 1] * scale + oy;
      if (y0 !== y1) edges.push(x0, y0, x1, y1);
    }
  }

  const counts = new Uint16Array(w * h);
  const xs: number[] = [];
  for (let py = 0; py < H; py++) {
    const sy = py + 0.5;
    xs.length = 0;
    for (let e = 0; e < edges.length; e += 4) {
      const y0 = edges[e + 1], y1 = edges[e + 3];
      // Half-open [min, max) test: a vertex shared by two edges is counted once.
      if ((sy >= y0 && sy < y1) || (sy >= y1 && sy < y0)) {
        const t = (sy - y0) / (y1 - y0);
        xs.push(edges[e] + t * (edges[e + 2] - edges[e]));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    const row = Math.floor(py / ss);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5));
      const to = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let px = from; px <= to; px++) counts[row * w + Math.floor(px / ss)]++;
    }
  }

  const need = coverage * ss * ss;
  for (let i = 0; i < out.data.length; i++) out.data[i] = counts[i] >= need ? 1 : 0;
  return out;
}

export function rasterizePath(d: string, w: number, h: number, opts?: { ss?: number; coverage?: number }): Bitmap {
  return fillContours(flattenPath(d), w, h, opts);
}

/**
 * Threshold RGBA pixel data into a silhouette.
 *
 * `invert` picks whether dark pixels or light pixels become the solid body.
 * Fully transparent pixels are always treated as background, which makes
 * transparent PNG cut-outs work without any thresholding guesswork.
 */
export function thresholdImageData(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  opts: { threshold?: number; invert?: boolean } = {},
): Bitmap {
  const threshold = opts.threshold ?? 128;
  const invert = opts.invert ?? false;
  const out = makeBitmap(w, h);
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3];
    if (a < 16) continue;
    const lum = 0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2];
    const solid = invert ? lum > threshold : lum <= threshold;
    out.data[i] = solid ? 1 : 0;
  }
  return out;
}
