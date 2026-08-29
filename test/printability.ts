import { getModel } from '../src/lib/models3d';
import { buildDesign, DEFAULT_INPUT } from '../src/lib/pipeline';
import { flipY } from '../src/lib/bitmap';

const payload = 'https://github.com/ankurjnj/Isl';
const NOZZLE = 0.4;

console.log('ver  modules  module   tile     isolated  diagonal-only  thin necks  tris');
for (const [version, moduleMm] of [[12, 1.6], [10, 1.6], [8, 2.0], [6, 2.4], [4, 3.0], [0, 3.0]] as const) {
  const d = buildDesign({ ...DEFAULT_INPUT, payload, version, moduleMm, model: getModel('rocket')!.sdf });
  const code = flipY(d.code);
  const w = code.w;
  const dark = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= code.h ? 0 : code.data[y * w + x]);

  let isolated = 0, diagonal = 0;
  for (let y = 0; y < code.h; y++) {
    for (let x = 0; x < w; x++) {
      if (!dark(x, y)) continue;
      const orth = dark(x - 1, y) + dark(x + 1, y) + dark(x, y - 1) + dark(x, y + 1);
      if (orth === 0) isolated++;
      // A pair touching only at a corner: the printed neck is zero width.
      for (const [dx, dy] of [[1, 1], [1, -1]]) {
        if (dark(x + dx, y + dy) && !dark(x + dx, y) && !dark(x, y + dy)) diagonal++;
      }
    }
  }
  console.log(
    String(d.qr.version).padStart(3),
    String(d.report.moduleCount).padStart(8),
    `${moduleMm}mm`.padStart(7),
    `${d.dims.widthMm.toFixed(0)}mm`.padStart(7),
    String(isolated).padStart(9),
    String(diagonal).padStart(14),
    `${(moduleMm / NOZZLE).toFixed(1)}x nozzle`.padStart(12),
    d.report.triangles.toLocaleString().padStart(8),
  );
}
