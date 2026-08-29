import { makeQr } from '../src/lib/qr';
import { MODELS } from '../src/lib/models3d';
import { carveSculpture } from '../src/lib/carve';
import { verifyTopView } from '../src/lib/verify';
import { project } from '../src/lib/voxel';

const payload = 'https://example.com/qr3d';
const only = process.argv[2];
const ver = Number(process.argv[3] ?? 6);
const qr = makeQr(payload, 'H', 4, ver);

console.log(`code v${qr.version} · ${qr.moduleCount} modules · ${qr.moduleCount ** 2} total\n`);
console.log('model        span  bridges  dropped  supports  added  pieces  decodes');
for (const m of MODELS) {
  if (only && m.id !== only) continue;
  const r = carveSculpture(qr.bitmap, qr.quietZone, qr.moduleCount, m.sdf,
    { span: 0.72, zSub: 2, xySub: 3, tileLayers: 2 });
  const ok = verifyTopView(r.code, payload).matches;
  console.log(
    m.id.padEnd(12), String(r.spanModules).padStart(4), String(r.bridges).padStart(8),
    String(r.droppedSpecks).padStart(8), String(r.filledColumns).padStart(9),
    `${(r.fillFraction * 100).toFixed(0)}%`.padStart(7),
    String(r.looseParts).padStart(7), (ok ? 'yes' : 'NO').padStart(8),
  );
  if (only) {
    const { sideAchieved } = project(r.grid);
    for (let z = r.grid.h - 1; z >= 0; z--) {
      let line = '';
      for (let x = 0; x < r.grid.w; x++) line += sideAchieved.data[z * r.grid.w + x] ? '#' : '.';
      if (line.includes('#')) console.log(line);
    }
  }
}
