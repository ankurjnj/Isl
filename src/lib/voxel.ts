import { Bitmap, flipY, makeBitmap } from './bitmap';
import { verifyTopView } from './verify';
import { Sdf } from './sdf';

/**
 * Axis convention, fixed everywhere in this file:
 *
 *   x  code column  (left -> right when looking down at the top view)
 *   y  code row     (back -> front; the depth axis of the printed object)
 *   z  height       (0 = the layer sitting on the base plate)
 *
 * The print is two separate solids sharing one base plate:
 *
 *   - the TILE, at module resolution, which is the code and must stay exactly
 *     readable;
 *   - the FIGURE, at a finer pitch, which is a real sculpture and carries no
 *     constraints at all.
 *
 * That split is the whole design. Carving the sculpture out of the code, which
 * is the obvious approach, cannot work: anything above the code plane occludes
 * it, so material may only stand over dark modules at any height, and two parts
 * of such a sculpture can touch only where their modules are face-adjacent.
 * Measured on real codes that leaves 86 to 362 disconnected pieces, so the
 * shape has to be flattened into a grounded relief to print at all -- which is
 * what destroys its detail.
 *
 * Letting the sculpture simply stand on the code instead costs only error
 * correction, and a QR has that to spare.
 */

export interface VoxelGrid {
  w: number;
  d: number;
  h: number;
  /** 1 = solid. Index with `idx()`. */
  data: Uint8Array;
  /** Share of the voxelised model discarded as disconnected specks. */
  islandFraction?: number;
}

export function idx(g: VoxelGrid, x: number, y: number, z: number): number {
  return (z * g.d + y) * g.w + x;
}

export function getVoxel(g: VoxelGrid, x: number, y: number, z: number): number {
  if (x < 0 || y < 0 || z < 0 || x >= g.w || y >= g.d || z >= g.h) return 0;
  return g.data[idx(g, x, y, z)];
}

/**
 * The scannable tile: the code's dark modules, raised on the base plate.
 *
 * The tile carries the whole burden of being readable, which frees the
 * sculpture entirely -- see `buildFigure`.
 */
export function buildTile(qr: Bitmap, layers: number): VoxelGrid {
  const w = qr.w, d = qr.h, h = Math.max(1, layers);
  // Image space (row 0 at the top of the picture) to physical space, where an
  // observer looking down with +x to their right sees +y going up their view.
  // Without this flip the print is a vertical mirror of the code, and a
  // mirrored QR is not a rotated one -- turning the print cannot fix it.
  const phys = flipY(qr);
  const g: VoxelGrid = { w, d, h, data: new Uint8Array(w * d * h) };
  for (let z = 0; z < h; z++) {
    for (let y = 0; y < d; y++) {
      for (let x = 0; x < w; x++) {
        if (phys.data[y * w + x]) g.data[idx(g, x, y, z)] = 1;
      }
    }
  }
  return g;
}

/**
 * The sculpture, voxelised free-standing.
 *
 * This is the part that carries no constraints at all. It is not masked by the
 * code, so nothing shreds its detail; it is not grounded, so it keeps its
 * undercuts; and its grid is finer than the module pitch, so its resolution is
 * set by what the printer can hold rather than by the size of a QR module.
 *
 * All of that is bought by the code's error correction. The sculpture simply
 * stands on the tile and hides part of it, and a QR at ECC Q or H reads through
 * roughly a fifth of its area being covered -- the same allowance that lets a
 * logo sit in the middle of a printed code. `probeMaxSpan` measures the real
 * limit for a given payload rather than trusting that figure.
 *
 * Model space is x, y in [-0.5, 0.5] and z in [0, 1], z = 0 the ground.
 */
