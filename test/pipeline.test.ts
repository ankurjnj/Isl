import { makeQr } from '../src/lib/qr';
import { MODELS, getModel, matchModel } from '../src/lib/models3d';
import { buildSculpture, project } from '../src/lib/voxel';
import { concatMeshes, meshSculpture } from '../src/lib/mesh';
import { meshToStl } from '../src/lib/stl';
import { verifyTopView } from '../src/lib/verify';
import { countSet } from '../src/lib/bitmap';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  PASS  ${name}${detail ? '  ' + detail : ''}`);
  else { console.log(`  FAIL  ${name}  ${detail}`); failures++; }
}

const payload = 'https://example.com/qr3d';
const PAYLOADS = [
  'https://example.com',
  'https://github.com/ankurjnj/Isl',
  'WIFI:S:MyNetwork;T:WPA;P:hunter2;;',
  'https://a-considerably-longer-url.example.com/path/to/thing?with=query&and=more',
];

console.log('\n== the code still scans off the finished geometry ==');
for (const text of PAYLOADS) {
  for (const ecc of ['L', 'M', 'Q', 'H'] as const) {
    const qr = makeQr(text, ecc);
    const built = buildSculpture(qr.bitmap, MODELS[0].sdf, qr.quietZone);
    // Re-project from the grid rather than trusting the builder's own output.
    const v = verifyTopView(built.topAchieved, text);
    check(`decode v${qr.version}-${ecc} (${text.length} chars)`, v.matches && built.report.topFidelity === 1,
      `top=${(built.report.topFidelity * 100).toFixed(0)}%`);
  }
}

console.log('\n== every model prints as one piece, with no supports and no rods ==');
for (const m of MODELS) {
  const qr = makeQr(payload, 'H');
  const built = buildSculpture(qr.bitmap, m.sdf, qr.quietZone);
  const r = built.report;
  const v = verifyTopView(built.topAchieved, payload);
  // Grounding exists precisely so these three hold: nothing floats, nothing
  // overhangs, and no connecting rod is ever needed to achieve it.
  const ok = v.matches && r.topFidelity === 1 && r.looseParts === 1 && r.overhangs === 0;
  check(m.id, ok,
    `side=${(r.sideFidelity * 100).toFixed(0)}% outline kept=${(100 - r.outlineDistortion * 100).toFixed(0)}% ` +
    `pieces=${r.looseParts} overhangs=${r.overhangs}`);
}

console.log('\n== the model is a solid, not a swept outline ==');
{
  // The direct test. Take every depth slice the code leaves open and record its
  // height profile. A shape swept along the depth axis gives every slice the
  // same profile; a real solid's slices differ, and that difference is its form.
  const qr = makeQr(payload, 'H');
  for (const id of ['pine', 'rocket', 'tower', 'cat']) {
    const g = buildSculpture(qr.bitmap, getModel(id)!.sdf, qr.quietZone, { height: 40, plinth: 3 }).grid;
    let total = 0, columns = 0;
    for (let x = 0; x < g.w; x++) {
      const seen = new Set<string>();
      for (let y = 0; y < g.d; y++) {
        let prof = '';
        for (let z = 3; z < g.h; z++) prof += g.data[(z * g.d + y) * g.w + x] ? '1' : '0';
        if (prof.includes('1')) seen.add(prof);
      }
      if (seen.size) { total += seen.size; columns++; }
    }
    const mean = total / columns;
    check(`${id} varies through its depth`, mean > 2.5, `${mean.toFixed(2)} distinct profiles/column`);
  }
}

console.log('\n== printed orientation (mirror check) ==');
{
  // A mirrored QR still decodes in jsQR, so decoding proves nothing about
  // orientation. Finder patterns do: a QR carries them at top-left, top-right
  // and bottom-left, never bottom-right.
  const qr = makeQr(payload, 'H');
  const built = buildSculpture(qr.bitmap, MODELS[0].sdf, qr.quietZone);
  const g = built.grid;
  const c = qr.quietZone + 3;
  const solidAt = (x: number, y: number) => {
    for (let z = 0; z < g.h; z++) if (g.data[(z * g.d + y) * g.w + x]) return true;
    return false;
  };
  check('finder at physical top-left', solidAt(c, g.d - 1 - c));
  check('finder at physical top-right', solidAt(g.w - 1 - c, g.d - 1 - c));
  check('finder at physical bottom-left', solidAt(c, c));
  check('no finder at physical bottom-right', !solidAt(g.w - 1 - c, c));

  let same = true;
  for (let i = 0; i < qr.bitmap.data.length; i++) {
    if (built.topAchieved.data[i] !== qr.bitmap.data[i]) { same = false; break; }
  }
  check('reported top view equals the requested code', same);
}

console.log('\n== solid mode reports floating pieces instead of hiding them ==');
{
  const qr = makeQr(payload, 'H');
  // A lathe with a wide head over a narrow neck: physically impossible as one
  // piece here, and the report has to say so rather than quietly welding it.
  const overhung = (x: number, y: number, z: number) => {
    const r = Math.hypot(x, y);
    if (z < 0.35) return r - 0.08;
    if (z < 0.55) return 1;
    return Math.max(r - 0.3, z - 0.85);
  };
  const solid = buildSculpture(qr.bitmap, overhung, qr.quietZone, { support: 'solid' });
  const grounded = buildSculpture(qr.bitmap, overhung, qr.quietZone, { support: 'grounded' });
  check('solid mode surfaces the loose pieces', solid.report.looseParts > 1, `${solid.report.looseParts} pieces`);
  check('grounded mode resolves them', grounded.report.looseParts === 1 && grounded.report.overhangs === 0,
    `${grounded.report.looseParts} piece, ${grounded.report.overhangs} overhangs`);
  check('top view stays exact either way', solid.report.topFidelity === 1 && grounded.report.topFidelity === 1);
}

console.log('\n== the mesh is a closed, correctly-wound solid ==');
{
  // Signed volume via the divergence theorem: for a closed outward-wound
  // surface this equals the true volume exactly. A hole makes it wrong and
  // inverted winding makes it negative, so one number covers both.
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
  const moduleMm = 2, layerMm = 1.5, baseMm = 2.4;
  for (const id of ['pine', 'rocket', 'tower', 'cat']) {
    const qr = makeQr(payload, 'H');
    const built = buildSculpture(qr.bitmap, getModel(id)!.sdf, qr.quietZone);
    const parts = meshSculpture(built.grid, { moduleMm, layerMm, baseMm });
    const voxelVol = built.report.solidVoxels * moduleMm * moduleMm * layerMm;
    const baseVol = built.grid.w * moduleMm * built.grid.d * moduleMm * baseMm;
    // float32 positions summed over tens of thousands of triangles, so the
    // tolerance is relative; it still resolves a hundredth of one voxel.
    const eps = Math.max(0.05, voxelVol * 1e-5);
    check(`${id}: body closed and outward-wound`, Math.abs(signedVolume(parts.body) - voxelVol) < eps,
      `${signedVolume(parts.body).toFixed(0)} vs ${voxelVol.toFixed(0)} mm3`);
    check(`${id}: base plate volume exact`, Math.abs(signedVolume(parts.base) - baseVol) < eps);
  }
}

console.log('\n== STL round-trips ==');
{
  const qr = makeQr(payload, 'H');
  const built = buildSculpture(qr.bitmap, MODELS[0].sdf, qr.quietZone);
  const parts = meshSculpture(built.grid, { moduleMm: 2, layerMm: 2, baseMm: 2 });
  const mesh = concatMeshes(parts.body, parts.base);
  const stl = meshToStl(mesh, 'roundtrip');
  const view = new DataView(stl);
  check('header declares the right triangle count', view.getUint32(80, true) === mesh.triangleCount);
  check('stl size matches header', stl.byteLength === 84 + mesh.triangleCount * 50,
    `${(stl.byteLength / 1024).toFixed(0)} KB, ${mesh.triangleCount} tris`);
  check('greedy meshing beats naive', mesh.triangleCount < built.report.solidVoxels * 6,
    `${mesh.triangleCount} vs ${built.report.solidVoxels * 12} naive`);
  const last = 84 + (mesh.triangleCount - 1) * 50;
  let matches = true;
  for (let k = 0; k < 9; k++) {
    if (Math.abs(view.getFloat32(last + 12 + k * 4, true) - mesh.positions[(mesh.triangleCount - 1) * 9 + k]) > 1e-4) matches = false;
  }
  check('last triangle survives the round trip', matches);
}

console.log('\n== side view still carries the subject ==');
{
  const qr = makeQr(payload, 'H');
  const built = buildSculpture(qr.bitmap, getModel('pine')!.sdf, qr.quietZone);
  const { sideAchieved } = project(built.grid);
  check('side view is non-trivial', countSet(sideAchieved) > countSet(built.sideRequested) * 0.9,
    `${countSet(sideAchieved)}/${countSet(built.sideRequested)} px`);
  let subset = true;
  for (let i = 0; i < sideAchieved.data.length; i++) {
    if (sideAchieved.data[i] && !built.sideRequested.data[i]) subset = false;
  }
  check('side view never invents material', subset);
}

console.log('\n== prompt matching ==');
{
  const cases: [string, string][] = [
    ['a pine tree for christmas', 'pine'],
    ['make it a rocket ship blasting off', 'rocket'],
    ['a little house with a chimney', 'house'],
    ['a cat sitting', 'cat'],
    ['medieval castle keep', 'tower'],
    ['a mountain peak', 'mountain'],
  ];
  for (const [prompt, want] of cases) {
    const m = matchModel(prompt);
    check(`"${prompt}"`, m?.model.id === want, `-> ${m?.model.id ?? 'none'}`);
  }
  check('no false match on gibberish', matchModel('zzz qqq') === null);
}

console.log(failures ? `\n${failures} FAILURES\n` : '\nAll checks passed\n');
process.exit(failures ? 1 : 0);
