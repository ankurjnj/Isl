import { Bitmap } from './bitmap';
import { EccLevel, makeQr, QrResult } from './qr';
import { concatMeshes, meshSculpture, Mesh } from './mesh';
import { carveSculpture, modelAspect } from './carve';
import { countOverhangs, splitTopSkin, VoxelGrid } from './voxel';
import { meshToObj, meshToStl } from './stl';
import { verifyTopView, VerifyResult } from './verify';
import { Sdf } from './sdf';
import { checkPrintability, PrintCheck } from './printability';

export interface DesignInput {
  payload: string;
  ecc: EccLevel;
  quietZone: number;
  /** Force a larger module grid than the payload needs. 0 = smallest that fits. */
  version: number;
  model: Sdf;
  /** Sculpture footprint, as a fraction of the code's width. */
  span: number;
  /** Vertical voxels per module. */
  zSub: number;
  /** Sculpture voxels per module across. Detail finer than the code itself. */
  xySub: number;
  /** Layers of raised code beneath the sculpture. */
  tileLayers: number;
  /** Shave the sculpture back to what prints without support material. */
  selfSupport: boolean;
  moduleMm: number;
  layerMm: number;
  baseMm: number;
  /**
   * Thickness of the dark skin over everything facing the sky, in mm.
   *
   * Zero prints the whole sculpture in one colour, where the code reads only by
   * relief. Anything above that coats the visible surface, so the print carries
   * a real black-on-light QR and the sculpture's own form stays legible in the
   * lighter filament instead of being lost in a dark mass.
   */
  topCoatMm: number;
  /** Printer nozzle, for the printability check. */
  nozzleMm: number;
}

export interface Dimensions {
  widthMm: number;
  depthMm: number;
  heightMm: number;
  figureMm: number;
}

export interface DesignReport {
  moduleCount: number;
  /** Modules the sculpture spans. */
  spanModules: number;
  /** Sculpture cells per module across, and their size in mm. */
  xySub: number;
  cellMm: number;
  /** True when detail was reduced to keep the build tractable. */
  detailCapped: boolean;
  /** Share of the sculpture shaved away to make it self-supporting. */
  shavedFraction: number;
  /** Needle columns cut back to sit with their neighbours. */
  trimmedColumns: number;
  /** True when the sculpture was cut back to keep the code readable. */
  spanClamped: boolean;
  /** Share of the code's dark modules that carry sculpture, not flat plate. */
  coverageFraction: number;
  /** Supports added under parts that reached nothing. One column each. */
  supports: number;
  /** Voxels those supports added, against the carved total. */
  fillFraction: number;
  looseParts: number;
  overhangs: number;
  triangles: number;
  /** Layers of dark skin over the visible surface. 0 = a single-colour print. */
  coatLayers: number;
}

export interface DesignView {
  qr: QrResult;
  grid: VoxelGrid;
  /** The code as a scanner sees it. Unmodified. */
  code: Bitmap;
  meshes: { body: Mesh; base: Mesh; cap: Mesh };
  verify: VerifyResult;
  dims: Dimensions;
  report: DesignReport;
  print: PrintCheck;
  warnings: string[];
}

export type Design = DesignView;

export const DEFAULT_INPUT: Omit<DesignInput, 'model' | 'payload'> = {
  ecc: 'H',
  quietZone: 4,
  // Deliberately coarse. The code's module grid is the sculpture's resolution,
  // so it is tempting to raise the version -- but a wide span on a small code
  // gives the same sculpture with far bigger modules, and the tile comes out
  // the same size either way. A 41-module code at 2.6 mm is 6.5 nozzle widths
  // per module; the 65-module code it replaces was 4.0 and printed poorly.
  version: 6,
  // The sculpture takes the whole code by default. Confined to a centre square
  // it reads as a lump dropped on a flat pattern; spanning the lot, the code
  // and the sculpture are one object.
  span: 1,
  zSub: 2,
  // The sculpture is sampled three times finer than the code across, which the
  // code does not mind: a sub-voxel sits wholly inside one module, and the tile
  // already raises every dark module, so a partly covered one still reads dark.
  xySub: 3,
  tileLayers: 2,
  // On by default: the point of this thing is that it prints.
  selfSupport: true,
  moduleMm: 2.6,
  layerMm: 0.6,
  baseMm: 1.6,
  // Two layers at the default layer height: enough to survive a stray scrape
  // and to read as solid black from above, without spending filament on a
  // thickness no one can see.
  topCoatMm: 1.2,
  nozzleMm: 0.4,
};

