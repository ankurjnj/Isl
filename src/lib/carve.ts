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
 * What holds it together is the ground it stands on. Every dark module gets a
 * height of its own: a landform swelling out of the sculpture and falling away
 * toward the rim, undulating gently over the far field. That covers the code
 * edge to edge -- no dark module is left as flat plate, which is what a
 * silhouette alone can never manage, since fitting a rocket to the code still
 * leaves three quarters of it bare -- and it grounds the fragments as a side
 * effect, because a piece resting on the skirt is a piece resting on the plate.
 *
 * The skirt costs the code nothing. It only ever adds material above modules
 * that are already dark, so the pattern a scanner reads is the QR exactly as
 * generated, with no error budget spent and nothing for the correction to undo.
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
  /** The code as a scanner sees it. Unmodified: the skirt spends no budget. */
  code: Bitmap;
  spanModules: number;
  originModule: number;
  /** Sculpture voxels per module across. */
  xySub: number;
  /** Share of the code's dark modules carrying sculpture above the tile. */
  coverageFraction: number;
  /** Fragments too small to be worth keeping, cleared instead. */
  droppedSpecks: number;
  /** Columns cut back because they stood clear of everything around them. */
  trimmedColumns: number;
  /** Share of the carved model shaved away to make it self-supporting. */
  shavedFraction: number;
  /** Supports added under parts that reached nothing. One column each. */
  filledColumns: number;
  /** Voxels the filling added, against the carved total. */
  fillFraction: number;
  looseParts: number;
}

