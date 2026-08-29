import { parsePrompt, composeRecipe } from '../src/lib/compose';
import { buildFigure, countComponents } from '../src/lib/voxel';

const prompts = process.argv.slice(2).length ? process.argv.slice(2) : [
  'a cat', 'a cat in a wizard hat', 'a dragon with a crown riding a rocket',
  'a robot', 'an owl', 'a whale', 'a tall tree', 'a castle',
  'a chubby penguin with a scarf', 'a knight on a hill',
];
const RES = 64;
for (const p of prompts) {
  const r = parsePrompt(p);
  if (!r) { console.log(`\n=== "${p}" — no match ===`); continue; }
  const sdf = composeRecipe(r);
  const g = buildFigure(sdf, RES, 1, 1.2);
  const N = g.w * g.d;
  // Front (x-z) beside profile (y-z), so a tail or a snout is not invisible.
  const front: string[] = [], side: string[] = [];
  for (let z = g.h - 1; z >= 0; z--) {
    let a = '', b = '';
    for (let x = 0; x < g.w; x++) {
      let hit = false;
      for (let y = 0; y < g.d && !hit; y++) if (g.data[z * N + y * g.w + x]) hit = true;
      a += hit ? '#' : '.';
    }
    for (let y = g.d - 1; y >= 0; y--) {
      let hit = false;
      for (let x = 0; x < g.w && !hit; x++) if (g.data[z * N + y * g.w + x]) hit = true;
      b += hit ? '#' : '.';
    }
    front.push(a); side.push(b);
  }
  console.log(`\n=== "${p}" -> ${r.label} [${r.plan}] — ${countComponents(g)} piece(s) ===`);
  console.log('front'.padEnd(g.w) + '  profile (facing left)');
  for (let i = 0; i < front.length; i++) {
    if (!front[i].includes('#') && !side[i].includes('#')) continue;
    console.log(front[i] + '  ' + side[i]);
  }
}
