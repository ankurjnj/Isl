import { Bitmap, flipY } from './bitmap';
import { VoxelGrid } from './voxel';

/**
 * What an FDM printer will make of this design.
 *
 * The geometry can be flawless and still print badly: a QR is thousands of
 * small square features, and once a module approaches the nozzle's own width
 * the printer stops resolving them. These are the numbers that decide it,
 * reported rather than guessed at, so the trade between a finer sculpture and a
 * printable one is visible while it is being made.
 */
export interface PrintCheck {
  /** Module width as a multiple of the nozzle. Below ~4 the code gets fragile. */
  modulePasses: number;
  /** Dark modules with no orthogonal neighbour: the smallest islands on the plate. */
  isolatedModules: number;
  /**
   * Dark pairs touching only at a corner. The printed neck has zero width, so a
   * slicer either leaves them separate (correct, but a visible seam) or squishes
   * them together. Harmless to a scanner, which reads module centres, but it is
   * the count that rises fastest as modules shrink.
   */
  cornerContacts: number;
  /** Total layers at the given layer height. */
  layers: number;
  widthMm: number;
  heightMm: number;
  verdict: 'comfortable' | 'tight' | 'too fine';
  notes: string[];
}

export function checkPrintability(
  code: Bitmap,
  grid: VoxelGrid,
  opts: { moduleMm: number; layerMm: number; baseMm: number; nozzleMm: number },
): PrintCheck {
  const phys = flipY(code);
  const w = phys.w, h = phys.h;
  const dark = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : phys.data[y * w + x];

  let isolatedModules = 0;
  let cornerContacts = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!dark(x, y)) continue;
      if (!dark(x - 1, y) && !dark(x + 1, y) && !dark(x, y - 1) && !dark(x, y + 1)) isolatedModules++;
      // Count each corner-touching pair once, from its lower-left member.
      for (const [dx, dy] of [[1, 1], [1, -1]] as const) {
        if (dark(x + dx, y + dy) && !dark(x + dx, y) && !dark(x, y + dy)) cornerContacts++;
      }
    }
  }

  const modulePasses = opts.moduleMm / opts.nozzleMm;
  const heightMm = opts.baseMm + grid.h * opts.layerMm;
  const notes: string[] = [];

  // Four nozzle widths is two perimeters and a little infill: the point below
  // which a square stops being a square.
  let verdict: PrintCheck['verdict'] = 'comfortable';
  if (modulePasses < 3) {
    verdict = 'too fine';
    notes.push(
      `A module is ${opts.moduleMm.toFixed(1)} mm — only ${modulePasses.toFixed(1)} nozzle widths. ` +
      'It cannot hold its shape; the code will smear.',
    );
  } else if (modulePasses < 5) {
    verdict = 'tight';
    notes.push(
      `A module is ${modulePasses.toFixed(1)} nozzle widths. Printable, but squish will round the corners ` +
      'and neighbouring modules may bleed together.',
    );
  }
  if (cornerContacts > 200) {
    notes.push(
      `${cornerContacts} pairs of modules touch only at a corner. Harmless to a scanner, but they are the ` +
      'first thing to blur when modules get small — a coarser code has far fewer.',
    );
  }
  if (opts.layerMm > opts.nozzleMm * 0.75) {
    notes.push(
      `Layers are ${opts.layerMm} mm against a ${opts.nozzleMm} mm nozzle. Keep layer height under about ` +
      `${(opts.nozzleMm * 0.75).toFixed(2)} mm or adhesion suffers.`,
    );
  }

  return {
    modulePasses,
    isolatedModules,
    cornerContacts,
    layers: Math.ceil(heightMm / opts.layerMm),
    widthMm: grid.w * opts.moduleMm,
    heightMm,
    verdict,
    notes,
  };
}

/**
 * The coarsest code that still gives the sculpture a workable grid.
 *
 * Detail and printability pull against each other here, because the code's
 * module grid IS the sculpture's resolution. The useful move is not to shrink
 * modules but to give the sculpture more of a smaller code: a span of 0.8 on a
 * 41-module code buys the same 33-module sculpture as a span of 0.55 on a
 * 65-module one, with modules 60% wider.
 */
export function suggestModuleMm(nozzleMm: number): number {
  // Six passes: two perimeters each side plus infill, with room for squish.
  return Math.max(1.2, Math.round(nozzleMm * 6 * 10) / 10);
}