export function carveSculpture(qr: Bitmap, quietZone: number, moduleCount: number, model: Sdf, opts: CarveOptions): CarveResult {
  const w = qr.w, d = qr.h;
  const spanModules = Math.max(4, Math.min(moduleCount, Math.round(moduleCount * opts.span)));
  const originModule = quietZone + Math.floor((moduleCount - spanModules) / 2);
  const xySub = Math.max(1, Math.round(opts.xySub));

  // Normalise the model into its footprint.
  //
  // The bounding box its primitives carry is the wrong thing to fit: a whale's
  // box is as wide as its flukes but its body is half that deep, so fitting the
  // box leaves the code's near and far edges flat. What has to reach the edges
  // is the silhouette, so the silhouette is what gets measured -- sampled once,
  // coarsely, and fitted per axis. A little anisotropy is worth it; a lot is
  // not, so the two scales are held within a ratio of each other.
  const fit = fitFootprint(model);
  const { cx, cy, z0, sx: fitSx, sy: fitSy } = fit;
  const scale = Math.sqrt(fitSx * fitSy);
  const aspect = Math.max(0.2, (fit.z1 - fit.z0) * scale);
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
    const mz = z0 + ((z + 0.5) / sculptH) * (fit.z1 - fit.z0);
    for (let y = 0; y < sxSpan; y++) {
      const my = cy + ((y + 0.5) / sxSpan - 0.5) / fitSy;
      const gy = y + sxOrigin;
      for (let x = 0; x < sxSpan; x++) {
        const gx = x + sxOrigin;
        if (!darkAt(gx, gy)) continue;
        if (model(cx + ((x + 0.5) / sxSpan - 0.5) / fitSx, my, mz) < tol) {
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

  // Specks are found on the module grid: a whole module is the smallest thing
  // worth reasoning about here, and it is what gets cleared.
  const foot = new Uint8Array(w * d);
  for (let z = tile; z < h; z++) {
    for (let sy = 0; sy < D; sy++) {
      for (let sx = 0; sx < W; sx++) {
        if (grid.data[z * N + sy * W + sx]) foot[Math.floor(sy / xySub) * w + Math.floor(sx / xySub)] = 1;
      }
    }
  }

  // A fragment one or two modules across contributes nothing to the shape and,
  // standing over an isolated dark module, tends to be a tall thin sliver that
  // has to be propped or deleted later anyway. Clearing it here is cheaper and
  // safe: the skirt still gives that module its height, so the code keeps its
  // relief -- the sculpture simply has nothing above it there.
  const dropped = dropSpecks(foot, w, 2, (mx, my) => {
    for (let z = tile; z < h; z++) setModule(mx, my, z, 0);
  });

  const code = makeBitmap(w, d);
  code.data.set(qr.data);

  // The skirt: ground the sculpture stands on, covering the code edge to edge.
  //
  // A sculpture's silhouette is never square. Fit a rocket to the code and it
  // still only covers a quarter of the dark modules; the rest stay flat tile,
  // and the print reads as an object placed on a code rather than a code that
  // is an object. So every dark module the sculpture does not reach gets a
  // height of its own -- a landform swelling out of the model and falling away
  // toward the rim, with a low undulation over the far field so the outer
  // modules are relief rather than plate.
  //
  // It costs the code nothing: it only ever adds material above modules that
  // are already dark, so the view from above is unchanged. And every skirt
  // column is solid from the tile up, so it needs no support and anchors
  // whatever sits on it.
  {
    const darkMod = new Uint8Array(w * d);
    for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) darkMod[y * w + x] = phys.data[y * w + x];

    const top = new Int32Array(w * d).fill(-1);
    for (let my = 0; my < d; my++) {
      for (let mx = 0; mx < w; mx++) {
        if (!darkMod[my * w + mx]) continue;
        for (let z = h - 1; z >= tile; z--) {
          if (moduleHas(mx, my, z)) { top[my * w + mx] = z; break; }
        }
      }
    }

    // Scaled to the sculpture, not fixed: three layers of undulation reads as
    // terrain under a thumb-sized figure and as nothing at all under a
    // hundred-and-forty-layer rocket.
    const cap = tile + Math.max(2, Math.round(sculptH * 0.28));
    const reach = Math.max(3, Math.round(spanModules * 0.28));
    const decay = (cap - tile) / reach;
    const amp = Math.max(2, Math.round(sculptH * 0.06));

    // Multi-source BFS outward from the sculpture, carrying the height it left
    // from, so the skirt falls away from whatever it grew out of.
    const dist = new Int32Array(w * d).fill(-1);
    const src = new Int32Array(w * d).fill(-1);
    const queue: number[] = [];
    for (let i = 0; i < w * d; i++) {
      if (top[i] >= 0) { dist[i] = 0; src[i] = top[i]; queue.push(i); }
    }
    for (let qi = 0; qi < queue.length; qi++) {
      const p = queue[qi];
      const x = p % w, y = Math.floor(p / w);
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < d - 1 ? p + w : -1]) {
        if (q < 0 || !darkMod[q] || dist[q] >= 0) continue;
        dist[q] = dist[p] + 1;
        src[q] = src[p];
        queue.push(q);
      }
    }

    for (let my = 0; my < d; my++) {
      for (let mx = 0; mx < w; mx++) {
        const i = my * w + mx;
        if (!darkMod[i]) continue;
        const ground = tile + Math.round(relief(mx, my) * amp);
        let t = ground;
        if (dist[i] >= 0) {
          const from = Math.min(src[i], cap);
          t = Math.max(ground, from - Math.round(dist[i] * decay));
        }
        // Never bury what is already there.
        if (top[i] >= 0) t = Math.min(t, Math.max(ground, top[i]));
        for (let z = tile; z <= t && z < h; z++) setModule(mx, my, z, 1);
      }
    }
  }

  // A connected footprint does not guarantee a connected solid: two adjacent
  // columns can hold material at heights that never meet. Whatever is still
  // adrift is propped up, one module column each.
  const carvedTotal = countSolid(grid);

  // Trim, prop, shave -- and then again, because each undoes a little of the
  // last. Shaving is erosion: it eats the canopy around a column and leaves the
  // column standing proud, so a tree that had no needles before the shave grew
  // six after it. A second round settles it; a third finds nothing.
  //
  // The order within a round matters. A needle trimmed is a needle that needs
  // no prop, so trimming comes first. Shaving comes last, after the props are
  // in: run before them it cascades, and it once ate a seated cat down to a
  // fifth of itself, where afterwards each prop anchors a 45-degree cone around
  // itself and the shape mostly survives.
  let trimmedColumns = 0, filledColumns = 0, shaved = 0, after = 0;
  for (let round = 0; round < 2; round++) {
    trimmedColumns += trimSpikes(grid, tile, xySub, 4, setModule);
    filledColumns += fillStragglers(grid, tile, xySub, setModule);
    if (round === 0) after = countSolid(grid);
    if (opts.selfSupport) shaved += makeSelfSupporting(grid, tile);
  }

  // What the code looks like as a solid: the share of it that is sculpted at
  // all, rather than left as flat plate.
  let darkModules = 0, covered = 0;
  for (let my = 0; my < d; my++) {
    for (let mx = 0; mx < w; mx++) {
      if (!phys.data[my * w + mx]) continue;
      darkModules++;
      for (let z = tile; z < h; z++) {
        if (moduleHas(mx, my, z)) { covered++; break; }
      }
    }
  }

  return {
    grid,
    code,
    spanModules,
    originModule,
    xySub,
    droppedSpecks: dropped,
    trimmedColumns,
    shavedFraction: carvedTotal ? shaved / carvedTotal : 0,
    coverageFraction: darkModules ? covered / darkModules : 0,
    filledColumns,
    fillFraction: carvedTotal ? (after - carvedTotal) / carvedTotal : 0,
    looseParts: componentCount(grid),
  };
}

