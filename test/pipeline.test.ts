import { makeQr } from '../src/lib/qr';
import { MODELS, getModel, matchModel } from '../src/lib/models3d';
import { carveSculpture } from '../src/lib/carve';
import { buildDesign, DEFAULT_INPUT, exportStl } from '../src/lib/pipeline';
import { concatMeshes, meshSculpture } from '../src/lib/mesh';
import { buildFigure, countComponents } from '../src/lib/voxel';
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

/**
 * What the print shows from overhead, as modules in image space.
 *
 * The grid is finer than the code, so its projection has to be collapsed back
 * to modules before it can be compared with one: a module reads dark if any
 * cell within it carries material.
 */
function topModules(d: ReturnType<typeof design>) {
  const g = d.grid, sub = d.report.xySub;
  const n = g.w / sub;
  const out = makeBitmap(n, n);
  for (let z = 0; z < g.h; z++) {
    for (let y = 0; y < g.d; y++) {
      for (let x = 0; x < g.w; x++) {
        if (g.data[(z * g.d + y) * g.w + x]) {
          out.data[Math.floor(y / sub) * n + Math.floor(x / sub)] = 1;
        }
      }
    }
  }
  return flipY(out); // physical space back to image space
}

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
    const top = topModules(d);
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
  const g = d.grid, sub = d.report.xySub;
  let violations = 0;
  for (let z = 0; z < g.h; z++) {
    for (let y = 0; y < g.d; y++) {
      for (let x = 0; x < g.w; x++) {
        // A cell lies wholly inside one module, so this maps cleanly.
        if (g.data[(z * g.d + y) * g.w + x]
            && !phys.data[Math.floor(y / sub) * (g.w / sub) + Math.floor(x / sub)]) violations++;
      }
    }
  }
  check('every voxel sits over a dark module', violations === 0, `${violations} violations`);
}

