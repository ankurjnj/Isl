import { Bitmap } from './bitmap';
import { EccLevel, makeQr, QrResult } from './qr';
import { concatMeshes, meshSculpture, Mesh } from './mesh';
import {
  buildFigure, buildTile, countComponents, countOverhangs,
  occludedCode, probeMaxSpan, VoxelGrid,
} from './voxel';
import { meshToObj, meshToStl } from './stl';
import { verifyTopView, VerifyResult } from './verify';
import { Sdf } from './sdf';

export interface DesignInput {
  payload: string;
  ecc: EccLevel;
  quietZone: number;
  /** Force a larger module grid than the payload needs. 0 = smallest that fits. */
  version: number;
  /** The sculpture. */
  model: Sdf;
  /** Sculpture footprint, as a fraction of the code's width. */
  span: number;
  /** Sculpture voxels per code module. Its resolution, independent of the code. */
  subdiv: number;
  /** Sculpture height as a multiple of its width. */
  heightScale: number;
  /** Layers of raised code on the plate. */
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
  /** Modules the sculpture covers, what was asked for, and whether it was cut back. */
  spanModules: number;
  requestedSpan: number;
  maxSpanModules: number;
  clamped: boolean;
  /** Fraction of the code's area the sculpture stands on. */
  coverage: number;
  /** Sculpture voxels across. Its real resolution. */
  figureVoxels: number;
  /** Voxels per module actually used, after the budget cap. */
  usedSubdiv: number;
  figureVoxelMm: number;
  /** Overhangs in the sculpture. Non-zero is fine; it just needs supports. */
  overhangs: number;
  /** Sculpture pieces. Must be 1. */
  looseParts: number;
  /** Share of the model dropped as disconnected specks. */
  islandFraction: number;
  triangles: number;
}

/**
 * Everything the UI needs. Separate from `Design` because the tile's voxel grid
 * is only an intermediate for meshing -- nothing downstream reads it, and
 * leaving it out keeps the result cheap to hand across a worker boundary.
 */
export interface DesignView {
  qr: QrResult;
  figure: VoxelGrid;
  /** The code as a scanner sees it, with the sculpture blocking part of it. */
  occluded: Bitmap;
  meshes: { tile: Mesh; figure: Mesh; base: Mesh };
  verify: VerifyResult;
  dims: Dimensions;
  report: DesignReport;
  warnings: string[];
}

export interface Design extends DesignView {
  /** The code tile's voxels. Meshing input only. */
  tile: VoxelGrid;
}

export const DEFAULT_INPUT: Omit<DesignInput, 'model' | 'payload'> = {
  ecc: 'H',
  quietZone: 4,
  version: 10,
  span: 0.45,
  subdiv: 3,
  heightScale: 1,
  tileLayers: 2,
  moduleMm: 1.6,
  layerMm: 0.8,
  baseMm: 1.6,
};