/**
 * A low undulation over the code, in 0..1, so the far field is not a plate.
 *
 * Two octaves of value noise on a coarse lattice: smooth enough that
 * neighbouring modules stay within a step or two of each other, which keeps the
 * skirt something a printer can lay down, and deterministic so a design rebuilds
 * identically every time.
 */
function relief(mx: number, my: number): number {
  const hash = (a: number, b: number) => {
    let n = (a * 374761393 + b * 668265263) | 0;
    n = (n ^ (n >>> 13)) * 1274126177 | 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const octave = (L: number, seed: number) => {
    const gx = Math.floor(mx / L), gy = Math.floor(my / L);
    const fx = (mx / L) - gx, fy = (my / L) - gy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(gx + seed, gy), b = hash(gx + 1 + seed, gy);
    const c = hash(gx + seed, gy + 1), e = hash(gx + 1 + seed, gy + 1);
    const lo = a + (b - a) * sx, hi = c + (e - c) * sx;
    return lo + (hi - lo) * sy;
  };
  return octave(7, 0) * 0.65 + octave(3, 977) * 0.35;
}

/**
 * Measure the model's silhouette and fit it to the code square.
 *
 * Sampled coarsely -- a few tens of thousands of field evaluations against the
 * millions the carve itself does -- and only the top-down silhouette matters,
 * so a column counts as soon as anything anywhere up its height is inside.
 */
function fitFootprint(model: Sdf): { cx: number; cy: number; sx: number; sy: number; z0: number; z1: number } {
  const b = model.bounds;
  if (!b || !Number.isFinite(b[0]) || !(b[3] > b[0])) {
    return { cx: 0, cy: 0, sx: 1, sy: 1, z0: 0, z1: 1 };
  }
  const S = 40, H = 28;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let j = 0; j < S; j++) {
    const my = b[1] + ((j + 0.5) / S) * (b[4] - b[1]);
    for (let i = 0; i < S; i++) {
      const mx = b[0] + ((i + 0.5) / S) * (b[3] - b[0]);
      let hit = false;
      for (let k = 0; k < H && !hit; k++) {
        const mz = b[2] + ((k + 0.5) / H) * (b[5] - b[2]);
        if (model(mx, my, mz) < 0) hit = true;
      }
      if (!hit) continue;
      if (mx < x0) x0 = mx;
      if (mx > x1) x1 = mx;
      if (my < y0) y0 = my;
      if (my > y1) y1 = my;
    }
  }
  if (!Number.isFinite(x0) || x1 <= x0 || y1 <= y0) {
    const r = Math.max(Math.abs(b[0]), Math.abs(b[3]), Math.abs(b[1]), Math.abs(b[4])) || 1;
    return { cx: 0, cy: 0, sx: 0.5 / r, sy: 0.5 / r, z0: b[2], z1: b[5] };
  }
  // Half a sample of margin each way, so the coarse grid does not clip the
  // silhouette it was measuring.
  const px = (x1 - x0) / (S - 1) * 0.5, py = (y1 - y0) / (S - 1) * 0.5;
  let sx = 0.5 / ((x1 - x0) / 2 + px), sy = 0.5 / ((y1 - y0) / 2 + py);
  const MAX_ANISO = 1.7;
  if (sx > sy * MAX_ANISO) sx = sy * MAX_ANISO;
  if (sy > sx * MAX_ANISO) sy = sx * MAX_ANISO;
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, sx, sy, z0: b[2], z1: b[5] };
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

