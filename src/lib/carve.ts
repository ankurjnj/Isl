import { Bitmap, flipY, makeBitmap } from './bitmap';
import { Sdf } from './sdf';
import { makeSelfSupporting, VoxelGrid } from './voxel';

/**
 * Carve the sculpture out of the code, so it camouflages into the pattern.
 *
 * The sculpture's top-down projection lands only on dark modules, which is what
 * makes the finished print read as a clean QR from above rather than a code
 * with an object sitting on it. That constraint is severe -- material may never
 * stand over a light module at any height, so two parts of the sculpture can
 * touch only where their modules are face-adjacent -- and on its own it
 * shatters the shape into dozens of loose fragments.
 *
 * What makes it workable is that the code does not have to be perfect, only
 * decodable. Darkening a light module is a single module of error, and a QR
 * carries error correction to spare. Joining the fragments turns out to cost
 * roughly one module each: the bridges are found by growing every fragment
 * outward at once and darkening only where two fronts meet. Fifty-odd extra
 * dark modules, scattered among thousands and indistinguishable from the
 * pattern, buy a sculpture that is one connected piece and keeps its real form.
 */

export interface CarveOptions {
  /** Sculpture footprint as a fraction of the code's width. */
  span: number;
  /** Vertical voxels per module. */
  zSub: number;
  /**
   * Sculpture voxels per module across.
   *
   * The code constrains where material may stand, not how finely it may be
   * shaped. A sub-voxel lies wholly inside one module, so if that module is
   * dark the projection stays legal; and the tile already raises every dark
   * module, so one the sculpture only partly covers still reads dark from
   * above. The sculpture can therefore carry detail finer than the code
   * without costing the code anything.
   */
  xySub: number;
  /** Layers of raised code beneath the sculpture. */
  tileLayers: number;
  /**
   * Shave the sculpture back to what prints without support material.
   *
   * Cheap for anything architectural -- a rocket or a lighthouse loses a few
   * percent -- and expensive for anything that flares, since a tree's canopy or
   * a mushroom's cap is exactly the shape a printer cannot bridge.
   */
  selfSupport: boolean;
}

export interface CarveResult {
  grid: VoxelGrid;
  /** The code as a scanner sees it: the original plus the bridges. */
  code: Bitmap;
  spanModules: number;
  originModule: number;
  /** Sculpture voxels per module across. */
  xySub: number;
  /** Light modules darkened to join fragments. Each is one module of error. */
  bridges: number;
  /** Fragments too small to be worth a bridge, removed instead. */
  droppedSpecks: number;
  /** Share of the carved model shaved away to make it self-supporting. */
  shavedFraction: number;
  /** Supports added under parts that reached nothing. One column each. */
  filledColumns: number;
  /** Voxels the filling added, against the carved total. */
  fillFraction: number;
  looseParts: number;
}

/**
 * Join a footprint's components by darkening as few modules as possible.
 *
 * Every component is grown outward simultaneously; where two fronts meet, the
 * two paths back to their sources are the cheapest link between them, and only
 * those cells are darkened. Union-find keeps each merge to the first (shortest)
 * meeting, so the result is close to a minimum spanning set of bridges.
 */
function bridgeFootprint(
  foot: Uint8Array, w: number, d: number, allowed: Uint8Array,
): { bridges: number[] } {
  const label = new Int32Array(w * d);
  let comps = 0;
  const stack: number[] = [];
  for (let s = 0; s < foot.length; s++) {
    if (!foot[s] || label[s]) continue;
    comps++;
    label[s] = comps;
    stack.push(s);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w, y = Math.floor(p / w);
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < d - 1 ? p + w : -1]) {
        if (q >= 0 && foot[q] && !label[q]) { label[q] = comps; stack.push(q); }
      }
    }
  }
  if (comps <= 1) return { bridges: [] };

  const owner = new Int32Array(w * d);
  const dist = new Int32Array(w * d).fill(-1);
  const from = new Int32Array(w * d).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < foot.length; i++) {
    if (foot[i]) { owner[i] = label[i]; dist[i] = 0; queue.push(i); }
  }

  const parent = new Int32Array(comps + 1);
  for (let i = 0; i <= comps; i++) parent[i] = i;
  const find = (a: number): number => {
    while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
    return a;
  };

  const bridges = new Set<number>();
  let remaining = comps;
  for (let qi = 0; qi < queue.length && remaining > 1; qi++) {
    const p = queue[qi];
    const x = p % w, y = Math.floor(p / w);
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < d - 1 ? p + w : -1]) {
      if (q < 0 || !allowed[q]) continue;
      if (dist[q] < 0) {
        dist[q] = dist[p] + 1;
        owner[q] = owner[p];
        from[q] = p;
        queue.push(q);
      } else if (find(owner[q]) !== find(owner[p])) {
        parent[find(owner[q])] = find(owner[p]);
        remaining--;
        for (let c = p; c >= 0 && !foot[c]; c = from[c]) bridges.add(c);
        for (let c = q; c >= 0 && !foot[c]; c = from[c]) bridges.add(c);
      }
    }
  }
  return { bridges: [...bridges] };
}