export function buildDesign(input: DesignInput): Design {
  const qr = makeQr(input.payload, input.ecc, input.quietZone, input.version || undefined);

  // Cap the grid before anything else touches it.
  //
  // Cells scale with the code's area times the sculpture's height, and detail
  // cubes all three, so a large code at high detail is tens of millions of
  // cells -- a minute of work, and a component-labelling pass that allocates
  // four bytes each on top. Left unbounded the build simply never returns and
  // the UI waits forever. Detail gives way rather than size or code version,
  // because those two are what the user is actually choosing between.
  const aspect = modelAspect(input.model);
  const gridCells = (sub: number) => {
    const across = (qr.moduleCount + input.quietZone * 2) * sub;
    const tall = Math.max(4, Math.round(qr.moduleCount * input.span * aspect * sub)) + input.tileLayers;
    return across * across * tall;
  };
  const CELL_BUDGET = 5e6;
  let detail = Math.max(1, Math.round(input.xySub));
  while (detail > 1 && gridCells(detail) > CELL_BUDGET) detail--;
  const zSub = Math.max(1, Math.min(input.zSub, detail));

  // No search, and no fitting to an error budget: the skirt never darkens a
  // light module, so the pattern a scanner reads is the code exactly as
  // generated. It decodes or the generator is broken. This used to be four
  // trial carves looking for a span the code could absorb.
  const carved = carveSculpture(qr.bitmap, qr.quietZone, qr.moduleCount, input.model, {
    span: input.span, zSub, xySub: detail,
    tileLayers: input.tileLayers, selfSupport: input.selfSupport,
  });
  const verify = verifyTopView(carved.code, input.payload);

  // The grid is finer than the code, so a cell is a fraction of a module.
  const cellMm = input.moduleMm / carved.xySub;
  const meshOpts = {
    moduleMm: cellMm, layerMm: input.layerMm, baseMm: input.baseMm,
    origin: [0, 0, input.baseMm] as [number, number, number],
  };
  const coatLayers = input.topCoatMm > 0
    ? Math.max(1, Math.round(input.topCoatMm / input.layerMm)) : 0;
  const { skin, core } = splitTopSkin(carved.grid, coatLayers);
  const meshed = meshSculpture(coatLayers ? core : carved.grid, { ...meshOpts, withBase: true });
  const cap = coatLayers
    ? meshSculpture(skin, { ...meshOpts, withBase: false }).body
    : { positions: new Float32Array(0), normals: new Float32Array(0), triangleCount: 0 };

  const dims: Dimensions = {
    widthMm: carved.grid.w * cellMm,
    depthMm: carved.grid.d * cellMm,
    heightMm: input.baseMm + carved.grid.h * input.layerMm,
    figureMm: carved.spanModules * input.moduleMm,
  };

  const report: DesignReport = {
    moduleCount: qr.moduleCount,
    spanModules: carved.spanModules,
    xySub: carved.xySub,
    cellMm,
    detailCapped: detail < Math.round(input.xySub),
    shavedFraction: carved.shavedFraction,
    trimmedColumns: carved.trimmedColumns,
    spanClamped: carved.spanModules < Math.round(qr.moduleCount * input.span),
    coverageFraction: carved.coverageFraction,
    supports: carved.filledColumns,
    fillFraction: carved.fillFraction,
    looseParts: carved.looseParts,
    overhangs: countOverhangs(carved.grid),
    triangles: meshed.body.triangleCount + meshed.base.triangleCount + cap.triangleCount,
    coatLayers,
  };

  const print = checkPrintability(carved.code, carved.grid, {
    moduleMm: input.moduleMm, layerMm: input.layerMm, baseMm: input.baseMm,
    nozzleMm: input.nozzleMm, cellMm,
  });

  return {
    qr, grid: carved.grid, code: carved.code,
    meshes: { body: meshed.body, base: meshed.base, cap },
    verify, dims, report, print,
    warnings: collectWarnings(input, report, verify, dims, print),
  };
}

