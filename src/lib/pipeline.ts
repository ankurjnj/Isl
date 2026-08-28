import { Bitmap } from './bitmap';
import { EccLevel, makeQr, QrResult } from './qr';
import { concatMeshes, meshSculpture, SculptureMesh } from './mesh';
import { BuildResult, buildSculpture, Form, ViewMode } from './voxel';
import { meshToObj, meshToStl } from './stl';
import { verifyTopView, VerifyResult } from './verify';

export interface DesignInput {
  payload: string;
  ecc: EccLevel;
  quietZone: number;
  silhouette: Bitmap;
  mode: ViewMode;
  /** How the subject gains depth along y. */
  form: Form;
  /** Depth of the thickest point, as a fraction of the available depth. */
  depth: number;
  /** Voxel layers of height. */
  height: number;
  /** Pedestal height in layers. */
  plinth: number;
  moduleMm: number;
  layerMm: number;
  baseMm: number;
}

export interface Dimensions {
  widthMm: number;
  depthMm: number;
  heightMm: number;
}

export interface Design {
  qr: QrResult;
  build: BuildResult;
  mesh: SculptureMesh;
  verify: VerifyResult;
  dims: Dimensions;
  warnings: string[];
}

export const DEFAULT_INPUT: Omit<DesignInput, 'silhouette' | 'payload'> = {
  ecc: 'H',
  quietZone: 4,
  mode: 'shadow',
  form: 'rounded',
  depth: 0.9,
  height: 40,
  plinth: 3,
  moduleMm: 2.0,
  layerMm: 1.4,
  baseMm: 2.0,
};

export function buildDesign(input: DesignInput): Design {
  const qr = makeQr(input.payload, input.ecc, input.quietZone);
  const build = buildSculpture(qr.bitmap, input.silhouette, qr.quietZone, {
    mode: input.mode,
    form: input.form,
    depth: input.depth,
    height: input.height,
    plinth: input.plinth,
  });
  const mesh = meshSculpture(build.grid, build.struts, {
    moduleMm: input.moduleMm,
    layerMm: input.layerMm,
    baseMm: input.baseMm,
  });
  const verify = verifyTopView(build.topAchieved, input.payload);
  const dims: Dimensions = {
    widthMm: build.grid.w * input.moduleMm,
    depthMm: build.grid.d * input.moduleMm,
    heightMm: input.baseMm + build.grid.h * input.layerMm,
  };

  return { qr, build, mesh, verify, dims, warnings: collectWarnings(input, build, verify, dims) };
}

/**
 * Practical checks a slicer will not make for you.
 *
 * These are all failure modes that only show up after a print has finished, so
 * they are worth raising up front even when the geometry itself is sound.
 */
function collectWarnings(
  input: DesignInput,
  build: BuildResult,
  verify: VerifyResult,
  dims: Dimensions,
): string[] {
  const w: string[] = [];

  if (!verify.matches) {
    w.push(
      verify.decoded
        ? 'The top view decodes to different data than you entered. Do not print this.'
        : 'The top view did not decode. Do not print this — try a shorter payload or a higher ECC level.',
    );
  }
  // 1.2 mm is the widely cited floor for a printed module to survive nozzle
  // width and elephant-foot squish and still read on a phone.
  if (input.moduleMm < 1.2) {
    w.push(`Modules are ${input.moduleMm} mm. Below about 1.2 mm a printed QR usually stops scanning.`);
  }
  if (input.baseMm < 0.8) {
    w.push('The base plate is very thin and may warp or tear off the bed.');
  }
  if (build.report.looseParts > 1) {
    w.push(`${build.report.looseParts} disconnected pieces — parts of the artwork will fall off. Turn welding on, or use Skyline mode.`);
  }
  if (build.report.blindColumns.length) {
    w.push(
      `${build.report.blindColumns.length} column(s) of the code are entirely light, so the artwork cannot show anything there. ` +
      'Changing the payload or ECC level reshuffles the code and usually clears it.',
    );
  }
  if (build.report.sideFidelity < 0.9) {
    w.push(`Only ${(build.report.sideFidelity * 100).toFixed(0)}% of the side artwork is renderable against this code.`);
  }
  if (Math.max(dims.widthMm, dims.depthMm) > 250) {
    w.push(`At ${dims.widthMm.toFixed(0)} mm across this will not fit on most 220–250 mm beds.`);
  }
  if (build.report.depthRepairs > 0) {
    w.push(
      `${build.report.depthRepairs} cell(s) needed an extra module behind the surface to keep the side view whole. ` +
      'Increasing depth reduces this.',
    );
  }
  if (input.mode === 'shadow' && build.report.struts > 0) {
    w.push(`${build.report.struts} thin welding post(s) hold detached parts of the artwork. They are visible up close.`);
  }
  return w;
}

export function exportStl(design: Design, name: string): ArrayBuffer {
  return meshToStl(concatMeshes(design.mesh.body, design.mesh.base), name);
}

export function exportObj(design: Design): string {
  return meshToObj(concatMeshes(design.mesh.body, design.mesh.base));
}

/** Slicer-facing notes that depend on the actual numbers chosen. */
export function printingNotes(input: DesignInput, design: Design): string[] {
  const colourChangeMm = input.baseMm;
  return [
    `Print with no supports. The artwork is self-supporting above the pedestal; the welding posts are deliberate.`,
    `Insert a filament change at Z = ${colourChangeMm.toFixed(2)} mm. Below it is the base plate — use a light colour. Above it is the code and the artwork — use a dark, matte colour.`,
    `Layer height must divide ${input.layerMm} mm evenly, so the artwork's steps land on layer boundaries. ${suggestLayerHeights(input.layerMm)}`,
    `Total size ${design.dims.widthMm.toFixed(1)} x ${design.dims.depthMm.toFixed(1)} x ${design.dims.heightMm.toFixed(1)} mm.`,
    `Matte filament scans far better than glossy — specular highlights are what usually defeat a scanner on a printed code.`,
    `Scan the finished print straight down, with diffuse light. The code is only a QR code from directly above.`,
  ];
}

function suggestLayerHeights(layerMm: number): string {
  const options = [0.1, 0.12, 0.15, 0.16, 0.2, 0.25, 0.28, 0.3];
  const fits = options.filter((o) => Math.abs((layerMm / o) - Math.round(layerMm / o)) < 1e-6);
  return fits.length ? `Try ${fits.map((f) => f + ' mm').join(', ')}.` : 'No common layer height divides it exactly.';
}
