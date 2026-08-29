import { makeQr } from '../src/lib/qr';
import { MODELS, getModel, matchModel } from '../src/lib/models3d';
import { carveSculpture } from '../src/lib/carve';
import { buildDesign, DEFAULT_INPUT, exportStl } from '../src/lib/pipeline';
import { concatMeshes, meshSculpture } from '../src/lib/mesh';
import { buildFigure, countComponents, project } from '../src/lib/voxel';
import { flipY, makeBitmap } from '../src/lib/bitmap';
import { extrudeSilhouette, revolveSilhouette } from '../src/lib/voxelize';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  PASS  ${name}${detail ? '  ' + detail : ''}`);
  else { console.log(`  FAIL  ${name}  ${detail}`); failures++; }
}

const payload = 'https://example.com/qr3d';
const design = (over: Partial<Parameters<typeof buildDesign>[0]> = {}) =>
  buildDesign({ ...DEFAULT_INPUT, payload, model: MODELS[0].sdf, ...over });

console.log('\n== the code still scans with the sculpture carved into it ==');
for (const text of [
  'https://example.com',
  'https://github.com/ankurjnj/Isl',
  'WIFI:S:MyNetwork;T:WPA;P:hunter2;;',
  'https://a-considerably-longer-url.example.com/path/to/thing?with=query&and=more',
]) {
  for (const ecc of ['Q', 'H'] as const) {
    const d = design({ payload: text, ecc });
    check(`decode v${d.qr.version}-${ecc} (${text.length} chars)`, d.verify.matches,
      `${d.report.bridges} bridges, ${(d.report.driftFraction * 100).toFixed(1)}% drift`);
  }
}

console.log('\n== the sculpture camouflages: the top view is still the code ==');
{
  // The whole point of carving rather than standing the sculpture on top. What
  // the print shows from above must be the code itself, not the code with an
  // object blocking part of it -- so almost every module has to be untouched.
  for (const id of ['rocket', 'cat', 'tree', 'castle']) {
    const d = design({ model: getModel(id)!.sdf });
    const top = flipY(project(d.grid).topAchieved);
    let diff = 0;
    for (let i = 0; i < top.data.length; i++) if (top.data[i] !== d.qr.bitmap.data[i]) diff++;
    const drift = diff / (d.report.moduleCount ** 2);
    check(`${id}: top view is the code`, drift < 0.04 && d.verify.matches,
      `${diff} of ${d.report.moduleCount ** 2} modules differ (${(drift * 100).toFixed(1)}%)`);
    // And what it shows is exactly what was verified.
    let same = true;
    for (let i = 0; i < top.data.length; i++) if (top.data[i] !== d.code.data[i]) same = false;
    check(`${id}: what is verified is what is printed`, same);
  }
}

console.log('\n== nothing stands over a light module ==');
{
  // The camouflage rests on this: any material above a light module would be
  // visible from directly overhead and would corrupt the pattern.
  const d = design({ model: getModel('rocket')!.sdf });
  const phys = flipY(d.code);
  let violations = 0;
  for (let z = 0; z < d.grid.h; z++) {
    for (let i = 0; i < d.grid.w * d.grid.d; i++) {
      if (d.grid.data[z * d.grid.w * d.grid.d + i] && !phys.data[i]) violations++;
    }
  }
  check('every voxel sits over a dark module', violations === 0, `${violations} violations`);
}

console.log('\n== bridging is cheap, and it is what makes one piece possible ==');
for (const m of MODELS) {
  const qr = makeQr(payload, 'H', 4, DEFAULT_INPUT.version);
  const bare = carveSculpture(qr.bitmap, qr.quietZone, qr.moduleCount, m.sdf,
    { span: DEFAULT_INPUT.span, zSub: DEFAULT_INPUT.zSub, tileLayers: DEFAULT_INPUT.tileLayers });
  const d = design({ model: m.sdf });
  check(m.id, d.report.looseParts === 1 && d.verify.matches && d.report.fillFraction < 0.08,
    `${bare.bridges} bridges, ${d.report.supports} supports, +${(d.report.fillFraction * 100).toFixed(0)}% material`);
}

console.log('\n== supports are minimal, not blanket grounding ==');
{
  // A floating part needs one column reaching the tile, not all of them.
  // Filling every column is what turned a tree into a solid mass.
  const d = design({ model: getModel('tree')!.sdf });
  check('a tree keeps its shape', d.report.fillFraction < 0.05,
    `+${(d.report.fillFraction * 100).toFixed(0)}% material from ${d.report.supports} supports`);
  check('and is still one piece', d.report.looseParts === 1);
}

console.log('\n== more modules means more detail ==');
{
  // x and y are the module grid now, so the code's version IS the sculpture's
  // resolution -- there is no separate detail axis to turn up.
  const small = design({ version: 8 });
  const large = design({ version: 14 });
  check('a larger code carries a finer sculpture', large.report.spanModules > small.report.spanModules * 1.3,
    `${small.report.spanModules} -> ${large.report.spanModules} modules across`);
  check('both decode', small.verify.matches && large.verify.matches);
}

console.log('\n== printed orientation (mirror check) ==');
{
  // A mirrored QR still decodes in jsQR, so decoding proves nothing about
  // orientation. Finder patterns do: a QR carries them at top-left, top-right
  // and bottom-left, never bottom-right. Matching the whole 7x7 rather than
  // sampling its centre -- a single dark module turns up at the empty corner
  // about half the time, which made the old check pass by luck.
  const FINDER = [
    '1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111',
  ];
  const d = design();
  const g = d.grid;
  const qz = d.qr.quietZone;
  const n = d.report.moduleCount;
  // Read the printed tile from above, in physical space.
  const dark = (x: number, y: number) => g.data[(0 * g.d + y) * g.w + x] === 1;
  const hasFinder = (cx: number, cy: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        // Physical y runs opposite to the picture's rows.
        if (dark(qz + cx + c, g.d - 1 - (qz + cy + r)) !== (FINDER[r][c] === '1')) return false;
      }
    }
    return true;
  };
  check('finder at top-left', hasFinder(0, 0));
  check('finder at top-right', hasFinder(n - 7, 0));
  check('finder at bottom-left', hasFinder(0, n - 7));
  check('no finder at bottom-right', !hasFinder(n - 7, n - 7));
}

console.log('\n== 2D input becomes a printable solid ==');
{
  const two = makeBitmap(64, 64);
  for (let y = 16; y < 48; y++) {
    for (let x = 8; x < 24; x++) two.data[y * 64 + x] = 1;
    for (let x = 40; x < 56; x++) two.data[y * 64 + x] = 1;
  }
  const lettering = buildFigure(extrudeSilhouette(two), 24, 3, 1);
  check('two glyphs stay one piece on their plinth',
    countComponents(lettering) === 1 && (lettering.islandFraction ?? 0) < 0.01,
    `${((lettering.islandFraction ?? 0) * 100).toFixed(0)}% dropped`);

  const gapped = makeBitmap(64, 64);
  for (let y = 0; y < 64; y++) {
    if (y > 28 && y < 34) continue;
    for (let x = 22; x < 42; x++) gapped.data[y * 64 + x] = 1;
  }
  const lathe = buildFigure(revolveSilhouette(gapped), 24, 3, 1);
  check('a gapped outline is held by its spine',
    countComponents(lathe) === 1 && (lathe.islandFraction ?? 0) < 0.01,
    `${((lathe.islandFraction ?? 0) * 100).toFixed(0)}% dropped`);

  check('both carve into a scannable design',
    design({ model: extrudeSilhouette(two) }).verify.matches
    && design({ model: revolveSilhouette(gapped) }).verify.matches);
}

console.log('\n== the mesh is a closed, correctly-wound solid ==');
{
  const signedVolume = (m: { positions: Float32Array; triangleCount: number }) => {
    let v = 0;
    for (let t = 0; t < m.triangleCount; t++) {
      const o = t * 9;
      const [ax, ay, az] = [m.positions[o], m.positions[o + 1], m.positions[o + 2]];
      const [bx, by, bz] = [m.positions[o + 3], m.positions[o + 4], m.positions[o + 5]];
      const [cx, cy, cz] = [m.positions[o + 6], m.positions[o + 7], m.positions[o + 8]];
      v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    }
    return v;
  };
  for (const id of ['rocket', 'cat', 'castle']) {
    const qr = makeQr(payload, 'H', 4, 8);
    const carved = carveSculpture(qr.bitmap, qr.quietZone, qr.moduleCount, getModel(id)!.sdf,
      { span: 0.55, zSub: 2, tileLayers: 2 });
    const mm = 1.5, lm = 0.9;
    const mesh = meshSculpture(carved.grid, { moduleMm: mm, layerMm: lm, baseMm: 0, withBase: false });
    let solid = 0; for (const v of carved.grid.data) solid += v;
    const want = solid * mm * mm * lm;
    check(`${id}: closed and outward-wound`, Math.abs(signedVolume(mesh.body) - want) < Math.max(0.05, want * 1e-5),
      `${signedVolume(mesh.body).toFixed(0)} vs ${want.toFixed(0)} mm3`);
  }
}

console.log('\n== STL export ==');
{
  const d = design();
  const stl = exportStl(d, 'test');
  const n = new DataView(stl).getUint32(80, true);
  check('stl size matches header', stl.byteLength === 84 + n * 50, `${(stl.byteLength / 1024).toFixed(0)} KB, ${n} tris`);
  check('stl carries body and base', n === d.meshes.body.triangleCount + d.meshes.base.triangleCount);
  check('no NaN in positions', concatMeshes(d.meshes.body, d.meshes.base).positions.every(Number.isFinite));
}

console.log('\n== prompt matching ==');
{
  const cases: [string, string][] = [
    ['a tree in a park', 'tree'],
    ['a christmas fir', 'pine'],
    ['make it a rocket ship blasting off', 'rocket'],
    ['a cat sitting', 'cat'],
    ['medieval castle', 'castle'],
    ['a teapot for tea', 'teapot'],
  ];
  for (const [prompt, want] of cases) {
    const m = matchModel(prompt);
    check(`"${prompt}"`, m?.model.id === want, `-> ${m?.model.id ?? 'none'}`);
  }
  check('no false match on gibberish', matchModel('zzz qqq') === null);
}

console.log(failures ? `\n${failures} FAILURES\n` : '\nAll checks passed\n');
process.exit(failures ? 1 : 0);
