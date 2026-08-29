import { VoxelGrid } from './voxel';

export interface MeshOptions {
  /** Edge length of one QR module, in mm. */
  moduleMm: number;
  /** Height of one voxel layer, in mm. */
  layerMm: number;
  /** Thickness of the light-coloured base plate, in mm. */
  baseMm: number;
  /** Where the grid's (0,0,0) corner sits, in mm. Lets a fine-resolution
   *  figure be placed on a coarse tile in the same coordinate space. */
  origin?: [number, number, number];
  /** Emit the base plate. Only the tile needs one. */
  withBase?: boolean;
}

export interface Mesh {
  /** Flat triangle list: 9 floats per triangle. */
  positions: Float32Array;
  normals: Float32Array;
  triangleCount: number;
}

/**
 * The printed volumes, kept apart.
 *
 * They are separate because they must be *printed* separately: the contrast a
 * scanner needs comes from one being a different colour to the other. Splitting
 * them here means the viewer can show that contrast and the slicer gets an
 * unambiguous colour boundary.
 */
export interface SculptureMesh {
  /** The sculpture and the code, below any top coat. */
  body: Mesh;
  /** The plate everything stands on. Printed in the light colour. */
  base: Mesh;
  /**
   * The skin facing the sky, when a top coat was asked for.
   *
   * Empty otherwise. Its boundary follows the surface rather than sitting at
   * one height, so a slicer needs it as a second body -- a filament change at a
   * layer cannot express it.
   */
  cap: Mesh;
}

function drain(s: Sink): Mesh {
  const mesh: Mesh = {
    positions: new Float32Array(s.pos),
    normals: new Float32Array(s.nrm),
    triangleCount: s.pos.length / 9,
  };
  s.pos = [];
  s.nrm = [];
  return mesh;
}

/** Concatenate meshes, for exporting one printable file. */
export function concatMeshes(...meshes: Mesh[]): Mesh {
  const tris = meshes.reduce((a, m) => a + m.triangleCount, 0);
  const positions = new Float32Array(tris * 9);
  const normals = new Float32Array(tris * 9);
  let o = 0;
  for (const m of meshes) {
    positions.set(m.positions, o);
    normals.set(m.normals, o);
    o += m.positions.length;
  }
  return { positions, normals, triangleCount: tris };
}

interface Sink {
  pos: number[];
  nrm: number[];
}

function quad(
  s: Sink,
  a: [number, number, number], b: [number, number, number],
  c: [number, number, number], d: [number, number, number],
  n: [number, number, number],
) {
  s.pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < 6; i++) s.nrm.push(...n);
}

function box(s: Sink, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  quad(s, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
  quad(s, [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0], [0, 0, -1]);
  quad(s, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
  quad(s, [x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [-1, 0, 0]);
  quad(s, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]);
  quad(s, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
}

/**
 * Surface-extract the voxel grid with greedy quad merging.
 *
 * Emitting six quads per voxel would put a 45x45x34 grid well past 100k
 * triangles and produce STLs in the tens of MB. Greedy merging coalesces
 * coplanar faces into the largest rectangles that share an orientation, which
 * on QR geometry -- full of long flat runs -- cuts the count by an order of
 * magnitude. The result is still the exact boundary of the voxel set, so the
 * shape is unchanged.
 */
export function meshSculpture(grid: VoxelGrid, opts: MeshOptions): SculptureMesh {
  const { moduleMm, layerMm, baseMm } = opts;
  const [ox, oy, oz] = opts.origin ?? [0, 0, 0];
  const s: Sink = { pos: [], nrm: [] };

  const dims = [grid.w, grid.d, grid.h];
  const scale = [moduleMm, moduleMm, layerMm];
  const offset = [ox, oy, oz];

  const solid = (c: number[]) => {
    if (c[0] < 0 || c[1] < 0 || c[2] < 0) return 0;
    if (c[0] >= grid.w || c[1] >= grid.d || c[2] >= grid.h) return 0;
    return grid.data[(c[2] * grid.d + c[1]) * grid.w + c[0]];
  };

  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    const mask = new Int8Array(dims[u] * dims[v]);
    const c = [0, 0, 0];
    const q = [0, 0, 0];
    q[axis] = 1;

    for (c[axis] = -1; c[axis] < dims[axis]; c[axis]++) {
      // Face between slice c[axis] and c[axis]+1.
      let m = 0;
      for (c[v] = 0; c[v] < dims[v]; c[v]++) {
        for (c[u] = 0; c[u] < dims[u]; c[u]++) {
          const here = solid(c);
          const next = solid([c[0] + q[0], c[1] + q[1], c[2] + q[2]]);
          mask[m++] = here && !next ? 1 : !here && next ? -1 : 0;
        }
      }

      m = 0;
      for (let j = 0; j < dims[v]; j++) {
        for (let i = 0; i < dims[u];) {
          const val = mask[m];
          if (!val) { i++; m++; continue; }
          // Widen along u, then grow along v while the whole row matches.
          let wq = 1;
          while (i + wq < dims[u] && mask[m + wq] === val) wq++;
          let hq = 1;
          grow: while (j + hq < dims[v]) {
            for (let k = 0; k < wq; k++) {
              if (mask[m + hq * dims[u] + k] !== val) break grow;
            }
            hq++;
          }

          const base = [0, 0, 0];
          base[axis] = c[axis] + 1;
          base[u] = i;
          base[v] = j;
          const du = [0, 0, 0]; du[u] = wq;
          const dv = [0, 0, 0]; dv[v] = hq;

          const pt = (a: number[], b: number[], cc: number[]): [number, number, number] => [
            (a[0] + b[0] + cc[0]) * scale[0] + offset[0],
            (a[1] + b[1] + cc[1]) * scale[1] + offset[1],
            (a[2] + b[2] + cc[2]) * scale[2] + offset[2],
          ];
          const zero = [0, 0, 0];
          const n: [number, number, number] = [0, 0, 0];
          n[axis] = val;

          const p0 = pt(base, zero, zero);
          const p1 = pt(base, du, zero);
          const p2 = pt(base, du, dv);
          const p3 = pt(base, zero, dv);
          // Wind so the triangle normal agrees with the face direction.
          if (val > 0) quad(s, p0, p1, p2, p3, n);
          else quad(s, p0, p3, p2, p1, n);

          for (let b = 0; b < hq; b++) {
            for (let a = 0; a < wq; a++) mask[m + b * dims[u] + a] = 0;
          }
          i += wq;
          m += wq;
        }
      }
    }
  }

  const body = drain(s);

  // Base plate: the light-coloured slab everything stands on. It is what gives
  // the top view its contrast, and it ties the QR's isolated dark modules into
  // one printable piece.
  if (baseMm > 0 && (opts.withBase ?? true)) {
    box(s, ox, oy, 0, ox + grid.w * moduleMm, oy + grid.d * moduleMm, baseMm);
  }
  const base = drain(s);

  return { body, base, cap: drain(s) };
}