/** Practical checks a slicer will not make for you. */
function collectWarnings(
  input: DesignInput, report: DesignReport, verify: VerifyResult, dims: Dimensions, print: PrintCheck,
): string[] {
  const w: string[] = [...print.notes];
  if (!verify.matches) {
    w.push(
      verify.decoded
        ? 'The top view decodes to different data than you entered. Do not print this.'
        : 'The top view did not decode. Please report this — the pattern is not modified, so it should not happen.',
    );
  }
  if (print.verdict !== 'comfortable') {
    w.push(
      'A coarser code prints far better and costs almost no sculpture detail: widen the sculpture instead ' +
      'of raising the code version, since the tile comes out the same size either way.',
    );
  }
  if (report.looseParts > 1) {
    w.push(`The sculpture is in ${report.looseParts} disconnected pieces and will not print as one object.`);
  }
  if (report.fillFraction > 0.25) {
    w.push(
      `Supporting this shape added ${(report.fillFraction * 100).toFixed(0)}% more material — it has parts ` +
      'floating well clear of anything beneath them, and they are being propped up to the tile.',
    );
  }
  if (report.detailCapped) {
    w.push(
      `Detail was reduced to ${report.xySub}× per module to keep this size of code workable. ` +
      'A smaller code or a smaller sculpture can carry more.',
    );
  }
  if (report.overhangs > 0) {
    w.push(
      `${report.overhangs} cells overhang steeper than 45° and will need support material. ` +
      'Turning on Self-supporting shaves them away instead.',
    );
  }
  if (report.shavedFraction > 0.15) {
    w.push(
      `Self-supporting removed ${(report.shavedFraction * 100).toFixed(0)}% of this shape — it flares out ` +
      'well beyond what a printer can bridge. Turn it off to keep the full form and print with supports.',
    );
  }
  if (input.baseMm < 0.8) w.push('The base plate is very thin and may warp or tear off the bed.');
  if (Math.max(dims.widthMm, dims.depthMm) > 250) {
    w.push(`At ${dims.widthMm.toFixed(0)} mm across this will not fit on most 220–250 mm beds.`);
  }
  return w;
}

export function exportStl(design: DesignView, name: string): ArrayBuffer {
  return meshToStl(concatMeshes(design.meshes.body, design.meshes.cap, design.meshes.base), name);
}

/**
 * The two colours as separate files, for a printer that can change filament.
 *
 * Both are written in the same coordinate space, so a slicer's "load as a
 * single object" or "align to first part" places them without any fitting --
 * the light file and the dark file interlock exactly as they were split.
 */
export function exportStlParts(design: DesignView, name: string): { light: ArrayBuffer; dark: ArrayBuffer } {
  return {
    light: meshToStl(concatMeshes(design.meshes.body, design.meshes.base), `${name}-light`),
    dark: meshToStl(design.meshes.cap, `${name}-dark`),
  };
}

export function exportObj(design: DesignView): string {
  return meshToObj(concatMeshes(design.meshes.body, design.meshes.cap, design.meshes.base));
}

export function printingNotes(input: Omit<DesignInput, 'model'>, design: DesignView): string[] {
  const coated = design.report.coatLayers > 0;
  return [
    coated
      ? `Two bodies, same coordinates: download the pair and load them together. The light file is the plate and the sculpture; the dark file is the ${design.report.coatLayers}-layer skin over everything facing up. Assign a matte dark filament to the dark file and a light one to the rest.`
      : `Insert a filament change at Z = ${input.baseMm.toFixed(2)} mm. Below it is the base plate — use a light colour. Above it is the code and the sculpture — use a dark, matte colour.`,
    ...(coated
      ? ['No multi-material printer? Print the whole thing in the light filament and roll dark ink across the top with a brayer or an ink pad. The skin is exactly the surface a roller touches, so the result is the same code — that is what the split is measuring.']
      : []),
    design.report.overhangs === 0
      ? 'No supports needed: nothing overhangs steeper than 45°.'
      : `Enable supports (${design.report.overhangs} cells steeper than 45°). They only touch the sculpture; the code tile needs none.`,
    `Modules are ${input.moduleMm} mm — ${design.print.modulePasses.toFixed(1)} passes of a ${input.nozzleMm} mm nozzle. Layers are ${input.layerMm} mm, so pick a layer height that divides it evenly.`,
    `${design.print.layers} layers, with ${design.print.isolatedModules} single-module islands on the plate — none of them load-bearing, since every one is fused to the base.`,
    `${design.dims.widthMm.toFixed(0)} × ${design.dims.depthMm.toFixed(0)} mm tile, ${design.dims.heightMm.toFixed(0)} mm tall, sculpture ${design.dims.figureMm.toFixed(0)} mm across.`,
    'Matte filament scans far better than glossy — specular highlights are what usually defeat a scanner on a printed code.',
    'Scan straight down, with diffuse light. From above it is a code; from anywhere else it is the sculpture.',
  ];
}
