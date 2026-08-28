import { Bitmap, columnNonEmpty, countSet, flipY, makeBitmap } from './bitmap';
import { Sdf } from './sdf';

/**
 * Axis convention, fixed everywhere in this file:
 *
 *   x  QR column  (left -> right when looking down at the top view)
 *   y  QR row     (back -> front; the depth axis of the printed object)
 *   z  height     (0 = the layer sitting on the base plate)
 *
 * The governing constraint, from which nearly every design decision here
 * follows:
 *
 *   Anything above the code plane occludes the code. Material may therefore
 *   only ever stand over a dark module, at ANY height. So two parts of the
 *   sculpture can touch only where their modules are face-adjacent in the code
 *   -- no horizontal bridging is possible anywhere, ever.
 *
 * A QR always contains isolated modules, so a shape with a part that floats
 * above a narrower part below it (a canopy over a trunk, a cap over a stalk)
 * cannot be a single printable object. The only honest resolutions are to hold
 * it with rods, or to give every column its own path to the ground. This build
 * takes the second: see `groundColumns`.
 */

export interface VoxelGrid {
  w: number;
  d: number;
  h: number;
  /** 1 = solid. Index with `idx()`. */
  data: Uint8Array;
}

export type Support = 'grounded' | 'solid';

export interface BuildOptions {
  /**
   * `grounded` gives every column a path to the base plate: one piece, no
   * supports, no connecting rods. `solid` keeps the model's true occupancy,
   * accepting overhangs -- and reporting honestly when that leaves pieces that
   * would fall off.
   */
  support?: Support;
  /** Height of the voxel grid, in layers. */
  height?: number;
  /** Height of the pedestal that completes the code, in layers. */
  plinth?: number;
}

export interface BuildResult {
  grid: VoxelGrid;
  topAchieved: Bitmap;
  sideAchieved: Bitmap;
  /** The solid's own side outline, before the code masked it. */
  sideRequested: Bitmap;
  report: BuildReport;
}

export interface BuildReport {
  support: Support;
  /** Fraction of the code that survives into the top view. 1 = exact. */
  topFidelity: number;
  /** Fraction of the solid's outline that survives the code masking. */
  sideFidelity: number;
  /**
   * How much grounding moved the solid's outline. 0 means the subject tapers
   * and is reproduced exactly; a large value means it re-widens above a narrow
   * point and has lost the feature that made it recognisable.
   */
  outlineDistortion: number;
  /** x columns where the code is entirely light, so nothing may stand there. */
  blindColumns: number[];
  solidVoxels: number;
  /** Voxels with nothing beneath them. Zero means it prints without supports. */
  overhangs: number;
  /** Disconnected pieces. Anything above 1 will fall apart. */
  looseParts: number;
}

export function idx(g: VoxelGrid, x: number, y: number, z: number): number {
  return (z * g.d + y) * g.w + x;
}

export function getVoxel(g: VoxelGrid, x: number, y: number, z: number): number {
  if (x < 0 || y < 0 || z < 0 || x >= g.w || y >= g.d || z >= g.h) return 0;
  return g.data[idx(g, x, y, z)];
}

/**
 * Give every column a path to the ground by filling it from the base up to the
 * solid's top surface at that (x, y).
 *
 * This is what removes the connecting rods, and it is not a cosmetic choice:
 * per the note at the top of this file, a column that does not reach the ground
 * on its own cannot be joined to anything sideways, so its only alternatives
 * are a rod or falling off. Filling downward costs the subject any feature that
 * re-widens above a narrow point -- which is precisely why the model library is
 * authored to taper. `outlineDistortion` measures what a given subject loses.
 */
function groundColumns(g: VoxelGrid): VoxelGrid {
  const out: VoxelGrid = { ...g, data: new Uint8Array(g.data) };
  for (let y = 0; y < g.d; y++) {
    for (let x = 0; x < g.w; x++) {
      let top = -1;
      for (let z = g.h - 1; z >= 0; z--) {
        if (g.data[idx(g, x, y, z)]) { top = z; break; }
      }
      for (let z = 0; z <= top; z++) out.data[idx(g, x, y, z)] = 1;
    }
  }
  return out;
}

