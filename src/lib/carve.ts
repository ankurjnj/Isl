import { Bitmap, flipY, makeBitmap } from './bitmap';
import { Sdf } from './sdf';
import { VoxelGrid, idx } from './voxel';

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
  /** Vertical voxels per module. The one axis free of the module grid. */
  zSub: number;
  /** Layers of raised code beneath the sculpture. */
  tileLayers: number;
}

export interface CarveResult {
  grid: VoxelGrid;
  /** The code as a scanner sees it: the original plus the bridges. */
  code: Bitmap;
  spanModules: number;
  originModule: number;
  /** Light modules darkened to join fragments. Each is one module of error. */
  bridges: number;
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

  // Physical space: an observer looking down with +x to their right sees +y
  // going up their view, so image row 0 must sit at the far edge. Without this
  // the print is a vertical mirror of the code, which no rotation can fix.
  const phys = flipY(qr);
  const grid: VoxelGrid = { w, d, h, data: new Uint8Array(w * d * h) };

  // The tile: every dark module, raised.
  for (let z = 0; z < tile; z++) {
    for (let i = 0; i < w * d; i++) if (phys.data[i]) grid.data[z * w * d + i] = 1;
  }

  // The sculpture, kept only where the code is dark.
  const tol = 0.45 / (spanModules * scale);
  for (let z = 0; z < sculptH; z++) {
    const mz = z0 + ((z + 0.5) / sculptH) * (aspect / scale);
    for (let y = 0; y < spanModules; y++) {
      const my = ((y + 0.5) / spanModules - 0.5) / scale;
      for (let x = 0; x < spanModules; x++) {
        const gx = x + originModule, gy = y + originModule;
        if (!phys.data[gy * w + gx]) continue;
        if (model(((x + 0.5) / spanModules - 0.5) / scale, my, mz) < tol) {
          grid.data[idx(grid, gx, gy, z + tile)] = 1;
        }
      }
    }
  }

  // Bridge the sculpture's footprint. Bridges may only be placed under the
  // sculpture -- darkening a module out in the open pattern would be a visible
  // blemish for no structural gain.
  const foot = new Uint8Array(w * d);
  for (let z = tile; z < h; z++) {
    for (let i = 0; i < w * d; i++) if (grid.data[z * w * d + i]) foot[i] = 1;
  }
  const allowed = new Uint8Array(w * d);
  for (let y = originModule; y < originModule + spanModules; y++) {
    for (let x = originModule; x < originModule + spanModules; x++) allowed[y * w + x] = 1;
  }
  const { bridges } = bridgeFootprint(foot, w, d, allowed);

  const code = makeBitmap(w, d);
  code.data.set(qr.data);
  const N = w * d;
  for (const i of bridges) {
    const x = i % w, y = Math.floor(i / w);
    // A bridge is a real dark module: it joins the sculpture, raises the tile
    // beneath it, and must appear in the code a scanner reads.
    for (let z = 0; z < tile; z++) grid.data[z * N + i] = 1;
    code.data[(d - 1 - y) * w + x] = 1;

    // And it has to carry material at the heights its neighbours occupy.
    // Joining fragments only in plan leaves them still adrift in space -- a
    // mushroom cap floating a dozen layers above the bridge that was supposed
    // to hold it, and needing a prop under every fragment instead.
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < d - 1 ? i + w : -1]
      .filter((q) => q >= 0);
    for (let z = tile; z < h; z++) {
      for (const q of nb) {
        if (grid.data[z * N + q]) { grid.data[z * N + i] = 1; break; }
      }
    }
  }

  // A connected footprint does not guarantee a connected solid: two adjacent
  // columns can hold material at heights that never meet. Whatever is still
  // adrift is filled down to the tile -- the fewest columns that will do,
  // rather than the blanket grounding that would flatten the whole shape.
  const before = countSolid(grid);
  const filledColumns = fillStragglers(grid, tile);
  const after = countSolid(grid);

  return {
    grid,
    code,
    spanModules,
    originModule,
    bridges: bridges.length,
    filledColumns,
    fillFraction: before ? (after - before) / before : 0,
    looseParts: componentCount(grid),
  };
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
 * shortest available and reads as the stem it effectively is.
 */
function fillStragglers(g: VoxelGrid, tile: number): number {
  const N = g.w * g.d;
  let filled = 0;
  for (let pass = 0; pass < 12; pass++) {
    const { label, anchored } = labelAnchored(g, tile);
    // Per loose part, the column where its material sits lowest.
    const lowest = new Map<number, { col: number; z: number }>();
    for (let i = 0; i < g.data.length; i++) {
      if (!g.data[i]) continue;
      const id = label[i];
      if (!id || anchored.has(id)) continue;
      const z = Math.floor(i / N);
      const cur = lowest.get(id);
      if (!cur || z < cur.z) lowest.set(id, { col: i % N, z });
    }
    if (!lowest.size) return filled;
    for (const { col, z } of lowest.values()) {
      for (let k = 0; k < z; k++) g.data[k * N + col] = 1;
      filled++;
    }
  }
  return filled;
}

function labelAnchored(g: VoxelGrid, tile: number) {
  const label = new Int32Array(g.data.length);
  const anchored = new Set<number>();
  const N = g.w * g.d;
  const stack: number[] = [];
  let id = 0;
  for (let s = 0; s < g.data.length; s++) {
    if (!g.data[s] || label[s]) continue;
    id++;
    let touches = false;
    label[s] = id;
    stack.push(s);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % g.w, y = Math.floor(p / g.w) % g.d, z = Math.floor(p / N);
      if (z < tile) touches = true;
      for (const q of [
        x > 0 ? p - 1 : -1, x < g.w - 1 ? p + 1 : -1,
        y > 0 ? p - g.w : -1, y < g.d - 1 ? p + g.w : -1,
        z > 0 ? p - N : -1, z < g.h - 1 ? p + N : -1,
      ]) if (q >= 0 && g.data[q] && !label[q]) { label[q] = id; stack.push(q); }
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
