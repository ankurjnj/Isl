import { Bitmap, columnNonEmpty, countSet, fitInto, flipY, makeBitmap } from './bitmap';

/**
 * Axis convention, fixed everywhere in this file:
 *
 *   x  QR column  (left -> right when looking down at the top view)
 *   y  QR row     (back -> front; the depth axis of the printed object)
 *   z  height     (0 = the layer sitting on the base plate)
 *
 *   Top view  = projection along -z, showing (x, y)  -> must reproduce the QR.
 *   Side view = projection along  y, showing (x, z)  -> must reproduce the art.
 *
 * The two views share the x axis. That shared axis is the whole trick, and
 * also the whole constraint: it is why the construction below works, and why
 * some side-view pixels are provably impossible to render.
 */
export type ViewMode = 'shadow' | 'skyline';

export interface VoxelGrid {
  w: number;
  d: number;
  h: number;
  /** 1 = solid. Index with `idx()`. */
  data: Uint8Array;
}

/** A thin welding post, in voxel coordinates. Cross-section is sub-module. */
export interface Strut {
  x: number;
  y: number;
  z0: number;
  /** Exclusive. */
  z1: number;
}

export interface BuildOptions {
  mode?: ViewMode;
  /** How the subject gains depth along y. */
  form?: Form;
  /** Depth of the thickest point, as a fraction of the available depth. */
  depth?: number;
  /** Height of the voxel grid, in modules. */
  height?: number;
  /** Height of the solid pedestal under the artwork, in modules. */
  plinth?: number;
  /** Add welding posts under otherwise-floating parts. */
  weld?: boolean;
}

export interface BuildResult {
  grid: VoxelGrid;
  struts: Strut[];
  /** What the top view actually renders. */
  topAchieved: Bitmap;
  /** What the side view actually renders. */
  sideAchieved: Bitmap;
  /** The side view we were asked for, after fitting to the grid. */
  sideRequested: Bitmap;
  report: BuildReport;
}

