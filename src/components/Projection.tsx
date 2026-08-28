import { useEffect, useRef } from 'react';
import type { Bitmap } from '../lib/bitmap';

interface Props {
  bitmap: Bitmap;
  /** Draw row 0 at the bottom. Used for the side view, whose Z runs upward. */
  flipY?: boolean;
  ink?: string;
  paper?: string;
  className?: string;
}

/**
 * Draws a projection exactly, one bitmap cell to one block of pixels.
 *
 * This is not a stylised preview -- it is the literal orthographic projection
 * of the voxel grid, which is also what the verifier feeds to the QR decoder.
 * So the top view rendered here is scannable off the screen, and a phone
 * pointed at it is a genuine end-to-end test of the model.
 */
export default function Projection({ bitmap, flipY, ink = '#0b0d11', paper = '#ffffff', className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    // Integer scale only: a fractional scale would resample module edges and
    // could soften the code enough to break a decode.
    const scale = Math.max(1, Math.floor(560 / Math.max(bitmap.w, bitmap.h)));
    canvas.width = bitmap.w * scale;
    canvas.height = bitmap.h * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = ink;
    for (let y = 0; y < bitmap.h; y++) {
      const row = flipY ? bitmap.h - 1 - y : y;
      for (let x = 0; x < bitmap.w; x++) {
        if (bitmap.data[row * bitmap.w + x]) ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }, [bitmap, flipY, ink, paper]);

  return <canvas className={className} ref={ref} />;
}
