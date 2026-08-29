import { useEffect, useRef } from 'react';
import type { Sdf } from '../lib/sdf';

/**
 * A thumbnail sampled from the solid itself.
 *
 * Drawing the model's own side profile rather than an authored icon keeps the
 * picker honest: what you see is what the code will be carved out of, at
 * roughly the resolution the print will have.
 */
export default function ModelThumb({ sdf, size = 30 }: { sdf: Sdf; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);
    const fill = getComputedStyle(canvas).color;
    ctx.fillStyle = fill;
    for (let py = 0; py < size; py++) {
      const mz = 1 - (py + 0.5) / size;
      for (let px = 0; px < size; px++) {
        const mx = (px + 0.5) / size - 0.5;
        // Sample a few depths: a thin feature can sit off the centre plane.
        // Sample across the depth: a thin feature -- a fin, an ear, a handle --
        // can sit well off the centre plane.
        let hit = false;
        for (let k = 0; k < 9 && !hit; k++) {
          if (sdf(mx, k / 8 - 0.5, mz) < 0) hit = true;
        }
        if (hit) ctx.fillRect(px, py, 1, 1);
      }
    }
  }, [sdf, size]);

  return <canvas ref={ref} width={size} height={size} aria-hidden />;
}
