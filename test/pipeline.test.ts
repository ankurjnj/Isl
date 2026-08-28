import { makeQr } from '../src/lib/qr';
import { rasterizePath } from '../src/lib/raster';
import { SILHOUETTES, matchSilhouette } from '../src/lib/silhouettes';
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

const PAYLOADS = [
  'https://example.com',
  'https://github.com/ankurjnj/Isl',
  'https://claude.ai/code',
  'WIFI:S:MyNetwork;T:WPA;P:hunter2;;',
  'https://a-considerably-longer-url.example.com/path/to/thing?with=query&and=more',
];

console.log('\n== dual-view construction: does the printed geometry still scan? ==');
for (const payload of PAYLOADS) {
  for (const ecc of ['L', 'M', 'Q', 'H'] as const) {
    const qr = makeQr(payload, ecc);
    const sil = rasterizePath(SILHOUETTES[0].d, 64, 64);
    const built = buildSculpture(qr.bitmap, sil, qr.quietZone, { mode: 'shadow' });

    // Re-project from the grid rather than trusting the builder's own output.
    const { topAchieved } = project(built.grid);
    const v = verifyTopView(topAchieved, payload);
    check(
      `decode v${qr.version}-${ecc} (${payload.length} chars)`,
      v.matches,
      `top=${(built.report.topFidelity * 100).toFixed(1)}% side=${(built.report.sideFidelity * 100).toFixed(1)}% blind=${built.report.blindColumns.length}`,
    );
  }
}

console.log('\n== every bundled silhouette, both modes ==');
const payload = 'https://example.com/qr3d';
for (const s of SILHOUETTES) {
  for (const mode of ['shadow', 'skyline'] as const) {
    const qr = makeQr(payload, 'H');
    const sil = rasterizePath(s.d, 64, 64);
    const built = buildSculpture(qr.bitmap, sil, qr.quietZone, { mode });
    const { topAchieved } = project(built.grid);
    const v = verifyTopView(topAchieved, payload);
    const ok = v.matches && built.report.topFidelity === 1 && built.report.looseParts === 1;
    check(
      `${s.id}/${mode}`,
      ok,
      `side=${(built.report.sideFidelity * 100).toFixed(0)}% parts=${built.report.looseParts} struts=${built.report.struts}`,
    );
  }
}

console.log('\n== printed orientation (mirror check) ==');
{
  // A mirrored QR still decodes in jsQR, so decoding proves nothing about
  // orientation. The finder patterns do: a QR has them at top-left, top-right
  // and bottom-left, never bottom-right. Looking down at the print with +x to
  // the right puts +y upward, so image row r must sit at physical y = d-1-r.
  const qr = makeQr(payload, 'H');
  const sil = rasterizePath(SILHOUETTES[0].d, 64, 64);
  const built = buildSculpture(qr.bitmap, sil, qr.quietZone, {});
  const g = built.grid;
  const qz = qr.quietZone;
  const c = qz + 3; // centre of a finder pattern, in modules from the code edge
  const far = g.d - 1 - c;
  const solidAt = (x: number, y: number) => {
    for (let z = 0; z < g.h; z++) if (g.data[(z * g.d + y) * g.w + x]) return true;
    return false;
  };
  const nearX = c;
  const farX = g.w - 1 - c;
  check('finder at physical top-left', solidAt(nearX, far));
  check('finder at physical top-right', solidAt(farX, far));
  check('finder at physical bottom-left', solidAt(nearX, c));
  check('no finder at physical bottom-right', !solidAt(farX, c));

  // And the reported top view is back in image space, matching the input.
  let same = true;
  for (let i = 0; i < qr.bitmap.data.length; i++) {
    if (built.topAchieved.data[i] !== qr.bitmap.data[i]) { same = false; break; }
  }
  check('reported top view equals the requested code', same);
}

console.log('\n== side view actually reproduces the art ==');
{
  const qr = makeQr(payload, 'H');
  const sil = rasterizePath(SILHOUETTES[6].d, 64, 64); // rocket
  const built = buildSculpture(qr.bitmap, sil, qr.quietZone, { mode: 'shadow' });
  const { sideAchieved } = project(built.grid);
  const want = countSet(built.sideRequested);
  const got = countSet(sideAchieved);
  check('side view is non-trivial', got > want * 0.9, `${got}/${want} px`);
  check('side view never invents material', (() => {
    for (let i = 0; i < sideAchieved.data.length; i++) {
      if (sideAchieved.data[i] && !built.sideRequested.data[i]) return false;
    }
    return true;
  })(), 'achieved is a subset of requested');
}