/**
 * Sample a solid into the grid.
 *
 * Model space is x, y in [-0.5, 0.5] and z in [0, 1], mapped onto the code's
 * data area and the layers above the plinth. The artwork stays inside the data
 * area because anything in the quiet zone would be multiplied by a light module
 * and vanish.
 */
function voxelizeModel(
  sdf: Sdf,
  w: number, d: number, h: number,
  quietZone: number, plinth: number,
): VoxelGrid {
  const g: VoxelGrid = { w, d, h, data: new Uint8Array(w * d * h) };
  const dataW = w - quietZone * 2;
  const dataD = d - quietZone * 2;
  const artH = Math.max(1, h - plinth);
  for (let z = 0; z < artH; z++) {
    const mz = (z + 0.5) / artH;
    for (let y = 0; y < dataD; y++) {
      const my = (y + 0.5) / dataD - 0.5;
      for (let x = 0; x < dataW; x++) {
        const mx = (x + 0.5) / dataW - 0.5;
        if (sdf(mx, my, mz) < 0) g.data[idx(g, x + quietZone, y + quietZone, z + plinth)] = 1;
      }
    }
  }
  return g;
}

/**
 * Build the sculpture: a real 3D solid, masked by the code.
 *
 *     V(x, y, z) = QR(x, y) AND M(x, y, z)
 *
 * Because M is a genuine solid rather than a swept outline, its occupancy
 * varies along every axis, and so does the result.
 *
 * Projecting back gives:
 *
 *     top(x, y)  = QR(x, y) AND (the solid stands somewhere in that column)
 *     side(x, z) = M's outline AND (that code column carries ink somewhere)
 *
 * The top view is what must never be approximate, and the plinth guarantees it:
 * a pedestal spanning every data column means each dark module carries material
 * regardless of where the sculpture happens to stand. The side view needs no
 * such device -- it only needs one dark module anywhere across the depth, and
 * with tens of columns to draw from it survives essentially intact.
 */