export function buildFigure(
  sdf: Sdf,
  spanModules: number,
  subdiv: number,
  heightScale = 1,
): VoxelGrid {
  const n = Math.max(4, Math.round(spanModules * subdiv));

  // Normalise the model into its footprint using the bounds the primitives
  // carry. Authored coordinates are convenient, not calibrated -- a tree whose
  // canopy happens to have radius 0.26 would otherwise occupy half the space a
  // 0.5 model does, and read as small for no reason the author intended. This
  // makes every model fill the footprint it is given, and derives its height
  // from its own proportions rather than a guess.
  const b = sdf.bounds;
  let scale = 1, z0 = 0, aspect = heightScale;
  if (b && Number.isFinite(b[0]) && b[3] > b[0]) {
    const radial = Math.max(Math.abs(b[0]), Math.abs(b[3]), Math.abs(b[1]), Math.abs(b[4]));
    if (radial > 0) scale = 0.5 / radial;
    z0 = b[2];
    aspect = Math.max(0.2, (b[5] - b[2]) * scale) * heightScale;
  }
  const h = Math.max(4, Math.round(n * aspect));

  const g: VoxelGrid = { w: n, d: n, h, data: new Uint8Array(n * n * h) };
  // One sample per voxel, accepted slightly outside the surface. A strict
  // centre test drops any feature thinner than the pitch -- a fin, an ear, a
  // railing post -- while supersampling to catch them costs eight evaluations
  // per voxel, which on a model built from dozens of primitives is seconds of
  // work. Half a voxel of tolerance rescues the same thin features for one.
  const tol = 0.45 / (n * scale);
  for (let z = 0; z < h; z++) {
    const mz = z0 + ((z + 0.5) / h) * (aspect / scale);
    for (let y = 0; y < n; y++) {
      const my = ((y + 0.5) / n - 0.5) / scale;
      for (let x = 0; x < n; x++) {
        if (sdf(((x + 0.5) / n - 0.5) / scale, my, mz) < tol) g.data[idx(g, x, y, z)] = 1;
      }
    }
  }
  return pruneIslands(g);
}

/**
 * Keep only the largest connected body.
 *
 * Accepting voxels slightly outside the surface rescues thin features, but near
 * the rim of a subtracted cavity it can also strand a speck a voxel or two
 * across. Those cannot print and are not features, so they are dropped. Real
 * modelling errors -- a limb that genuinely fails to meet the body -- discard a
 * meaningful share of the model, which `islandFraction` reports so they are
 * caught rather than quietly deleted.
 */
function pruneIslands(g: VoxelGrid): VoxelGrid {
  const label = new Int32Array(g.data.length);
  const N = g.w * g.d;
  const sizes: number[] = [0];
  const stack: number[] = [];
  for (let start = 0; start < g.data.length; start++) {
    if (!g.data[start] || label[start]) continue;
    const id = sizes.length;
    let size = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % g.w, y = Math.floor(p / g.w) % g.d, z = Math.floor(p / N);
      const nb = [
        x > 0 ? p - 1 : -1, x < g.w - 1 ? p + 1 : -1,
        y > 0 ? p - g.w : -1, y < g.d - 1 ? p + g.w : -1,
        z > 0 ? p - N : -1, z < g.h - 1 ? p + N : -1,
      ];
      for (const q of nb) if (q >= 0 && g.data[q] && !label[q]) { label[q] = id; stack.push(q); }
    }
    sizes.push(size);
  }
  if (sizes.length <= 2) return g;

  let best = 1, total = 0;
  for (let i = 1; i < sizes.length; i++) {
    total += sizes[i];
    if (sizes[i] > sizes[best]) best = i;
  }
  const out: VoxelGrid = { ...g, data: new Uint8Array(g.data.length) };
  for (let i = 0; i < g.data.length; i++) if (label[i] === best) out.data[i] = 1;
  out.islandFraction = (total - sizes[best]) / (total || 1);
  return out;
}

/**
 * Which modules the sculpture hides, seen from directly above.
 *
 * Occlusion is treated as solid dark because the sculpture prints in the dark
 * filament, so a covered light module reads dark to a scanner. That is the
 * worst case, and it is the one the decode check has to survive.
 */
