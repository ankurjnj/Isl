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
    // Send the design whole rather than rebuilding it field by field. Listing
    // the fields here meant every value added to a design had to be remembered
    // in a second place, and one that was not simply arrived undefined in the
    // UI. Everything in a design is plain data, so it clones as it is; the big
    // buffers are handed over rather than copied.
    const payload = { id, ok: true as const, design };
    const transfer: Transferable[] = [
      design.grid.data.buffer,
      design.code.data.buffer,
      design.qr.bitmap.data.buffer,
      ...[design.meshes.body, design.meshes.base].flatMap((m) => [m.positions.buffer, m.normals.buffer]),
    ];
    (self as unknown as Worker).postMessage(payload, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id, ok: false as const, error: err instanceof Error ? err.message : String(err),
    });
  }
};
