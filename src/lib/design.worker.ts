import { buildDesign, DesignInput } from './pipeline';
import { ModelSource, resolveSource } from './source';

/**
 * Builds designs off the main thread.
 *
 * A build is voxelisation plus a QR decode -- seconds of synchronous work at
 * larger sizes. Run inline it freezes the page, so a slider cannot be dragged
 * while its own result is being computed.
 */
export interface BuildRequest {
  id: number;
  input: Omit<DesignInput, 'model'>;
  source: ModelSource;
}

self.onmessage = (e: MessageEvent<BuildRequest>) => {
  const { id, input, source } = e.data;
  try {
    const model = resolveSource(source);
    if (!model) throw new Error('unknown model');
    const design = buildDesign({ ...input, model });
    // Strip what cannot cross the boundary, and hand the big buffers over
    // rather than copying them.
    const payload = {
      id,
      ok: true as const,
      design: {
        qr: { ...design.qr, bitmap: design.qr.bitmap },
        figure: design.figure,
        occluded: design.occluded,
        meshes: design.meshes,
        verify: design.verify,
        dims: design.dims,
        report: design.report,
        warnings: design.warnings,
      },
    };
    const transfer: Transferable[] = [
      design.figure.data.buffer,
      design.occluded.data.buffer,
      design.qr.bitmap.data.buffer,
      ...[design.meshes.tile, design.meshes.figure, design.meshes.base].flatMap((m) => [
        m.positions.buffer, m.normals.buffer,
      ]),
    ];
    (self as unknown as Worker).postMessage(payload, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id, ok: false as const, error: err instanceof Error ? err.message : String(err),
    });
  }
};
