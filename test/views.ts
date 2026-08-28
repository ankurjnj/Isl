import { makeQr } from '../src/lib/qr';
import { rasterizePath } from '../src/lib/raster';
import { getSilhouette } from '../src/lib/silhouettes';
import { buildSculpture, project } from '../src/lib/voxel';
import { Bitmap } from '../src/lib/bitmap';

const id = process.argv[2] ?? 'cat';
const qr = makeQr('https://example.com/qr3d', 'H');
const sil = rasterizePath(getSilhouette(id)!.d, 64, 64);
const built = buildSculpture(qr.bitmap, sil, qr.quietZone, { mode: 'shadow', height: 44 });
const { topAchieved, sideAchieved } = project(built.grid);

const show = (b: Bitmap, label: string, flip = false) => {
  console.log(`\n--- ${label} (${b.w}x${b.h}) ---`);
  const rows = [];
  for (let y = 0; y < b.h; y++) {
    let l = '';
    for (let x = 0; x < b.w; x++) l += b.data[y * b.w + x] ? '██' : '  ';
    rows.push(l);
  }
  console.log((flip ? rows.reverse() : rows).join('\n'));
};
show(topAchieved, 'TOP VIEW  -> must scan as a QR code');
show(sideAchieved, `SIDE VIEW -> must read as "${id}"`, true);
console.log('\nreport:', JSON.stringify({ ...built.report, blindColumns: built.report.blindColumns.length }));
