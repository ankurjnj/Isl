import { MODELS } from '../src/lib/models3d';
import { makeQr } from '../src/lib/qr';

const QZ = 4, PLINTH = 3, H = 44;
const qr = makeQr('https://example.com/qr3d', 'H', QZ);
const W = qr.bitmap.w, D = qr.bitmap.h, dataW = W - QZ * 2, artH = H - PLINTH;
const at = (x: number, y: number, z: number) => (z * D + y) * W + x;

const only = process.argv[2];
for (const m of MODELS) {
  if (only && m.id !== only) continue;
  const occ = new Uint8Array(W * D * H);
  for (let z = 0; z < artH; z++) {
    const mz = (z + 0.5) / artH;
    for (let y = 0; y < dataW; y++) {
      const my = (y + 0.5) / dataW - 0.5;
      for (let x = 0; x < dataW; x++) {
        if (m.sdf((x + 0.5) / dataW - 0.5, my, mz) < 0) occ[at(x + QZ, y + QZ, z + PLINTH)] = 1;
      }
    }
  }
  const g = new Uint8Array(occ);
  let filled = 0;
  for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
    let top = -1;
    for (let z = H - 1; z >= 0; z--) if (occ[at(x, y, z)]) { top = z; break; }
    for (let z = 0; z <= top; z++) { if (!g[at(x, y, z)]) filled++; g[at(x, y, z)] = 1; }
  }
  const masked = new Uint8Array(g.length);
  for (let i = 0, z = 0; z < H; z++) for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
    i = at(x, y, z);
    if (g[i] && qr.bitmap.data[y * W + x]) masked[i] = 1;
  }
  // Fidelity is about the outline, not the mass: grounding fills the inside of
  // a tapering solid without moving its edge at all. Compare the side
  // projection before and after instead.
  const sideOf = (v: Uint8Array) => {
    const b = new Uint8Array(W * H);
    for (let z = 0; z < H; z++) for (let y = 0; y < D; y++) for (let x = 0; x < W; x++)
      if (v[at(x, y, z)]) b[z * W + x] = 1;
    return b;
  };
  const a0 = sideOf(occ), a1 = sideOf(g);
  let want = 0, added = 0;
  for (let i = 0; i < a0.length; i++) { want += a0[i]; if (a1[i] && !a0[i]) added++; }
  void filled;
  let out = `\n=== ${m.id} — outline distorted ${(100 * added / (want || 1)).toFixed(0)}% ===\n`;
  for (let z = H - 1; z >= PLINTH; z--) {
    let line = '';
    for (let x = 0; x < W; x++) {
      let on = 0;
      for (let y = 0; y < D && !on; y++) if (masked[at(x, y, z)]) on = 1;
      line += on ? '#' : '.';
    }
    if (line.includes('#')) out += line + '\n';
  }
  console.log(out);
}