console.log('\n== mesh + STL ==');
{
  const qr = makeQr(payload, 'H');
  const sil = rasterizePath(SILHOUETTES[2].d, 64, 64);
  const built = buildSculpture(qr.bitmap, sil, qr.quietZone, {});
  const parts = meshSculpture(built.grid, built.struts, { moduleMm: 2, layerMm: 2, baseMm: 2 });
  const mesh = concatMeshes(parts.body, parts.base);
  check('base plate is a closed box', parts.base.triangleCount === 12);
  const stl = meshToStl(mesh);
  check('mesh has triangles', mesh.triangleCount > 100, `${mesh.triangleCount} tris`);
  check('stl size matches header', stl.byteLength === 84 + mesh.triangleCount * 50, `${(stl.byteLength / 1024).toFixed(0)} KB`);
  const naive = built.report.solidVoxels * 12;
  check('greedy meshing beats naive', mesh.triangleCount < naive * 0.5, `${mesh.triangleCount} vs ${naive} naive`);
  check('no NaN in positions', mesh.positions.every(Number.isFinite));
}

console.log('\n== the mesh is a closed, correctly-wound solid ==');
{
  // Signed volume via the divergence theorem. For a closed surface with
  // outward-facing triangles this equals the true volume exactly; a hole makes
  // it wrong, and inverted winding makes it negative. That single number
  // therefore checks watertightness and orientation at once -- both of which a
  // slicer needs and neither of which the triangle count would reveal.
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

  const moduleMm = 2, layerMm = 1.5, baseMm = 2.4, strutFrac = 0.34;
  for (const id of ['cat', 'rocket', 'butterfly', 'skull']) {
    const qr = makeQr(payload, 'H');
    const sil = rasterizePath(SILHOUETTES.find((s) => s.id === id)!.d, 64, 64);
    const built = buildSculpture(qr.bitmap, sil, qr.quietZone, {});
    const parts = meshSculpture(built.grid, built.struts, { moduleMm, layerMm, baseMm, strutFrac });

    const voxelVol = built.report.solidVoxels * moduleMm * moduleMm * layerMm;
    const strutVol = built.struts.reduce(
      (a, st) => a + (st.z1 - st.z0) * layerMm * (strutFrac * moduleMm) ** 2, 0);
    const baseVol = built.grid.w * moduleMm * built.grid.d * moduleMm * baseMm;

    const gotBody = signedVolume(parts.body);
    const gotBase = signedVolume(parts.base);
    // Positions are float32 and the sum runs over tens of thousands of
    // triangles, so the tolerance is relative. It still resolves ~1/100th of a
    // single voxel, far finer than the smallest hole this could miss.
    const eps = Math.max(0.05, voxelVol * 1e-5);
    // Struts are separate closed boxes that may overlap the body where they
    // meet it, so the body total is bounded rather than exact.
    const okBody = gotBody >= voxelVol - eps && gotBody <= voxelVol + strutVol + eps;
    check(`${id}: body is closed and outward-wound`, okBody,
      `${gotBody.toFixed(0)} mm3 in [${voxelVol.toFixed(0)}, ${(voxelVol + strutVol).toFixed(0)}]`);
    check(`${id}: base plate volume exact`, Math.abs(gotBase - baseVol) < eps,
      `${gotBase.toFixed(1)} vs ${baseVol.toFixed(1)} mm3`);
  }
}

console.log('\n== STL round-trips ==');
{
  const qr = makeQr(payload, 'H');
  const sil = rasterizePath(SILHOUETTES[0].d, 64, 64);
  const built = buildSculpture(qr.bitmap, sil, qr.quietZone, {});
  const parts = meshSculpture(built.grid, built.struts, { moduleMm: 2, layerMm: 2, baseMm: 2 });
  const mesh = concatMeshes(parts.body, parts.base);
  const stl = meshToStl(mesh, 'roundtrip');
  const view = new DataView(stl);
  check('header declares the right triangle count', view.getUint32(80, true) === mesh.triangleCount);
  // Spot-check the last triangle, where any offset arithmetic error would land.
  const last = 84 + (mesh.triangleCount - 1) * 50;
  let matches = true;
  for (let k = 0; k < 9; k++) {
    if (Math.abs(view.getFloat32(last + 12 + k * 4, true) - mesh.positions[(mesh.triangleCount - 1) * 9 + k]) > 1e-4) matches = false;
  }
  check('last triangle survives the round trip', matches);
}

console.log('\n== prompt matching ==');
{
  const cases: [string, string][] = [
    ['a cute cat sitting down', 'cat'],
    ['make it a rocket ship blasting off', 'rocket'],
    ['I want a heart for my wedding invite', 'heart'],
    ['spooky halloween skull', 'skull'],
    ['a t-rex dinosaur', 'dino'],
    ['coffee mug for the cafe', 'coffee'],
  ];
  for (const [prompt, want] of cases) {
    const m = matchSilhouette(prompt);
    check(`"${prompt}"`, m?.silhouette.id === want, `-> ${m?.silhouette.id ?? 'none'}`);
  }
  check('no false match on gibberish', matchSilhouette('zzz qqq') === null);
}

console.log(failures ? `\n${failures} FAILURES\n` : '\nAll checks passed\n');
process.exit(failures ? 1 : 0);
