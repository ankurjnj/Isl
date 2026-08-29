import { Bitmap } from './bitmap';
import { EccLevel, makeQr, QrResult } from './qr';
import { concatMeshes, meshSculpture, Mesh } from './mesh';
import { carveSculpture } from './carve';
import { countOverhangs, VoxelGrid } from './voxel';
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
  moduleMm: number;
  layerMm: number;
  baseMm: number;
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
  /** True when the sculpture was cut back to keep the code readable. */
  spanClamped: boolean;
  /** Light modules darkened to join the sculpture. Each is one module of error. */
  bridges: number;
  /** How far the top view departs from the plain code. */
  driftFraction: number;
  /** Supports added under parts that reached nothing. One column each. */
  supports: number;
  /** Voxels those supports added, against the carved total. */
  fillFraction: number;
  looseParts: number;
  overhangs: number;
  triangles: number;
}

export interface DesignView {
  qr: QrResult;
  grid: VoxelGrid;
  /** The code as a scanner sees it: the original plus the bridges. */
  code: Bitmap;
  meshes: { body: Mesh; base: Mesh };
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
  span: 0.72,
  zSub: 2,
  // The sculpture is sampled three times finer than the code across, which the
  // code does not mind: a sub-voxel sits wholly inside one module, and the tile
  // already raises every dark module, so a partly covered one still reads dark.
  xySub: 3,
  tileLayers: 2,
  moduleMm: 2.6,
  layerMm: 0.6,
  baseMm: 1.6,
  nozzleMm: 0.4,
};

export function buildDesign(input: DesignInput): Design {
  const qr = makeQr(input.payload, input.ecc, input.quietZone, input.version || undefined);

  // Fit the sculpture to the code's error budget.
  //
  // Bridges scale with the sculpture's area while the budget scales with the
  // code's, so a wide sculpture on a coarse code can need more darkened modules
  // than the code can absorb -- and a blocky subject needs the most, because a
  // dense footprint fragments into more pieces than a slender one. Rather than
  // capping the span by a rule that would be wrong for half the library, ask
  // for what was requested and step back only if the decoder actually objects.
  const attempt = (span: number) => {
    const carved = carveSculpture(qr.bitmap, qr.quietZone, qr.moduleCount, input.model, {
      span, zSub: input.zSub, xySub: input.xySub, tileLayers: input.tileLayers,
    });
    // The code a scanner reads is the one with the bridges in it, so that is
    // what gets verified -- not the pristine code we started from.
    return { carved, verify: verifyTopView(carved.code, input.payload) };
  };

  let best = attempt(input.span);
  if (!best.verify.matches) {
    let lo = 0.2, hi = input.span;
    for (let i = 0; i < 4 && !best.verify.matches; i++) {
      const mid = (lo + hi) / 2;
      const tryMid = attempt(mid);
      if (tryMid.verify.matches) { best = tryMid; lo = mid; } else hi = mid;
    }
    if (!best.verify.matches) best = attempt(lo);
  }
  const { carved, verify } = best;

  // The grid is finer than the code, so a cell is a fraction of a module.
  const cellMm = input.moduleMm / carved.xySub;
  const meshed = meshSculpture(carved.grid, {
    moduleMm: cellMm, layerMm: input.layerMm, baseMm: input.baseMm,
    origin: [0, 0, input.baseMm], withBase: true,
  });

  let drift = 0;
  for (let i = 0; i < carved.code.data.length; i++) {
    if (carved.code.data[i] !== qr.bitmap.data[i]) drift++;
  }

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
    spanClamped: carved.spanModules < Math.round(qr.moduleCount * input.span),
    bridges: carved.bridges,
    driftFraction: drift / (qr.moduleCount * qr.moduleCount),
    supports: carved.filledColumns,
    fillFraction: carved.fillFraction,
    looseParts: carved.looseParts,
    overhangs: countOverhangs(carved.grid),
    triangles: meshed.body.triangleCount + meshed.base.triangleCount,
  };

  const print = checkPrintability(carved.code, carved.grid, {
    moduleMm: input.moduleMm, layerMm: input.layerMm, baseMm: input.baseMm,
    nozzleMm: input.nozzleMm, cellMm,
  });

  return {
    qr, grid: carved.grid, code: carved.code,
    meshes: { body: meshed.body, base: meshed.base },
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
        : 'The top view did not decode — the sculpture needed more bridges than this code can absorb. ' +
          'Shrink it, or raise the code version for more room.',
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
  if (report.spanClamped) {
    w.push(
      `The sculpture was reduced to ${report.spanModules} modules — any wider and joining its fragments ` +
      'costs more darkened modules than this code can absorb. A larger code version would allow more.',
    );
  }
  if (report.driftFraction > 0.05) {
    w.push(
      `${(report.driftFraction * 100).toFixed(1)}% of the code was darkened to hold the sculpture together. ` +
      'It still scans, but a smaller sculpture or a larger code would leave the pattern cleaner.',
    );
  }
  if (report.overhangs > 0) {
    w.push(`${report.overhangs} overhanging voxels — print with supports, or accept some droop.`);
  }
  if (input.baseMm < 0.8) w.push('The base plate is very thin and may warp or tear off the bed.');
  if (Math.max(dims.widthMm, dims.depthMm) > 250) {
    w.push(`At ${dims.widthMm.toFixed(0)} mm across this will not fit on most 220–250 mm beds.`);
  }
  return w;
}

export function exportStl(design: DesignView, name: string): ArrayBuffer {
  return meshToStl(concatMeshes(design.meshes.body, design.meshes.base), name);
}

export function exportObj(design: DesignView): string {
  return meshToObj(concatMeshes(design.meshes.body, design.meshes.base));
}

export function printingNotes(input: Omit<DesignInput, 'model'>, design: DesignView): string[] {
  return [
    `Insert a filament change at Z = ${input.baseMm.toFixed(2)} mm. Below it is the base plate — use a light colour. Above it is the code and the sculpture — use a dark, matte colour.`,
    design.report.overhangs === 0
      ? 'No supports needed: nothing overhangs.'
      : `Enable supports (${design.report.overhangs} overhanging voxels). They only touch the sculpture; the code tile needs none.`,
    `Modules are ${input.moduleMm} mm — ${design.print.modulePasses.toFixed(1)} passes of a ${input.nozzleMm} mm nozzle. Layers are ${input.layerMm} mm, so pick a layer height that divides it evenly.`,
    `${design.print.layers} layers, with ${design.print.isolatedModules} single-module islands on the plate — none of them load-bearing, since every one is fused to the base.`,
    `${design.dims.widthMm.toFixed(0)} × ${design.dims.depthMm.toFixed(0)} mm tile, ${design.dims.heightMm.toFixed(0)} mm tall, sculpture ${design.dims.figureMm.toFixed(0)} mm across.`,
    'Matte filament scans far better than glossy — specular highlights are what usually defeat a scanner on a printed code.',
    'Scan straight down, with diffuse light. From above it is a code; from anywhere else it is the sculpture.',
  ];
}