export interface BuildReport {
  mode: ViewMode;
  form: Form;
  /** Cells where the depth band held no code, so one nearest module was added. */
  depthRepairs: number;
  /** Fraction of requested QR modules that survive into the top view. 1 = exact. */
  topFidelity: number;
  /** Fraction of requested silhouette pixels that survive into the side view. */
  sideFidelity: number;
  /** x columns where the QR is entirely light, so no side-view art can exist. */
  blindColumns: number[];
  solidVoxels: number;
  struts: number;
  /** Disconnected pieces remaining after welding. >1 means loose parts. */
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
 * Collapse a silhouette to its upper contour and fill everything beneath it.
 *
 * This is "skyline" mode: the side view becomes a solid mountain-range profile
 * of the subject rather than a true silhouette. It loses interior detail (the
 * gap between a pair of legs closes up) but the result is guaranteed to be one
 * connected mass sitting on the base plate, which is the safest thing to print.
 */
function fillDownward(s: Bitmap): Bitmap {
  const out = makeBitmap(s.w, s.h);
  for (let x = 0; x < s.w; x++) {
    let top = -1;
    for (let z = s.h - 1; z >= 0; z--) {
      if (s.data[z * s.w + x]) { top = z; break; }
    }
    for (let z = 0; z <= top; z++) out.data[z * s.w + x] = 1;
  }
  return out;
}

/**
 * How the subject is given depth.
 *
 * `flat` is the degenerate case, and it is worth naming why: with a constant
 * depth the solid set at a fixed x is {y : QR} x {z : S}, a product. The
 * z-structure then depends only on x, so every pillar in a column shares one
 * height profile and the object is a 2D shape swept along y -- an extrusion,
 * not a sculpture. The other two forms make the depth vary with (x, z), which
 * is what gives the model real three-dimensional shape.
 */
export type Form = 'flat' | 'rounded' | 'revolved';

/**
 * Exact squared Euclidean distance transform (Felzenszwalb & Huttenlocher).
 *
 * Returns, for every set pixel, the squared distance to the nearest clear
 * pixel -- so distance to the silhouette's own outline. Exact Euclidean rather
 * than a chamfer approximation because this drives a visible surface: chamfer
 * error shows up as faceting along the diagonals of a form that should read as
 * smoothly rounded.
 */
function edtSquared(b: Bitmap): Float64Array {
  const INF = 1e20;
  const f = new Float64Array(b.w * b.h);
  for (let i = 0; i < f.length; i++) f[i] = b.data[i] ? INF : 0;

  const run = (n: number, get: (i: number) => number, put: (i: number, v: number) => void) => {
    const v = new Int32Array(n);
    const z = new Float64Array(n + 1);
    const src = new Float64Array(n);
    for (let i = 0; i < n; i++) src[i] = get(i);
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((src[q] + q * q) - (src[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (k > 0 && s <= z[k]) {
        k--;
        s = ((src[q] + q * q) - (src[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      put(q, (q - v[k]) * (q - v[k]) + src[v[k]]);
    }
  };

  const col = new Float64Array(b.h);
  for (let x = 0; x < b.w; x++) {
    run(b.h, (y) => f[y * b.w + x], (y, val) => { col[y] = val; });
    for (let y = 0; y < b.h; y++) f[y * b.w + x] = col[y];
  }
  const row = new Float64Array(b.w);
  for (let y = 0; y < b.h; y++) {
    run(b.w, (x) => f[y * b.w + x], (x, val) => { row[x] = val; });
    for (let x = 0; x < b.w; x++) f[y * b.w + x] = row[x];
  }
  return f;
}

/**
 * Half-depth, in modules, for every cell of the artwork.
 *
 * `rounded` inflates the silhouette the way sketch-based modellers do: depth
 * follows distance from the outline, on a circular falloff rather than a linear
 * one, so the surface domes over instead of meeting the edge as a cone. Thin
 * features stay thin -- a cat's ears are near their own outline everywhere, so
 * they read as ears and not as rods.
 *
 * `revolved` sweeps each height's cross-section around the local centre line,
 * giving a turned, generalised-cylinder form. It uses the per-row centre rather
 * than one global axis so an off-centre subject bends with its own spine
 * instead of ballooning around the model's middle.
 */
function buildDepthMap(art: Bitmap, form: Form, maxHalf: number): Float64Array {
  const out = new Float64Array(art.w * art.h);

  if (form === 'flat') {
    for (let i = 0; i < out.length; i++) out[i] = art.data[i] ? maxHalf : 0;
    return out;
  }

  if (form === 'revolved') {
    for (let z = 0; z < art.h; z++) {
      let lo = -1, hi = -1;
      for (let x = 0; x < art.w; x++) {
        if (art.data[z * art.w + x]) { if (lo < 0) lo = x; hi = x; }
      }
      if (lo < 0) continue;
      const cx = (lo + hi) / 2;
      const r = (hi - lo) / 2 + 0.5;
      for (let x = lo; x <= hi; x++) {
        if (!art.data[z * art.w + x]) continue;
        const dx = x - cx;
        out[z * art.w + x] = Math.sqrt(Math.max(0, r * r - dx * dx));
      }
    }
    // Normalise so the widest point reaches the requested depth.
    let peak = 0;
    for (const v of out) if (v > peak) peak = v;
    if (peak > 0) for (let i = 0; i < out.length; i++) out[i] *= maxHalf / peak;
    return out;
  }

  const sq = edtSquared(art);
  let peak = 0;
  for (const v of sq) if (v > peak) peak = v;
  const norm = Math.sqrt(peak) || 1;
  for (let i = 0; i < out.length; i++) {
    if (!art.data[i]) continue;
    const t = Math.min(1, Math.sqrt(sq[i]) / norm);
    // Circular profile: 0 at the outline, maxHalf at the thickest point.
    out[i] = maxHalf * Math.sqrt(Math.max(0, 2 * t - t * t));
  }
  return out;
}

/**
 * Slide the artwork down until it rests on z = 0.
 *
 * `fitInto` centres its result, which leaves a shape like a sitting cat
 * hovering several layers above the plinth, joined only by welding posts --
 * fragile to print and wrong to look at. Seating the art on the pedestal both
 * fixes the reading and removes most of the struts, since the body now meets
 * the plinth directly.
 */
function dropToFloor(s: Bitmap): Bitmap {
  let lowest = -1;
  for (let z = 0; z < s.h && lowest < 0; z++) {
    for (let x = 0; x < s.w; x++) {
      if (s.data[z * s.w + x]) { lowest = z; break; }
    }
  }
  if (lowest <= 0) return s;
  const out = makeBitmap(s.w, s.h);
  out.data.set(s.data.subarray(lowest * s.w), 0);
  return out;
}

/**
 * Drop the empty layers above the artwork.
 *
 * The height control sets how much room the artwork *may* use, not how much it
 * does. A wide, short subject -- an extruded word, a mountain range -- fits by
 * width and leaves most of that room empty. Keeping those layers would make the
 * model report a height several times the real object's, mis-frame the viewer,
 * and hand the slicer a bounding box that does not match what it prints.
 */
function trimHeight(g: VoxelGrid): VoxelGrid {
  let top = -1;
  const layer = g.w * g.d;
  for (let z = g.h - 1; z >= 0 && top < 0; z--) {
    for (let i = 0; i < layer; i++) {
      if (g.data[z * layer + i]) { top = z; break; }
    }
  }
  const h = Math.max(1, top + 1);
  if (h === g.h) return g;
  return { w: g.w, d: g.d, h, data: g.data.slice(0, h * layer) };
}

/** Crop a side-view bitmap (x, z) to match a trimmed grid. */
function trimBitmapHeight(b: Bitmap, h: number): Bitmap {
  if (h >= b.h) return b;
  return { w: b.w, h, data: b.data.slice(0, h * b.w) };
}

/**
 * Build the dual-view sculpture.
 *
 * The construction is the voxel Cartesian product of the two target images:
 *
 *     V(x, y, z) = QR(x, y) AND S(x, z)
 *
 * Projecting it back gives, exactly:
 *
 *     top(x, y)  = QR(x, y) AND (column x of S is non-empty)
 *     side(x, z) = S(x, z)  AND (column x of QR is non-empty)
 *
 * So each view is reproduced perfectly wherever the *other* image has some
 * content in the same x column, and is blank where it does not. That gives the
 * two guarantees this function trades on:
 *
 *  - The top view is made exact by the plinth. A pedestal spanning every data
 *    column forces "column x of S is non-empty" to hold everywhere the QR has
 *    ink, so the code always reproduces perfectly. This is not a heuristic --
 *    it closes the only hole in the top-view identity.
 *
 *  - The side view cannot be made exact in general. If some QR column happens
 *    to be entirely light, no material may stand in that column without
 *    corrupting the code, so that slice of the artwork is unrenderable. Those
 *    columns are reported as `blindColumns` rather than silently fudged.
 */
export function buildSculpture(
  qr: Bitmap,
  silhouette: Bitmap,
  quietZone: number,
  opts: BuildOptions = {},
): BuildResult {
  const mode = opts.mode ?? 'shadow';
  const form = opts.form ?? 'rounded';
  const depthScale = Math.min(1, Math.max(0.05, opts.depth ?? 0.9));
  const h = Math.max(4, Math.round(opts.height ?? Math.round(qr.w * 0.75)));
  const plinth = Math.max(1, Math.round(opts.plinth ?? Math.max(1, Math.round(h * 0.06))));
  const weld = opts.weld ?? true;

  const w = qr.w;
  const d = qr.h;

  // The art lives strictly inside the QR data area. Anything placed in the
  // quiet zone would be multiplied by QR = 0 and vanish, so we never put it
  // there in the first place.
  const dataW = w - quietZone * 2;
  if (dataW <= 0) throw new Error('quiet zone larger than the code');

  // Fit the art into the data columns and the space above the plinth, then
  // flip into bottom-up Z ordering.
  const artH = Math.max(1, h - plinth);
  let art = fitInto(silhouette, dataW, artH);
  if (mode === 'skyline') art = fillDownward(flipY(art));
  else art = dropToFloor(flipY(art));

  // S over the full grid width, in bottom-up Z.
  const S = makeBitmap(w, h);
  for (let z = 0; z < artH; z++) {
    for (let x = 0; x < dataW; x++) {
      if (art.data[z * dataW + x]) S.data[(z + plinth) * w + (x + quietZone)] = 1;
    }
  }
  // The plinth: solid across every data column, which is what makes the top
  // view exact.
  for (let z = 0; z < plinth; z++) {
    for (let x = quietZone; x < w - quietZone; x++) S.data[z * w + x] = 1;
  }

  // V = QR AND S, with the code flipped into physical space.
  //
  // The QR bitmap is image space: row 0 is the top of the picture. The grid is
  // physical space: +y is a direction on the table. An observer looking down at
  // the print with +x to their right necessarily sees +y going *up* their view,
  // so laying row 0 at y = 0 would put the top of the code nearest them and the
  // printed object would read as a vertical mirror of the intended code. A
  // mirrored QR is not a rotated QR -- no amount of turning the print fixes it,
  // and most phone scanners refuse it outright. So the code is flipped here,
  // once, and the projections are flipped back before they are reported.
  const qrPhysical = flipY(qr);

  // The depth field. Material may only sit within +/- D(x, z) of the model's
  // centre plane, which is what stops the sweep along y from being constant and
  // turns the result into a solid with actual form.
  //
  // The plinth is exempt and stays full depth. That is not cosmetic: the top
  // view is exact only because every data column carries material at some
  // height, and a pedestal spanning the full depth is what keeps that true no
  // matter how thin the artwork gets above it.
  const maxHalf = (dataW / 2) * depthScale;
  const depthMap = buildDepthMap(art, form, maxHalf);
  const cy = (d - 1) / 2;

  const grid: VoxelGrid = { w, d, h, data: new Uint8Array(w * d * h) };
  let depthRepairs = 0;

  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      if (!S.data[z * w + x]) continue;

      let y0 = 0;
      let y1 = d - 1;
      if (z >= plinth) {
        const half = depthMap[(z - plinth) * dataW + (x - quietZone)];
        y0 = Math.max(0, Math.ceil(cy - half));
        y1 = Math.min(d - 1, Math.floor(cy + half));
      }

      let any = false;
      for (let y = y0; y <= y1; y++) {
        if (qrPhysical.data[y * w + x]) {
          grid.data[(z * d + y) * w + x] = 1;
          any = true;
        }
      }

      // Repair. Narrowing the band can leave a cell whose slice of the code is
      // entirely light, which would erode the side view into a ragged outline
      // exactly where the form is thinnest. Adding the single nearest dark
      // module keeps the side view as faithful as the flat build -- limited
      // only by blind columns, never by the depth field -- and one module is
      // too small to disturb the silhouette it is protecting.
      if (!any) {
        for (let r = 1; r < d && !any; r++) {
          for (const y of [Math.round(cy) - r, Math.round(cy) + r]) {
            if (y < 0 || y >= d || any) continue;
            if (qrPhysical.data[y * w + x]) {
              grid.data[(z * d + y) * w + x] = 1;
              any = true;
              depthRepairs++;
            }
          }
        }
      }
    }
  }

  const trimmed = trimHeight(grid);
  const struts = weld ? weldFloatingParts(trimmed, plinth) : [];
  const projected = project(trimmed);
  // Back to image space, so callers compare against the QR they asked for.
  const topAchieved = flipY(projected.topAchieved);
  const sideAchieved = projected.sideAchieved; // (x, z): untouched by a y flip.

  // Everything the caller asked for on the side, before feasibility masking.
  const sideRequested = trimBitmapHeight(S, trimmed.h);
  const qrCols = columnNonEmpty(qr);
  const blindColumns: number[] = [];
  for (let x = quietZone; x < w - quietZone; x++) {
    if (!qrCols[x]) blindColumns.push(x);
  }

  const wantTop = countSet(qr);
  const wantSide = countSet(sideRequested);
  const report: BuildReport = {
    mode,
    form,
    depthRepairs,
    topFidelity: wantTop ? countSet(intersect(topAchieved, qr)) / wantTop : 1,
    sideFidelity: wantSide ? countSet(intersect(sideAchieved, sideRequested)) / wantSide : 1,
    blindColumns,
    solidVoxels: trimmed.data.reduce((a, b) => a + b, 0),
    struts: struts.length,
    looseParts: countComponents(trimmed, struts),
  };

  return { grid: trimmed, struts, topAchieved, sideAchieved, sideRequested, report };
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
        if (!g.data[(z * g.d + y) * g.w + x]) continue;
        topAchieved.data[y * g.w + x] = 1;
        sideAchieved.data[z * g.w + x] = 1;
      }
    }
  }
  return { topAchieved, sideAchieved };
}

/**
 * Find parts that do not reach the plinth and drop a post under each.
 *
 * A post runs straight down inside a column (x, y) that is already solid
 * somewhere above, and (x, y) is by construction a dark QR module -- so the
 * post is invisible from the top. It is rendered with a sub-module
 * cross-section, so from the side it is a hairline rather than a block.
 * Without this step a silhouette with a detached element (a hat, a bird above
 * a branch) would print as loose pieces.
 */
function weldFloatingParts(g: VoxelGrid, plinth: number): Strut[] {
  const labels = labelComponents(g);
  const anchored = new Set<number>();
  for (let z = 0; z < Math.max(1, plinth); z++) {
    for (let y = 0; y < g.d; y++) {
      for (let x = 0; x < g.w; x++) {
        const l = labels.data[(z * g.d + y) * g.w + x];
        if (l > 0) anchored.add(l);
      }
    }
  }

  // Lowest voxel of each unanchored component, preferring central columns so
  // the post is less conspicuous.
  const lowest = new Map<number, { x: number; y: number; z: number }>();
  for (let z = 0; z < g.h; z++) {
    for (let y = 0; y < g.d; y++) {
      for (let x = 0; x < g.w; x++) {
        const l = labels.data[(z * g.d + y) * g.w + x];
        if (!l || anchored.has(l) || lowest.has(l)) continue;
        lowest.set(l, { x, y, z });
      }
    }
  }

  const struts: Strut[] = [];
  for (const { x, y, z } of lowest.values()) {
    let z0 = z - 1;
    while (z0 >= 0 && !g.data[(z0 * g.d + y) * g.w + x]) z0--;
    struts.push({ x, y, z0: z0 + 1, z1: z });
  }
  return struts;
}

function labelComponents(g: VoxelGrid): { data: Int32Array; count: number } {
  const data = new Int32Array(g.w * g.d * g.h);
  const stack: number[] = [];
  let count = 0;
  const N = g.w * g.d;
  for (let start = 0; start < g.data.length; start++) {
    if (!g.data[start] || data[start]) continue;
    count++;
    data[start] = count;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % g.w;
      const y = Math.floor(p / g.w) % g.d;
      const z = Math.floor(p / N);
      // 6-connectivity: face contact only. Voxels meeting at an edge or a
      // corner are not a printable weld, so they must not count as joined.
      const nb = [
        x > 0 ? p - 1 : -1,
        x < g.w - 1 ? p + 1 : -1,
        y > 0 ? p - g.w : -1,
        y < g.d - 1 ? p + g.w : -1,
        z > 0 ? p - N : -1,
        z < g.h - 1 ? p + N : -1,
      ];
      for (const q of nb) {
        if (q >= 0 && g.data[q] && !data[q]) {
          data[q] = count;
          stack.push(q);
        }
      }
    }
  }
  return { data, count };
}

/** Components remaining once struts are treated as welds. */
function countComponents(g: VoxelGrid, struts: Strut[]): number {
  const { data, count } = labelComponents(g);
  if (count <= 1) return count;
  const parent = new Int32Array(count + 1);
  for (let i = 0; i <= count; i++) parent[i] = i;
  const find = (a: number): number => {
    while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
    return a;
  };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  const N = g.w * g.d;
  // A strut joins whatever it touches at each end. z0 === 0 means it lands on
  // the base plate, which unifies it with every other base-anchored part.
  const baseLabels = new Set<number>();
  for (let y = 0; y < g.d; y++) {
    for (let x = 0; x < g.w; x++) {
      const l = data[y * g.w + x];
      if (l) baseLabels.add(l);
    }
  }
  let prev = -1;
  for (const l of baseLabels) {
    if (prev > 0) union(prev, l);
    prev = l;
  }
  for (const s of struts) {
    const above = data[(s.z1 * g.d + s.y) * g.w + s.x];
    const below = s.z0 > 0 ? data[((s.z0 - 1) * g.d + s.y) * g.w + s.x] : (prev > 0 ? prev : 0);
    if (above && below) union(above, below);
    else if (above && s.z0 === 0 && prev > 0) union(above, prev);
  }
  void N;
  const roots = new Set<number>();
  for (let i = 1; i <= count; i++) roots.add(find(i));
  return roots.size;
}