export function carveSculpture(qr: Bitmap, quietZone: number, moduleCount: number, model: Sdf, opts: CarveOptions): CarveResult {
  const w = qr.w, d = qr.h;
  const spanModules = Math.max(4, Math.min(moduleCount, Math.round(moduleCount * opts.span)));
  const originModule = quietZone + Math.floor((moduleCount - spanModules) / 2);
  const xySub = Math.max(1, Math.round(opts.xySub));

  // Normalise the model into its footprint from the bounds its primitives
  // carry, so authored coordinates need not be calibrated by hand.
  const b = model.bounds;
  let scale = 1, z0 = 0, aspect = 1;
  if (b && Number.isFinite(b[0]) && b[3] > b[0]) {
    const radial = Math.max(Math.abs(b[0]), Math.abs(b[3]), Math.abs(b[1]), Math.abs(b[4]));
    if (radial > 0) scale = 0.5 / radial;
    z0 = b[2];
    aspect = Math.max(0.2, (b[5] - b[2]) * scale);
  }
  const sculptH = Math.max(4, Math.round(spanModules * aspect * opts.zSub));
  const tile = Math.max(1, opts.tileLayers);
  const h = tile + sculptH;

  // The grid is finer than the code across x and y; the module grid survives as
  // a mask over it, which is all the code actually requires.
  const W = w * xySub, D = d * xySub;
  const N = W * D;

  // Physical space: an observer looking down with +x to their right sees +y
  // going up their view, so image row 0 must sit at the far edge. Without this
  // the print is a vertical mirror of the code, which no rotation can fix.
  const phys = flipY(qr);
  const grid: VoxelGrid = { w: W, d: D, h, data: new Uint8Array(W * D * h) };
  const darkAt = (sx: number, sy: number) =>
    phys.data[Math.floor(sy / xySub) * w + Math.floor(sx / xySub)];

  // The tile: every dark module, raised.
  for (let z = 0; z < tile; z++) {
    for (let sy = 0; sy < D; sy++) {
      for (let sx = 0; sx < W; sx++) if (darkAt(sx, sy)) grid.data[z * N + sy * W + sx] = 1;
    }
  }

  // The sculpture, kept only where the code is dark.
  const sxSpan = spanModules * xySub;
  const sxOrigin = originModule * xySub;
  const tol = 0.45 / (sxSpan * scale);
  for (let z = 0; z < sculptH; z++) {
    const mz = z0 + ((z + 0.5) / sculptH) * (aspect / scale);
    for (let y = 0; y < sxSpan; y++) {
      const my = ((y + 0.5) / sxSpan - 0.5) / scale;
      const gy = y + sxOrigin;
      for (let x = 0; x < sxSpan; x++) {
        const gx = x + sxOrigin;
        if (!darkAt(gx, gy)) continue;
        if (model(((x + 0.5) / sxSpan - 0.5) / scale, my, mz) < tol) {
          grid.data[(z + tile) * N + gy * W + gx] = 1;
        }
      }
    }
  }

  const setModule = (mx: number, my: number, z: number, v: number) => {
    for (let j = 0; j < xySub; j++) {
      for (let i = 0; i < xySub; i++) grid.data[z * N + (my * xySub + j) * W + (mx * xySub + i)] = v;
    }
  };
  const moduleHas = (mx: number, my: number, z: number) => {
    for (let j = 0; j < xySub; j++) {
      for (let i = 0; i < xySub; i++) {
        if (grid.data[z * N + (my * xySub + j) * W + (mx * xySub + i)]) return true;
      }
    }
    return false;
  };

  // Bridging stays on the module grid, because a bridge is a module of error in
  // the code -- there is no such thing as darkening part of a module.
  const foot = new Uint8Array(w * d);
  for (let z = tile; z < h; z++) {
    for (let sy = 0; sy < D; sy++) {
      for (let sx = 0; sx < W; sx++) {
        if (grid.data[z * N + sy * W + sx]) foot[Math.floor(sy / xySub) * w + Math.floor(sx / xySub)] = 1;
      }
    }
  }

  // Drop specks before bridging. A fragment one or two modules across costs a
  // darkened module to reach and contributes almost nothing to the shape, so
  // paying pattern drift for it is a bad trade. Removing it is safe: the tile
  // still carries that module, so nothing is left loose -- the sculpture simply
  // has no material above it.
  const dropped = dropSpecks(foot, w, 2, (mx, my) => {
    for (let z = tile; z < h; z++) setModule(mx, my, z, 0);
  });

  const allowed = new Uint8Array(w * d);
  for (let y = originModule; y < originModule + spanModules; y++) {
    for (let x = originModule; x < originModule + spanModules; x++) allowed[y * w + x] = 1;
  }
  const { bridges } = bridgeFootprint(foot, w, d, allowed);

  const code = makeBitmap(w, d);
  code.data.set(qr.data);
  for (const i of bridges) {
    const mx = i % w, my = Math.floor(i / w);
    // A bridge is a real dark module: it joins the sculpture, raises the tile
    // beneath it, and must appear in the code a scanner reads.
    for (let z = 0; z < tile; z++) setModule(mx, my, z, 1);
    code.data[(d - 1 - my) * w + mx] = 1;

    // And it has to carry material at the heights its neighbours occupy.
    // Joining fragments only in plan leaves them still adrift in space -- a
    // mushroom cap floating a dozen layers above the bridge that was supposed
    // to hold it, and needing a prop under every fragment instead.
    const nb: [number, number][] = [[mx - 1, my], [mx + 1, my], [mx, my - 1], [mx, my + 1]];
    for (let z = tile; z < h; z++) {
      for (const [nx, ny] of nb) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= d) continue;
        if (moduleHas(nx, ny, z)) { setModule(mx, my, z, 1); break; }
      }
    }
  }

  // A connected footprint does not guarantee a connected solid: two adjacent
  // columns can hold material at heights that never meet. Whatever is still
  // adrift is propped up, one module column each.
  const carvedTotal = countSolid(grid);
  const filledColumns = fillStragglers(grid, tile, xySub, setModule);
  const after = countSolid(grid);

  // Shave overhangs last, after the props are in.
  //
  // Erosion cascades: remove a layer and the one above loses its support too.
  // Run before propping, that ate a seated cat down to a fifth of itself. Run
  // after, each prop anchors a 45-degree cone around itself and the shape
  // mostly survives -- the same reason a real print needs only a few support
  // towers rather than a solid block.
  const shaved = opts.selfSupport ? makeSelfSupporting(grid, tile) : 0;

  return {
    grid,
    code,
    spanModules,
    originModule,
    xySub,
    droppedSpecks: dropped,
    shavedFraction: carvedTotal ? shaved / carvedTotal : 0,
    bridges: bridges.length,
    filledColumns,
    fillFraction: carvedTotal ? (after - carvedTotal) / carvedTotal : 0,
    looseParts: componentCount(grid),
  };
}

