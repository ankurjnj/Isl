import jsQR from 'jsqr';
import { Bitmap } from './bitmap';

export interface VerifyResult {
  ok: boolean;
  decoded: string | null;
  /** True when the decoded payload matches what the user asked to encode. */
  matches: boolean;
  scale: number;
}

/** Render a bitmap to RGBA, dark modules black on white. */
export function bitmapToRgba(b: Bitmap, scale: number): { data: Uint8ClampedArray; w: number; h: number } {
  const w = b.w * scale;
  const h = b.h * scale;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = b.data[Math.floor(y / scale) * b.w + Math.floor(x / scale)];
      const v = on ? 0 : 255;
      const i = (y * w + x) * 4;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return { data, w, h };
}

/**
 * Decode the sculpture's actual top-down projection.
 *
 * This is the real check, not a proxy: `topView` comes from projecting the
 * finished voxel grid along -z, so a pass here means the geometry that will be
 * printed is the geometry that scans. It is run against a real QR decoder
 * rather than compared module-by-module against the intended code, because a
 * module-wise diff would happily pass a code that a phone still refuses to read.
 */
export function verifyTopView(topView: Bitmap, expected: string, scale = 4): VerifyResult {
  const { data, w, h } = bitmapToRgba(topView, scale);
  const res = jsQR(data, w, h, { inversionAttempts: 'dontInvert' });
  return {
    ok: !!res,
    decoded: res ? res.data : null,
    matches: !!res && res.data === expected,
    scale,
  };
}
