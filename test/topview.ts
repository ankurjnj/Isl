import { makeQr } from '../src/lib/qr';
import { getModel } from '../src/lib/models3d';
import { carveSculpture } from '../src/lib/carve';
import { project } from '../src/lib/voxel';
import { flipY } from '../src/lib/bitmap';

const payload = 'https://example.com/qr3d';
const qr = makeQr(payload, 'H', 4, 10);
const r = carveSculpture(qr.bitmap, qr.quietZone, qr.moduleCount, getModel('rocket')!.sdf,
  { span: 0.55, zSub: 2, tileLayers: 2 });

// What the print actually shows from above, back in image space.
const top = flipY(project(r.grid).topAchieved);
let diff = 0, total = 0;
for (let i = 0; i < top.data.length; i++) {
  total += qr.bitmap.data[i];
  if (top.data[i] !== qr.bitmap.data[i]) diff++;
}
console.log(`top view vs the plain code: ${diff} modules differ of ${qr.moduleCount ** 2} ` +
  `(${(100 * diff / qr.moduleCount ** 2).toFixed(1)}%), ${total} dark originally\n`);

for (let y = 0; y < top.h; y++) {
  let line = '';
  for (let x = 0; x < top.w; x++) {
    const now = top.data[y * top.w + x], was = qr.bitmap.data[y * top.w + x];
    line += now && !was ? '+' : now ? '#' : '.';
  }
  console.log(line);
}
console.log('\n(# = code, + = module darkened to join the sculpture)');