/**
 * Remove footprint fragments of at most `maxModules`, via `clear` per module.
 * Operates on the module footprint so a whole speck goes at once, and updates it
 * in place so the bridging that follows never sees them.
 */
function dropSpecks(
  foot: Uint8Array, w: number, maxModules: number,
  clear: (mx: number, my: number) => void,
): number {
  const seen = new Uint8Array(foot.length);
  let dropped = 0;
  for (let s = 0; s < foot.length; s++) {
    if (!foot[s] || seen[s]) continue;
    const cells: number[] = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      cells.push(p);
      const x = p % w, y = Math.floor(p / w);
      const d = foot.length / w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < d - 1 ? p + w : -1]) {
        if (q >= 0 && foot[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (cells.length > maxModules) continue;
    for (const c of cells) {
      foot[c] = 0;
      clear(c % w, Math.floor(c / w));
    }
    dropped++;
  }
  return dropped;
}

function countSolid(g: VoxelGrid): number {
  let n = 0;
  for (const v of g.data) n += v;
  return n;
}

/**
 * Anchor whatever is still adrift, using as little material as possible.
 *
 * A part that floats needs only ONE column reaching the tile, not all of them.
 * Filling every column -- which is what grounding does -- turns a canopy into a
 * solid mass and costs a tree most of its shape; filling one gives it a trunk.
 * The column chosen is the one whose part hangs lowest, so the support is the
 * shortest available and reads as the stem it effectively is. A whole module is
 * propped rather than a single sub-voxel, which would be thinner than a nozzle
 * can lay down.
 */
function fillStragglers(
  g: VoxelGrid, tile: number, xySub: number,
  setModule: (mx: number, my: number, z: number, v: number) => void,
): number {
  const N = g.w * g.d;
  let filled = 0;
  for (let pass = 0; pass < 12; pass++) {
    const { label, anchored } = labelAnchored(g, tile);
    const lowest = new Map<number, { mx: number; my: number; z: number }>();
    for (let i = 0; i < g.data.length; i++) {
      if (!g.data[i]) continue;
      const id = label[i];
      if (!id || anchored.has(id)) continue;
      const z = Math.floor(i / N);
      const cur = lowest.get(id);
      if (!cur || z < cur.z) {
        const cell = i % N;
        lowest.set(id, {
          mx: Math.floor((cell % g.w) / xySub),
          my: Math.floor(Math.floor(cell / g.w) / xySub),
          z,
        });
      }
    }
    if (!lowest.size) return filled;
    for (const { mx, my, z } of lowest.values()) {
      for (let k = 0; k < z; k++) setModule(mx, my, k, 1);
      filled++;
    }
  }
  return filled;
}

/**
 * Label connected bodies, using the connectivity a printer actually gives.
 *
 * Within a layer, only face contact counts: two cells meeting at a corner are
 * laid down as separate beads and do not fuse. Between layers it is different --
 * a cell resting anywhere on the 3x3 beneath it overlaps that material as it is
 * extruded and bonds to it, which is precisely why a 45-degree wall prints at
 * all. Treating those as separate would report a self-supporting model, the one
 * built to print cleanly, as though it were in pieces.
 */
function labelAnchored(g: VoxelGrid, tile: number) {
  const label = new Int32Array(g.data.length);
  const anchored = new Set<number>();
  const N = g.w * g.d;
  const stack: number[] = [];
  let id = 0;

  const pushNeighbours = (p: number, x: number, y: number, z: number) => {
    if (x > 0) stack.push(p - 1);
    if (x < g.w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - g.w);
    if (y < g.d - 1) stack.push(p + g.w);
    for (const dz of [-1, 1]) {
      const zz = z + dz;
      if (zz < 0 || zz >= g.h) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= g.d) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= g.w) continue;
          stack.push(zz * N + yy * g.w + xx);
        }
      }
    }
  };

  for (let s = 0; s < g.data.length; s++) {
    if (!g.data[s] || label[s]) continue;
    id++;
    let touches = false;
    label[s] = id;
    const work = [s];
    while (work.length) {
      const p = work.pop()!;
      const x = p % g.w, y = Math.floor(p / g.w) % g.d, z = Math.floor(p / N);
      if (z < tile) touches = true;
      stack.length = 0;
      pushNeighbours(p, x, y, z);
      for (const q of stack) {
        if (g.data[q] && !label[q]) { label[q] = id; work.push(q); }
      }
    }
    if (touches) anchored.add(id);
  }
  return { label, anchored };
}

function componentCount(g: VoxelGrid): number {
  const { anchored, label } = labelAnchored(g, 1);
  let max = 0;
  for (const v of label) if (v > max) max = v;
  // Everything standing on the plate is held together by it.
  return Math.max(1, max - anchored.size + (anchored.size ? 1 : 0));
}