export function occludedCode(qr: Bitmap, figure: VoxelGrid, originModule: number, subdiv: number): Bitmap {
  const out = makeBitmap(qr.w, qr.h);
  out.data.set(qr.data);
  const span = Math.ceil(figure.w / subdiv);
  for (let my = 0; my < span; my++) {
    for (let mx = 0; mx < span; mx++) {
      let covered = false;
      for (let sy = 0; sy < subdiv && !covered; sy++) {
        for (let sx = 0; sx < subdiv && !covered; sx++) {
          const fx = mx * subdiv + sx, fy = my * subdiv + sy;
          if (fx >= figure.w || fy >= figure.d) continue;
          for (let z = 0; z < figure.h; z++) {
            if (figure.data[idx(figure, fx, fy, z)]) { covered = true; break; }
          }
        }
      }
      // The figure grid is physical space; the code bitmap is image space.
      if (covered) {
        const x = originModule + mx;
        const y = qr.h - 1 - (originModule + my);
        if (x >= 0 && y >= 0 && x < qr.w && y < qr.h) out.data[y * qr.w + x] = 1;
      }
    }
  }
  return out;
}

/**
 * The largest sculpture footprint this payload still decodes through.
 *
 * Error-correction headroom is not a fixed percentage of the picture: it
 * depends on the version, the mask pattern, and which modules a given block
 * spans. So the limit is measured against a real decoder for the actual code
 * rather than assumed from the ECC level's nominal rate.
 */
const spanCache = new Map<string, number>();

export function probeMaxSpan(qr: Bitmap, quietZone: number, moduleCount: number, payload: string): number {
  // Each probe step is a full decode, so this is far too slow to redo on every
  // keystroke; the answer depends only on the code itself.
  const key = `${payload}|${moduleCount}|${quietZone}`;
  const hit = spanCache.get(key);
  if (hit !== undefined) return hit;
  let best = 0;
  for (let span = 2; span <= moduleCount; span++) {
    const origin = quietZone + Math.floor((moduleCount - span) / 2);
    const test = makeBitmap(qr.w, qr.h);
    test.data.set(qr.data);
    for (let y = origin; y < origin + span; y++) {
      for (let x = origin; x < origin + span; x++) test.data[y * qr.w + x] = 1;
    }
    if (!verifyTopView(test, payload).matches) break;
    best = span;
  }
  spanCache.set(key, best);
  return best;
}

/** Voxels with nothing directly beneath them: what a slicer must prop up. */
export function countOverhangs(g: VoxelGrid): number {
  let n = 0;
  for (let z = 1; z < g.h; z++) {
    for (let y = 0; y < g.d; y++) {
      for (let x = 0; x < g.w; x++) {
        if (g.data[idx(g, x, y, z)] && !g.data[idx(g, x, y, z - 1)]) n++;
      }
    }
  }
  return n;
}

/**
 * Count physically separate pieces with 6-connectivity: voxels meeting only at
 * an edge or a corner are not a printable weld. Everything reaching z = 0 rests
 * on the plate and counts as one.
 */
export function countComponents(g: VoxelGrid): number {
  const seen = new Uint8Array(g.data.length);
  const N = g.w * g.d;
  let components = 0;
  let touchesBase = false;
  const stack: number[] = [];
  for (let start = 0; start < g.data.length; start++) {
    if (!g.data[start] || seen[start]) continue;
    let onBase = false;
    components++;
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % g.w;
      const y = Math.floor(p / g.w) % g.d;
      const z = Math.floor(p / N);
      if (z === 0) onBase = true;
      const nb = [
        x > 0 ? p - 1 : -1, x < g.w - 1 ? p + 1 : -1,
        y > 0 ? p - g.w : -1, y < g.d - 1 ? p + g.w : -1,
        z > 0 ? p - N : -1, z < g.h - 1 ? p + N : -1,
      ];
      for (const q of nb) if (q >= 0 && g.data[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
    }
    if (onBase) { if (touchesBase) components--; touchesBase = true; }
  }
  return components;
}

/** Re-project the voxel grid along each axis. This is the ground truth. */
export function project(g: VoxelGrid): { topAchieved: Bitmap; sideAchieved: Bitmap } {
  const topAchieved = makeBitmap(g.w, g.d);
  const sideAchieved = makeBitmap(g.w, g.h);
  for (let z = 0; z < g.h; z++) {
    for (let y = 0; y < g.d; y++) {
      for (let x = 0; x < g.w; x++) {
        if (!g.data[idx(g, x, y, z)]) continue;
        topAchieved.data[y * g.w + x] = 1;
        sideAchieved.data[z * g.w + x] = 1;
      }
    }
  }
  return { topAchieved, sideAchieved };
}