export function buildDesign(input: DesignInput): Design {
  const qr = makeQr(input.payload, input.ecc, input.quietZone, input.version || undefined);
  const n = qr.moduleCount;

  // The square probe is the guaranteed-safe floor: it assumes the sculpture
  // blocks every module in its bounding box. Real sculptures do not -- a rocket
  // or a seated cat covers well under half of its own square -- so clamping to
  // that figure leaves a lot of size on the table. Try the requested size
  // against the sculpture's ACTUAL footprint first, and only fall back toward
  // the square bound if the decoder really does object.
  const safeSpan = Math.max(4, probeMaxSpan(qr.bitmap, qr.quietZone, n, input.payload));
  const wanted = Math.max(4, Math.min(n, Math.round(n * input.span)));

  // Cap the sculpture's grid. Voxel count grows with the cube of span x subdiv,
  // so a large sculpture at high detail is minutes of work and a mesh nothing
  // will open. Past the budget the detail is reduced rather than the size --
  // the size is what the user asked for, the detail is a preference.
  const VOXEL_BUDGET = 108;
  const effectiveSubdiv = (span: number) =>
    Math.max(1, Math.min(input.subdiv, Math.floor(VOXEL_BUDGET / Math.max(1, span))));

  const attempt = (span: number) => {
    const sub = effectiveSubdiv(span);
    const fig = buildFigure(input.model, span, sub, input.heightScale);
    const origin = qr.quietZone + Math.floor((n - span) / 2);
    const occ = occludedCode(qr.bitmap, fig, origin, sub);
    return { span, sub, fig, origin, occ, verify: verifyTopView(occ, input.payload) };
  };

  let best = attempt(wanted);
  // Below the square bound the code is safe whatever shape stands on it, so
  // there is nothing to search for.
  if (!best.verify.matches && wanted > safeSpan) {
    // Bisect once between the failure and the guaranteed floor, then settle for
    // the floor. Each step costs a full voxelisation, so this trades a little
    // size for staying responsive rather than searching exhaustively.
    const mid = Math.floor((safeSpan + best.span) / 2);
    if (mid > safeSpan) {
      const tryMid = attempt(mid);
      if (tryMid.verify.matches) best = tryMid;
    }
    if (!best.verify.matches) best = attempt(safeSpan);
  }

  const { span: spanModules, sub: usedSubdiv, fig: figure, origin: originModule, occ: occluded, verify } = best;
  const maxSpanModules = Math.max(safeSpan, spanModules);
  const tile = buildTile(qr.bitmap, input.tileLayers);

  // The sculpture's voxel is finer than a module, and cubic, so the figure
  // keeps its proportions instead of being stretched by the tile's layer height.
  const figureVoxelMm = input.moduleMm / usedSubdiv;
  const originMm: [number, number, number] = [
    originModule * input.moduleMm,
    originModule * input.moduleMm,
    input.baseMm,
  ];

  const tileMesh = meshSculpture(tile, {
    moduleMm: input.moduleMm, layerMm: input.layerMm, baseMm: input.baseMm,
    origin: [0, 0, input.baseMm], withBase: true,
  });
  const figureMesh = meshSculpture(figure, {
    moduleMm: figureVoxelMm, layerMm: figureVoxelMm, baseMm: 0,
    origin: originMm, withBase: false,
  });

  const dims: Dimensions = {
    widthMm: tile.w * input.moduleMm,
    depthMm: tile.d * input.moduleMm,
    heightMm: input.baseMm + figure.h * figureVoxelMm,
    figureMm: figure.w * figureVoxelMm,
  };

  const report: DesignReport = {
    spanModules,
    requestedSpan: wanted,
    clamped: spanModules < wanted,
    maxSpanModules,
    coverage: (spanModules * spanModules) / (n * n),
    figureVoxels: figure.w,
    usedSubdiv,
    figureVoxelMm,
    overhangs: countOverhangs(figure),
    looseParts: countComponents(figure),
    islandFraction: figure.islandFraction ?? 0,
    triangles: tileMesh.body.triangleCount + figureMesh.body.triangleCount + tileMesh.base.triangleCount,
  };

  return {
    qr, tile, figure, occluded,
    meshes: { tile: tileMesh.body, figure: figureMesh.body, base: tileMesh.base },
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
        : 'The top view did not decode. Shrink the sculpture, or raise the error-correction level.',
    );
  }
  // 1.2 mm is the widely cited floor for a printed module to survive nozzle
  // width and elephant-foot squish and still read on a phone.
  if (input.moduleMm < 1.2) {
    w.push(`Modules are ${input.moduleMm} mm. Below about 1.2 mm a printed code usually stops scanning.`);
  }
  // A 0.4 mm nozzle cannot resolve a feature thinner than its own bead.
  if (report.figureVoxelMm < 0.4) {
    w.push(
      `Sculpture voxels are ${report.figureVoxelMm.toFixed(2)} mm — finer than a 0.4 mm nozzle can print. ` +
      'Lower the detail, or raise the module size.',
    );
  }
  // Specks are sampling noise; losing a real share of the model is a modelling
  // error and must not pass silently.
  if (report.islandFraction > 0.02) {
    w.push(
      `${(report.islandFraction * 100).toFixed(1)}% of this model was disconnected from its body and dropped — ` +
      'part of the shape is not joined to the rest.',
    );
  }
  if (report.usedSubdiv < input.subdiv) {
    w.push(
      `Detail was reduced to ${report.usedSubdiv}× per module to keep the sculpture's grid workable at this size. ` +
      'A smaller sculpture can carry more detail.',
    );
  }
  if (report.looseParts > 1) {
    w.push(`The sculpture is in ${report.looseParts} disconnected pieces and will not print as one object.`);
  }
  if (report.overhangs > 0) {
    w.push(`The sculpture has ${report.overhangs} overhanging voxels — print it with supports.`);
  }
  if (report.clamped) {
    w.push(
      `The sculpture is capped at ${report.spanModules} of ${report.requestedSpan} modules — any larger and this ` +
      'code stops decoding. A longer payload or a higher code version gives more room.',
    );
  }
  if (input.baseMm < 0.8) w.push('The base plate is very thin and may warp or tear off the bed.');
  if (Math.max(dims.widthMm, dims.depthMm) > 250) {
    w.push(`At ${dims.widthMm.toFixed(0)} mm across this will not fit on most 220–250 mm beds.`);
  }
  return w;
}

export function exportStl(design: DesignView, name: string): ArrayBuffer {
  return meshToStl(concatMeshes(design.meshes.tile, design.meshes.figure, design.meshes.base), name);
}

export function exportObj(design: DesignView): string {
  return meshToObj(concatMeshes(design.meshes.tile, design.meshes.figure, design.meshes.base));
}

export function printingNotes(input: Omit<DesignInput, 'model'>, design: DesignView): string[] {
  return [
    `Insert a filament change at Z = ${input.baseMm.toFixed(2)} mm. Below it is the base plate — use a light colour. Above it is the code and the sculpture — use a dark, matte colour.`,
    design.report.overhangs === 0
      ? 'No supports needed: nothing in the sculpture overhangs.'
      : `Enable supports for the sculpture (${design.report.overhangs} overhanging voxels). Keep them off the code — the tile needs none.`,
    `The sculpture's detail is ${design.report.figureVoxelMm.toFixed(2)} mm per voxel; use a layer height at or below that to keep it.`,
    `Tile ${design.dims.widthMm.toFixed(0)} × ${design.dims.depthMm.toFixed(0)} mm, sculpture ${design.dims.figureMm.toFixed(0)} mm across, ${design.dims.heightMm.toFixed(0)} mm tall overall.`,
    'Matte filament scans far better than glossy — specular highlights are what usually defeat a scanner on a printed code.',
    'Scan straight down, with diffuse light. The code reads from above; the sculpture is what you see from anywhere else.',
  ];
}
