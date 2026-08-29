import { makeQr } from '../src/lib/qr';
import { MODELS, getModel, matchModel } from '../src/lib/models3d';
import { buildFigure, buildTile, countComponents, occludedCode, probeMaxSpan, project } from '../src/lib/voxel';
import { buildDesign, DEFAULT_INPUT, exportStl } from '../src/lib/pipeline';
import { concatMeshes, meshSculpture } from '../src/lib/mesh';
import { verifyTopView } from '../src/lib/verify';
import { makeBitmap } from '../src/lib/bitmap';
import { extrudeSilhouette, revolveSilhouette } from '../src/lib/voxelize';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  PASS  ${name}${detail ? '  ' + detail : ''}`);
  else { console.log(`  FAIL  ${name}  ${detail}`); failures++; }
}

const payload = 'https://example.com/qr3d';
const design = (over: Partial<Parameters<typeof buildDesign>[0]> = {}) =>
  buildDesign({ ...DEFAULT_INPUT, payload, model: MODELS[0].sdf, ...over });

console.log('\n== the code still scans with the sculpture standing on it ==');
for (const text of [
  'https://example.com',
  'https://github.com/ankurjnj/Isl',
  'WIFI:S:MyNetwork;T:WPA;P:hunter2;;',
  'https://a-considerably-longer-url.example.com/path/to/thing?with=query&and=more',
]) {
  for (const ecc of ['Q', 'H'] as const) {
    const d = design({ payload: text, ecc });
    check(`decode v${d.qr.version}-${ecc} (${text.length} chars)`, d.verify.matches,
      `sculpture covers ${(d.report.coverage * 100).toFixed(0)}% of the code`);
  }
}

console.log('\n== every sculpture is one printable piece ==');
for (const m of MODELS) {
  const d = design({ model: m.sdf });
  check(m.id, d.report.looseParts === 1 && d.verify.matches,
    `${d.report.figureVoxels}³ voxels @ ${d.report.figureVoxelMm.toFixed(2)} mm, ` +
    `${d.report.overhangs} overhangs, ${d.report.looseParts} piece(s)`);
}

console.log('\n== the sculpture is free of the module grid ==');
{
  // The point of standing the sculpture on the code rather than carving it out:
  // its resolution is set by the printer, not by the size of a QR module.
  const coarse = design({ subdiv: 1 });
  const fine = design({ subdiv: 6 });
  // Resolution tracks the requested detail (up to the voxel budget), never the
  // module pitch -- which is the whole point of standing the figure on the code.
  check('detail scales with what was asked, not the module pitch',
    fine.report.usedSubdiv > coarse.report.usedSubdiv
    && fine.report.figureVoxels === fine.report.spanModules * fine.report.usedSubdiv,
    `${coarse.report.usedSubdiv}× -> ${fine.report.usedSubdiv}× per module ` +
    `(${coarse.report.figureVoxels}³ -> ${fine.report.figureVoxels}³ voxels)`);
  check('a voxel is finer than a module', fine.report.figureVoxelMm < DEFAULT_INPUT.moduleMm,
    `${fine.report.figureVoxelMm.toFixed(2)} mm vs ${DEFAULT_INPUT.moduleMm} mm module`);
  check('the code is unchanged by it', coarse.qr.moduleCount === fine.qr.moduleCount);
  check('both still decode', coarse.verify.matches && fine.verify.matches);
}

console.log('\n== the sculpture keeps undercuts a carved one could not ==');
{
  // Carving the shape out of the code forces every column to reach the ground,
  // which is what flattened the old build. A free-standing figure need not.
  const d = design({ model: getModel('mushroom')!.sdf });
  const g = d.figure;
  let undercut = 0;
  for (let z = 1; z < g.h; z++) {
    for (let y = 0; y < g.d; y++) {
      for (let x = 0; x < g.w; x++) {
        const i = (z * g.d + y) * g.w + x;
        if (g.data[i] && !g.data[i - g.w * g.d]) undercut++;
      }
    }
  }
  check('the mushroom cap genuinely overhangs its stalk', undercut > 200, `${undercut} overhanging voxels`);
  check('and it is still one piece', countComponents(g) === 1);
}

console.log('\n== the sculpture is fitted to its real footprint, not its bounding box ==');
{
  // The square probe assumes the sculpture blocks every module in its bounding
  // box. Slender subjects do not, so fitting against the actual silhouette
  // should beat that bound -- while blocky ones correctly fall back to it.
  const qr = makeQr(payload, 'H', 4, DEFAULT_INPUT.version);
  const square = probeMaxSpan(qr.bitmap, qr.quietZone, qr.moduleCount, payload);
  const big = (id: string) => buildDesign({ ...DEFAULT_INPUT, payload, model: getModel(id)!.sdf, span: 0.9 });

  const rocket = big('rocket');
  check('a slender subject beats the square bound', rocket.report.spanModules > square,
    `${rocket.report.spanModules} vs ${square} modules`);
  check('and it still decodes', rocket.verify.matches);

  const blocky = big('house');
  check('a blocky subject falls back to it', blocky.report.spanModules <= square,
    `${blocky.report.spanModules} vs ${square} modules`);
  check('and it decodes too', blocky.verify.matches);

  const small = buildDesign({ ...DEFAULT_INPUT, payload, model: getModel('cat')!.sdf, span: 0.2 });
  check('a smaller request is honoured, not inflated', small.report.spanModules < square,
    `asked 20%, got ${small.report.spanModules} modules`);
}

console.log('\n== detail is capped so a large sculpture stays workable ==');
{
  // Voxel count grows with the cube of span x subdiv. Past the budget the
  // detail gives way, never the size the user asked for.
  const d = buildDesign({ ...DEFAULT_INPUT, payload, model: getModel('rocket')!.sdf, span: 0.9, subdiv: 8 });
  check('detail is reduced rather than the size', d.report.usedSubdiv < 8 && d.report.figureVoxels <= 120,
    `${d.report.usedSubdiv}× per module, ${d.report.figureVoxels}³ voxels`);
  check('and the model still holds together', d.report.looseParts === 1 && d.verify.matches);
}

console.log('\n== 2D input becomes a printable solid ==');
{
  // Both adapters can produce disconnected solids from innocuous input: a word
  // is separate letters, and an outline with a gap revolves into parts that
  // float. Pruning would then silently delete all but one.
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
}

console.log('\n== occlusion is capped at what the decoder tolerates ==');
{
  const qr = makeQr(payload, 'H', 4, 10);
  const max = probeMaxSpan(qr.bitmap, qr.quietZone, qr.moduleCount, payload);
  check('a limit is found', max > 4 && max < qr.moduleCount, `${max}/${qr.moduleCount} modules`);

  // One module past the measured limit must actually fail, or the probe is
  // reporting headroom that is not there.
  const over = occludedCode(qr.bitmap, buildFigure(() => -1, max + 2, 1, 1), qr.quietZone + Math.floor((qr.moduleCount - (max + 2)) / 2), 1);
  check('past the limit it stops decoding', !verifyTopView(over, payload).matches);

  const huge = design({ span: 0.95 });
  check('the app clamps rather than shipping an unscannable model', huge.verify.matches && huge.report.spanModules <= huge.report.maxSpanModules,
    `asked 95%, got ${huge.report.spanModules}/${huge.report.maxSpanModules} modules`);
}

console.log('\n== printed orientation (mirror check) ==');
{
  // A mirrored QR still decodes in jsQR, so decoding proves nothing about
  // orientation. Finder patterns do: a QR carries them at top-left, top-right
  // and bottom-left, never bottom-right.
  const qr = makeQr(payload, 'H');
  const tile = buildTile(qr.bitmap, 2);
  const c = qr.quietZone + 3;
  const solidAt = (x: number, y: number) => tile.data[(0 * tile.d + y) * tile.w + x] === 1;
  check('finder at physical top-left', solidAt(c, tile.d - 1 - c));
  check('finder at physical top-right', solidAt(tile.w - 1 - c, tile.d - 1 - c));
  check('finder at physical bottom-left', solidAt(c, c));
  check('no finder at physical bottom-right', !solidAt(tile.w - 1 - c, c));
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
  for (const id of ['tree', 'rocket', 'cat', 'teapot']) {
    const m = getModel(id)!;
    const fig = buildFigure(m.sdf, 20, 3, 1.25);
    const vox = 0.5;
    const mesh = meshSculpture(fig, { moduleMm: vox, layerMm: vox, baseMm: 0, withBase: false });
    let solid = 0; for (const v of fig.data) solid += v;
    const want = solid * vox ** 3;
    const eps = Math.max(0.01, want * 1e-4);
    check(`${id}: closed and outward-wound`, Math.abs(signedVolume(mesh.body) - want) < eps,
      `${signedVolume(mesh.body).toFixed(1)} vs ${want.toFixed(1)} mm3`);
  }
  const tileG = buildTile(makeQr(payload, 'H').bitmap, 2);
  const tileM = meshSculpture(tileG, { moduleMm: 2, layerMm: 1, baseMm: 2 });
  check('base plate is a closed box', tileM.base.triangleCount === 12);
}

console.log('\n== STL export ==');
{
  const d = design();
  const stl = exportStl(d, 'test');
  const view = new DataView(stl);
  const n = view.getUint32(80, true);
  check('stl size matches header', stl.byteLength === 84 + n * 50, `${(stl.byteLength / 1024).toFixed(0)} KB, ${n} tris`);
  check('stl carries both the tile and the sculpture',
    n === d.meshes.tile.triangleCount + d.meshes.figure.triangleCount + d.meshes.base.triangleCount);
  const mesh = concatMeshes(d.meshes.tile, d.meshes.figure, d.meshes.base);
  check('no NaN in positions', mesh.positions.every(Number.isFinite));
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

void project;
console.log(failures ? `\n${failures} FAILURES\n` : '\nAll checks passed\n');
process.exit(failures ? 1 : 0);