console.log('\n== bridging is cheap, and it is what makes one piece possible ==');
for (const m of MODELS) {
  const qr = makeQr(payload, 'H', 4, DEFAULT_INPUT.version);
  const bare = carveSculpture(qr.bitmap, qr.quietZone, qr.moduleCount, m.sdf,
    { span: DEFAULT_INPUT.span, zSub: DEFAULT_INPUT.zSub, xySub: DEFAULT_INPUT.xySub,
      tileLayers: DEFAULT_INPUT.tileLayers, selfSupport: DEFAULT_INPUT.selfSupport });
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
  const top = topModules(d);
  const qz = d.qr.quietZone;
  const n = d.report.moduleCount;
  const hasFinder = (cx: number, cy: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if ((top.data[(qz + cy + r) * top.w + (qz + cx + c)] === 1) !== (FINDER[r][c] === '1')) return false;
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

console.log('\n== the defaults are actually printable ==');
{
  // The code's module grid is the sculpture's resolution, so it is tempting to
  // raise the version for detail -- which is exactly what made the tile too
  // fine to print. The defaults must land on the comfortable side of that.
  const d = design();
  check('default settings are comfortable to print', d.print.verdict === 'comfortable',
    `${d.print.modulePasses.toFixed(1)} nozzle widths per module, verdict "${d.print.verdict}"`);
  check('and the sculpture is still worth looking at', d.report.spanModules >= 25,
    `${d.report.spanModules} modules across`);

  // The move that resolves the trade: a wider sculpture on a coarser code
  // matches a fine code's detail at a far more printable module size.
  const fine = design({ version: 12, span: 0.55, moduleMm: 1.6 });
  check('a coarse code matches a fine one for sculpture detail',
    d.report.spanModules >= fine.report.spanModules * 0.8,
    `${d.report.spanModules} modules at ${d.print.modulePasses.toFixed(1)} passes ` +
    `vs ${fine.report.spanModules} at ${fine.print.modulePasses.toFixed(1)}`);
  check('and the fine one is flagged, not silently shipped', fine.print.verdict !== 'comfortable',
    `verdict "${fine.print.verdict}"`);
  check('while the tile stays about the same size either way',
    Math.abs(d.dims.widthMm - fine.dims.widthMm) < 30,
    `${d.dims.widthMm.toFixed(0)} mm vs ${fine.dims.widthMm.toFixed(0)} mm`);

  // A nozzle the modules cannot resolve has to be caught.
  const fat = design({ nozzleMm: 0.8 });
  check('a nozzle too coarse for the modules is caught', fat.print.verdict !== 'comfortable',
    `0.8 mm nozzle -> ${fat.print.modulePasses.toFixed(1)} passes, "${fat.print.verdict}"`);
}

console.log('\n== bridging pays only for what is worth keeping ==');
{
  // A fragment one or two modules across costs a darkened module to reach and
  // adds almost nothing to the shape. Dropping those rather than bridging them
  // roughly halves the pattern drift, and is safe: the tile still carries the
  // module, so nothing is left loose.
  const qr = makeQr(payload, 'H', 4, DEFAULT_INPUT.version);
  const opts = { span: DEFAULT_INPUT.span, zSub: DEFAULT_INPUT.zSub, xySub: DEFAULT_INPUT.xySub,
    tileLayers: DEFAULT_INPUT.tileLayers, selfSupport: DEFAULT_INPUT.selfSupport };
  const c = carveSculpture(qr.bitmap, qr.quietZone, qr.moduleCount, getModel('castle')!.sdf, opts);
  check('specks are dropped rather than bridged', c.droppedSpecks > c.bridges * 0.5,
    `${c.droppedSpecks} dropped vs ${c.bridges} bridged`);
  const d = design({ model: getModel('castle')!.sdf });
  check('which keeps the pattern close to the plain code', d.report.driftFraction < 0.025,
    `${(d.report.driftFraction * 100).toFixed(1)}% drift`);
  check('and it is still one piece that scans', d.report.looseParts === 1 && d.verify.matches);
}

console.log('\n== a payload too long for the chosen grid still works ==');
{
  // The code-grid control is a floor, not a demand. Forcing a version too small
  // for the payload used to throw, so pasting a long link could break the app
  // outright depending on where the slider happened to sit.
  const long = 'https://a-considerably-longer-url.example.com/path/to/thing?with=query&and=more&plus=padding';
  const d = design({ payload: long, version: 2 });
  check('it grows the code instead of throwing', d.qr.version > 2 && d.verify.matches,
    `asked v2, used v${d.qr.version}`);
}

console.log('\n== detail finer than the code costs the code nothing ==');
{
  // The constraint is where material may stand, not how finely it may be
  // shaped: a sub-voxel lies wholly inside one module, and the tile already
  // raises every dark module, so a partly covered one still reads dark. So
  // sharpening the sculpture must not move the pattern at all.
  const coarse = design({ xySub: 1, zSub: 1 });
  const fine = design({ xySub: 4, zSub: 4 });
  // Compare what was achieved, not what was asked: the cell budget may cap the
  // detail, and that cap is correct behaviour rather than a failure.
  check('finer cells really are finer',
    fine.report.xySub > coarse.report.xySub
    && Math.abs(fine.report.cellMm - DEFAULT_INPUT.moduleMm / fine.report.xySub) < 1e-9,
    `${coarse.report.cellMm.toFixed(2)} mm -> ${fine.report.cellMm.toFixed(2)} mm cells ` +
    `(${coarse.report.xySub}× -> ${fine.report.xySub}×)`);
  check('the code is untouched by it',
    Math.abs(fine.report.driftFraction - coarse.report.driftFraction) < 0.005,
    `${(coarse.report.driftFraction * 100).toFixed(1)}% vs ${(fine.report.driftFraction * 100).toFixed(1)}% drift`);
  check('both still decode and hold together',
    coarse.verify.matches && fine.verify.matches
    && coarse.report.looseParts === 1 && fine.report.looseParts === 1);
  check('and the tile is the same size either way',
    Math.abs(coarse.dims.widthMm - fine.dims.widthMm) < 0.01,
    `${coarse.dims.widthMm.toFixed(1)} mm vs ${fine.dims.widthMm.toFixed(1)} mm`);
}

console.log('\n== the sculpture can take the whole code ==');
{
  // At full span there is no central region: the entire data area becomes the
  // sculpture, finder patterns included, with only the quiet zone left flat.
  const d = design({ span: 1 });
  check('it spans every module', d.report.spanModules === d.report.moduleCount,
    `${d.report.spanModules} of ${d.report.moduleCount}`);
  check('and still scans as one piece', d.verify.matches && d.report.looseParts === 1,
    `${(d.report.driftFraction * 100).toFixed(1)}% drift`);
  check('the quiet zone stays clear', (() => {
    const g = d.grid, sub = d.report.xySub, qz = d.qr.quietZone * sub;
    for (let z = 0; z < g.h; z++) {
      for (let y = 0; y < g.d; y++) {
        for (let x = 0; x < g.w; x++) {
          const inQuiet = x < qz || y < qz || x >= g.w - qz || y >= g.d - qz;
          if (inQuiet && g.data[(z * g.d + y) * g.w + x]) return false;
        }
      }
    }
    return true;
  })());
}

console.log('\n== self-supporting really means no support material ==');
{
  // Overhang is measured as material with nothing in the 3x3 beneath it --
  // steeper than 45 degrees. "Nothing directly below" would be the wrong test:
  // in a voxel model every sloped surface offsets by a cell per layer, so a
  // perfectly printable slope would count as overhang at every step.
  for (const id of ['cat', 'tree', 'rocket', 'mushroom']) {
    const on = design({ model: getModel(id)!.sdf, selfSupport: true });
    const off = design({ model: getModel(id)!.sdf, selfSupport: false });
    check(`${id}: nothing overhangs when self-supporting`, on.report.overhangs === 0,
      `${off.report.overhangs} overhangs without it, ${(on.report.shavedFraction * 100).toFixed(0)}% shaved`);
    check(`${id}: and it is still one piece that scans`,
      on.report.looseParts === 1 && on.verify.matches);
  }
  // Shaving cannot corrupt the code: removing material only ever leaves a
  // module lighter, and the tile beneath already carries every dark module.
  const a = design({ selfSupport: true });
  const b = design({ selfSupport: false });
  check('shaving leaves the code untouched',
    Math.abs(a.report.driftFraction - b.report.driftFraction) < 1e-9 && a.verify.matches,
    `${(a.report.driftFraction * 100).toFixed(1)}% both ways`);
}

console.log('\n== a build always terminates, whatever the settings ==');
{
  // Cells scale with the code's area times the sculpture's height, and detail
  // cubes all three. Unbounded, the largest code at full detail took a minute
  // and allocated hundreds of megabytes -- the UI simply waited forever.
  const t0 = Date.now();
  const heavy = buildDesign({
    ...DEFAULT_INPUT, payload, model: getModel('castle')!.sdf,
    version: 20, span: 1, xySub: 4, zSub: 4,
  });
  const ms = Date.now() - t0;
  check('the largest settings still finish promptly', ms < 12000, `${ms} ms`);
  check('detail gave way, not the size or the code', heavy.report.detailCapped
    && heavy.report.moduleCount === heavy.qr.moduleCount,
    `detail reduced to ${heavy.report.xySub}× on a ${heavy.report.moduleCount}-module code`);
  check('and the result is still valid', heavy.verify.matches && heavy.report.looseParts === 1);
}

console.log('\n== the sculpture takes the whole code, and leaves no needles ==');
{
  // Confined to a centre square the sculpture reads as a lump dropped on a flat
  // pattern. It should use every module the code can spare.
  const d = design();
  check('it spans the whole code by default', d.report.spanModules === d.report.moduleCount,
    `${d.report.spanModules} of ${d.report.moduleCount} modules`);

  // Carving leaves needles: a dark module with no dark neighbour still rises to
  // the model's surface, printing as a lone spike attached at its foot. So does
  // a prop reaching a long way up to hold a scrap.
  const towers = (g: typeof d.grid, sub: number, tile: number) => {
    const N = g.w * g.d, mods = Math.floor(g.w / sub);
    const top = new Int32Array(mods * mods).fill(-1);
    for (let z = g.h - 1; z >= 0; z--) {
      for (let y = 0; y < g.d; y++) {
        for (let x = 0; x < g.w; x++) {
          if (!g.data[z * N + y * g.w + x]) continue;
          const k = Math.floor(y / sub) * mods + Math.floor(x / sub);
          if (top[k] < 0) top[k] = z;
        }
      }
    }
    let n = 0;
    for (let my = 1; my < mods - 1; my++) {
      for (let mx = 1; mx < mods - 1; mx++) {
        const h = top[my * mods + mx];
        if (h < tile + 6) continue;
        let tallest = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          tallest = Math.max(tallest, top[(my + dy) * mods + (mx + dx)]);
        }
        if (h - tallest > 6) n++;
      }
    }
    return n;
  };
  for (const id of ['cat', 'rocket', 'tree']) {
    const m = design({ model: getModel(id)!.sdf });
    check(`${id}: few columns stand clear of everything around them`,
      towers(m.grid, m.report.xySub, DEFAULT_INPUT.tileLayers) <= 4,
      `${towers(m.grid, m.report.xySub, DEFAULT_INPUT.tileLayers)} towers, ${m.report.trimmedColumns} trimmed`);
  }
  // Trimming and scrapping only remove material, so the code cannot be harmed.
  check('and the code still reads', d.verify.matches && d.report.looseParts === 1,
    `${(d.report.driftFraction * 100).toFixed(1)}% drift`);
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
      { span: 0.55, zSub: 2, xySub: 2, tileLayers: 2, selfSupport: true });
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
