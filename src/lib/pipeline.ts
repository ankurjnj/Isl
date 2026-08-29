import { Bitmap } from './bitmap';
import { EccLevel, makeQr, QrResult } from './qr';
import { concatMeshes, meshSculpture, Mesh } from './mesh';
import { carveSculpture } from './carve';
import { countOverhangs, VoxelGrid } from './voxel';
import { meshToObj, meshToStl } from './stl';
import { verifyTopView, VerifyResult } from './verify';
import { Sdf } from './sdf';

export interface DesignInput {
  payload: string;
  ecc: EccLevel;
  quietZone: number;
  /** Force a larger module grid than the payload needs. 0 = smallest that fits. */
  version: number;
  model: Sdf;
  /** Sculpture footprint, as a fraction of the code's width. */
  span: number;
  /** Vertical voxels per module: the one axis not tied to the module grid. */
  zSub: number;
  /** Layers of raised code beneath the sculpture. */
  tileLayers: number;
  moduleMm: number;
  layerMm: number;
  baseMm: number;
}

export interface Dimensions {
  widthMm: number;
  depthMm: number;
  heightMm: number;
  figureMm: number;
}

export interface DesignReport {
  moduleCount: number;
  /** Modules the sculpture spans. Its resolution, since x and y are the grid. */
  spanModules: number;
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
  warnings: string[];
}

export type Design = DesignView;

export const DEFAULT_INPUT: Omit<DesignInput, 'model' | 'payload'> = {
  ecc: 'H',
  quietZone: 4,
  version: 12,
  span: 0.55,
  zSub: 2,
  tileLayers: 2,
  moduleMm: 1.6,
  layerMm: 0.8,
  baseMm: 1.6,
};

export function buildDesign(input: DesignInput): Design {
  const qr = makeQr(input.payload, input.ecc, input.quietZone, input.version || undefined);

  const carved = carveSculpture(qr.bitmap, qr.quietZone, qr.moduleCount, input.model, {
    span: input.span,
    zSub: input.zSub,
    tileLayers: input.tileLayers,
  });

  // The code a scanner reads is the one with the bridges in it, so that is what
  // gets verified -- not the pristine code we started from.
  const verify = verifyTopView(carved.code, input.payload);

  const meshed = meshSculpture(carved.grid, {
    moduleMm: input.moduleMm, layerMm: input.layerMm, baseMm: input.baseMm,
    origin: [0, 0, input.baseMm], withBase: true,
  });

  let drift = 0;
  for (let i = 0; i < carved.code.data.length; i++) {
    if (carved.code.data[i] !== qr.bitmap.data[i]) drift++;
  }

  const dims: Dimensions = {
    widthMm: carved.grid.w * input.moduleMm,
    depthMm: carved.grid.d * input.moduleMm,
    heightMm: input.baseMm + carved.grid.h * input.layerMm,
    figureMm: carved.spanModules * input.moduleMm,
  };

  const report: DesignReport = {
    moduleCount: qr.moduleCount,
    spanModules: carved.spanModules,
    bridges: carved.bridges,
    driftFraction: drift / (qr.moduleCount * qr.moduleCount),
    supports: carved.filledColumns,
    fillFraction: carved.fillFraction,
    looseParts: carved.looseParts,
    overhangs: countOverhangs(carved.grid),
    triangles: meshed.body.triangleCount + meshed.base.triangleCount,
  };

  return {
    qr, grid: carved.grid, code: carved.code,
    meshes: { body: meshed.body, base: meshed.base },
    verify, dims, report,
    warnings: collectWarnings(input, report, verify, dims),
  };
}

/** Practical checks a slicer will not make for you. */
function collectWarnings(
  input: DesignInput, report: DesignReport, verify: VerifyResult, dims: Dimensions,
): string[] {
  const w: string[] = [];
  if (!verify.matches) {
    w.push(
      verify.decoded
        ? 'The top view decodes to different data than you entered. Do not print this.'
        : 'The top view did not decode — the sculpture needed more bridges than this code can absorb. ' +
          'Shrink it, or raise the code version for more room.',
    );
  }
  // 1.2 mm is the widely cited floor for a printed module to survive nozzle
  // width and elephant-foot squish and still read on a phone.
  if (input.moduleMm < 1.2) {
    w.push(`Modules are ${input.moduleMm} mm. Below about 1.2 mm a printed code usually stops scanning.`);
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
  if (report.driftFraction > 0.04) {
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
    `Modules are ${input.moduleMm} mm and layers ${input.layerMm} mm, so use a layer height that divides ${input.layerMm} mm evenly.`,
    `${design.dims.widthMm.toFixed(0)} × ${design.dims.depthMm.toFixed(0)} mm tile, ${design.dims.heightMm.toFixed(0)} mm tall, sculpture ${design.dims.figureMm.toFixed(0)} mm across.`,
    'Matte filament scans far better than glossy — specular highlights are what usually defeat a scanner on a printed code.',
    'Scan straight down, with diffuse light. From above it is a code; from anywhere else it is the sculpture.',
  ];
}