/**
 * Cut back columns that stand far clear of everything around them.
 *
 * Carving leaves needles: a dark module with no dark neighbour still rises to
 * meet the model's surface, so it prints as a lone spike attached only at its
 * foot. On a seated cat ten of these stood more than six layers above every
 * neighbour, the worst by ninety-one. They read as debris rather than form, and
 * a one-module-square spike ninety layers tall is not something to hand a
 * printer either.
 *
 * Trimming only removes material, so the code is untouched -- the tile beneath
 * still carries every dark module -- and nothing can be left floating, since a
 * column is cut from the top down.
 */
function trimSpikes(
  g: VoxelGrid, tile: number, xySub: number, allowance: number,
  setModule: (mx: number, my: number, z: number, v: number) => void,
): number {
  const N = g.w * g.d;
  const mods = Math.floor(g.w / xySub);
  const top = new Int32Array(mods * mods);
  let trimmed = 0;

  for (let pass = 0; pass < 3; pass++) {
    top.fill(-1);
    for (let z = g.h - 1; z >= 0; z--) {
      for (let y = 0; y < g.d; y++) {
        for (let x = 0; x < g.w; x++) {
          if (!g.data[z * N + y * g.w + x]) continue;
          const k = Math.floor(y / xySub) * mods + Math.floor(x / xySub);
          if (top[k] < 0) top[k] = z;
        }
      }
    }
    let cut = 0;
    for (let my = 0; my < mods; my++) {
      for (let mx = 0; mx < mods; mx++) {
        const h = top[my * mods + mx];
        if (h < tile) continue;
        let tallest = tile - 1;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = mx + dx, ny = my + dy;
          if (nx < 0 || ny < 0 || nx >= mods || ny >= mods) continue;
          tallest = Math.max(tallest, top[ny * mods + nx]);
        }
        const limit = tallest + allowance;
        if (h <= limit) continue;
        for (let z = limit + 1; z <= h; z++) setModule(mx, my, z, 0);
        cut++;
      }
    }
    trimmed += cut;
    if (!cut) break;
  }
  return trimmed;
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
    const size = new Map<number, number>();
    for (let i = 0; i < g.data.length; i++) {
      if (!g.data[i]) continue;
      const id = label[i];
      if (!id || anchored.has(id)) continue;
      size.set(id, (size.get(id) ?? 0) + 1);
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
    for (const [id, { mx, my, z }] of lowest) {
      // A prop reaching a long way up to hold a scrap is itself a spike. Below
      // a certain size the part is not worth a column that tall -- delete it
      // and leave the tile carrying that module, as with the specks.
      if ((size.get(id) ?? 0) < z * 2) {
        for (let i = 0; i < g.data.length; i++) if (label[i] === id) g.data[i] = 0;
        continue;
      }
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
