import { SILHOUETTES } from '../src/lib/silhouettes';
import { rasterizePath } from '../src/lib/raster';

const only = process.argv[2];
for (const s of SILHOUETTES) {
  if (only && s.id !== only) continue;
  const b = rasterizePath(s.d, 56, 28);
  let out = `\n=== ${s.id} ===\n`;
  for (let y = 0; y < b.h; y++) {
    let line = '';
    for (let x = 0; x < b.w; x++) line += b.data[y * b.w + x] ? '##' : '..';
    out += line + '\n';
  }
  console.log(out);
}