export function buildSculpture(
  qr: Bitmap,
  model: Sdf,
  quietZone: number,
  opts: BuildOptions = {},
): BuildResult {
  const support = opts.support ?? 'grounded';
  const h = Math.max(6, Math.round(opts.height ?? Math.round(qr.w * 0.9)));
  const plinth = Math.max(1, Math.round(opts.plinth ?? Math.max(2, Math.round(h * 0.06))));

  const w = qr.w;
  const d = qr.h;
  if (w - quietZone * 2 <= 0) throw new Error('quiet zone larger than the code');

  const raw = voxelizeModel(model, w, d, h, quietZone, plinth);
  const shaped = support === 'grounded' ? groundColumns(raw) : raw;

  // The pedestal. Solid across every data column, which is what makes the top
  // view exact no matter where the sculpture stands.
  for (let z = 0; z < plinth; z++) {
    for (let y = quietZone; y < d - quietZone; y++) {
      for (let x = quietZone; x < w - quietZone; x++) shaped.data[idx(shaped, x, y, z)] = 1;
    }
  }

  // The QR bitmap is image space, row 0 at the top of the picture; the grid is
  // physical space, where an observer looking down with +x to their right sees
  // +y going up their view. Laying row 0 at y = 0 would print a vertical mirror
  // of the code, and a mirrored QR is not a rotated one -- turning the print
  // cannot fix it. Flip once here, and flip the projections back to report them.
  const qrPhysical = flipY(qr);
  const grid: VoxelGrid = { w, d, h, data: new Uint8Array(w * d * h) };
  for (let z = 0; z < h; z++) {
    for (let y = 0; y < d; y++) {
      for (let x = 0; x < w; x++) {
        const i = idx(grid, x, y, z);
        if (shaped.data[i] && qrPhysical.data[y * w + x]) grid.data[i] = 1;
      }
    }
  }

  const trimmed = trimHeight(grid);
  const projected = project(trimmed);
  const topAchieved = flipY(projected.topAchieved);
  const sideAchieved = projected.sideAchieved;

  // What the solid alone would show from the side, and what grounding cost it.
  const sideRequested = sideOf(shaped, trimmed.h);
  const sideBeforeGrounding = sideOf(raw, trimmed.h);
  let outlineWant = 0, outlineAdded = 0;
  for (let i = 0; i < sideRequested.data.length; i++) {
    outlineWant += sideBeforeGrounding.data[i];
    if (sideRequested.data[i] && !sideBeforeGrounding.data[i]) outlineAdded++;
  }

  const qrCols = columnNonEmpty(qr);
  const blindColumns: number[] = [];
  for (let x = quietZone; x < w - quietZone; x++) if (!qrCols[x]) blindColumns.push(x);

  const wantTop = countSet(qr);
  const wantSide = countSet(sideRequested);
  const report: BuildReport = {
    support,
    topFidelity: wantTop ? countSet(intersect(topAchieved, qr)) / wantTop : 1,
    sideFidelity: wantSide ? countSet(intersect(sideAchieved, sideRequested)) / wantSide : 1,
    outlineDistortion: outlineWant ? outlineAdded / outlineWant : 0,
    blindColumns,
    solidVoxels: trimmed.data.reduce((a, b) => a + b, 0),
    overhangs: countOverhangs(trimmed),
    looseParts: countComponents(trimmed),
  };

  return { grid: trimmed, topAchieved, sideAchieved, sideRequested, report };
}

function sideOf(g: VoxelGrid, h: number): Bitmap {
  const b = makeBitmap(g.w, h);
  for (let z = 0; z < Math.min(h, g.h); z++) {
    for (let y = 0; y < g.d; y++) {
      for (let x = 0; x < g.w; x++) {
        if (g.data[idx(g, x, y, z)]) b.data[z * g.w + x] = 1;
      }
    }
  }
  return b;
}

function intersect(a: Bitmap, b: Bitmap): Bitmap {
  const out = makeBitmap(a.w, a.h);
  for (let i = 0; i < out.data.length; i++) out.data[i] = a.data[i] & b.data[i];
  return out;
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

/** Voxels with nothing directly beneath them: what a slicer would need to prop up. */
function countOverhangs(g: VoxelGrid): number {
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
 * Drop the empty layers above the artwork, so the reported height and the
 * slicer's bounding box match the object that actually prints.
 */
function trimHeight(g: VoxelGrid): VoxelGrid {
  const layer = g.w * g.d;
  let top = -1;
  for (let z = g.h - 1; z >= 0 && top < 0; z--) {
    for (let i = 0; i < layer; i++) if (g.data[z * layer + i]) { top = z; break; }
  }
  const h = Math.max(1, top + 1);
  return h === g.h ? g : { w: g.w, d: g.d, h, data: g.data.slice(0, h * layer) };
}

/**
 * Count physically separate pieces, using 6-connectivity: voxels meeting only
 * at an edge or a corner are not a printable weld, so they must not count as
 * joined. Everything resting on the base plate counts as one piece.
 */
function countComponents(g: VoxelGrid): number {
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
        x > 0 ? p - 1 : -1,
        x < g.w - 1 ? p + 1 : -1,
        y > 0 ? p - g.w : -1,
        y < g.d - 1 ? p + g.w : -1,
        z > 0 ? p - N : -1,
        z < g.h - 1 ? p + N : -1,
      ];
      for (const q of nb) {
        if (q >= 0 && g.data[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    // Pieces standing on the plate are held together by it, so they are one.
    if (onBase) {
      if (touchesBase) components--;
      touchesBase = true;
    }
  }
  return components;
}
