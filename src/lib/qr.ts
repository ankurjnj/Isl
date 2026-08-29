import qrcode from 'qrcode-generator';
import { Bitmap, makeBitmap, set } from './bitmap';

export type EccLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrResult {
  /** Full bitmap including the quiet zone. 1 = dark module. */
  bitmap: Bitmap;
  /** Modules per side of the code itself, excluding the quiet zone. */
  moduleCount: number;
  /** Quiet-zone width in modules, applied on every side. */
  quietZone: number;
  /** QR version (1..40). */
  version: number;
  ecc: EccLevel;
}

/**
 * Build the QR module matrix for `text`.
 *
 * The quiet zone is part of the returned bitmap because the sculpture has to
 * physically reserve that margin -- the code is unscannable without it, and
 * downstream stages need to know which columns are quiet zone so they do not
 * put the silhouette there.
 */
/**
 * `version` forces a larger module grid than the payload strictly needs.
 * More modules is the only lever that buys the sculpture real detail: the
 * artwork's resolution in x and y is exactly the module grid, so a short URL
 * at version 4 gives a 33-module subject and no room for a fin or an ear.
 */
export function makeQr(text: string, ecc: EccLevel = 'H', quietZone = 4, version?: number): QrResult {
  if (!text) throw new Error('QR payload is empty');
  // typeNumber 0 asks the library to pick the smallest version that fits; an
  // explicit version forces a larger, finer grid than the payload needs.
  const qr = qrcode((version ?? 0) as Parameters<typeof qrcode>[0], ecc);
  qr.addData(text);
  qr.make();

  const n = qr.getModuleCount();
  const size = n + quietZone * 2;
  const bitmap = makeBitmap(size, size);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(row, col)) set(bitmap, col + quietZone, row + quietZone, 1);
    }
  }

  // qrcode-generator does not expose the chosen version directly; derive it
  // from the module count (version v has 4v + 17 modules per side).
  return { bitmap, moduleCount: n, quietZone, version: (n - 17) / 4, ecc };
}
