import { EXAMPLES, sculpt } from '../src/lib/compose';
import { buildFigure, countComponents, countOverhangs, project } from '../src/lib/voxel';

const only = process.argv[2];
const RES = 68;
for (const prompt of EXAMPLES) {
  if (only && !prompt.includes(only)) continue;
  const g = buildFigure(sculpt(prompt)!.sdf, RES, 1, 1.2);
  const { sideAchieved } = project(g);
  let solid = 0; for (const v of g.data) solid += v;
  console.log(`\n=== ${prompt} — ${countComponents(g)} piece(s), ${countOverhangs(g)} overhangs, ${solid} voxels ===`);
  for (let z = g.h - 1; z >= 0; z--) {
    let line = '';
    for (let x = 0; x < g.w; x++) line += sideAchieved.data[z * g.w + x] ? '#' : '.';
    if (line.includes('#')) console.log(line);
  }
}
