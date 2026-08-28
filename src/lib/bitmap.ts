/**
 * A binary raster. `data[y * w + x]` is 1 (set) or 0 (clear).
 *
 * Row 0 is the TOP row for image-space bitmaps (QR codes, silhouettes as
 * authored). Code that needs bottom-up ordering (the Z axis of the voxel
 * grid) converts explicitly via `flipY`.
 */
export interface Bitmap {
  w: number;
  h: number;
  data: Uint8Array;
}

export function makeBitmap(w: number, h: number): Bitmap {
  return { w, h, data: new Uint8Array(w * h) };
}

export function get(b: Bitmap, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return 0;
  return b.data[y * b.w + x];
}

export function set(b: Bitmap, x: number, y: number, v: number): void {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  b.data[y * b.w + x] = v ? 1 : 0;
}

export function countSet(b: Bitmap): number {
  let n = 0;
  for (let i = 0; i < b.data.length; i++) n += b.data[i];
  return n;
}

export function flipY(b: Bitmap): Bitmap {
  const out = makeBitmap(b.w, b.h);
  for (let y = 0; y < b.h; y++) {
    out.data.set(b.data.subarray(y * b.w, y * b.w + b.w), (b.h - 1 - y) * b.w);
  }
  return out;
}

/** Column x has at least one set pixel. */
export function columnNonEmpty(b: Bitmap): Uint8Array {
  const out = new Uint8Array(b.w);
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (b.data[y * b.w + x]) out[x] = 1;
    }
  }
  return out;
}

/** Tight bounding box of set pixels, or null when the bitmap is empty. */
export function bounds(b: Bitmap): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = b.w, y0 = b.h, x1 = -1, y1 = -1;
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (b.data[y * b.w + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Nearest-neighbour resample into a w x h box, preserving aspect and centring. */
export function fitInto(src: Bitmap, w: number, h: number, pad = 0): Bitmap {
  const out = makeBitmap(w, h);
  const bb = bounds(src);
  if (!bb) return out;
  const sw = bb.x1 - bb.x0 + 1;
  const sh = bb.y1 - bb.y0 + 1;
  const tw = w - pad * 2;
  const th = h - pad * 2;
  if (tw <= 0 || th <= 0) return out;
  const scale = Math.min(tw / sw, th / sh);
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  const ox = pad + Math.floor((tw - dw) / 2);
  const oy = pad + Math.floor((th - dh) / 2);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = bb.x0 + Math.min(sw - 1, Math.floor((x + 0.5) * sw / dw));
      const sy = bb.y0 + Math.min(sh - 1, Math.floor((y + 0.5) * sh / dh));
      if (src.data[sy * src.w + sx]) set(out, ox + x, oy + y, 1);
    }
  }
  return out;
}
