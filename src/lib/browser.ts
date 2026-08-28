import { Bitmap } from './bitmap';
import { thresholdImageData } from './raster';

/** Decode an uploaded image file and threshold it into a silhouette. */
export async function imageFileToBitmap(
  file: File,
  size = 128,
  opts: { threshold?: number; invert?: boolean } = {},
): Promise<Bitmap> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('could not decode that image'));
      img.src = url;
    });
    const scale = Math.min(size / img.width, size / img.height, 1) || 1;
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    return thresholdImageData(data, w, h, opts);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Render a short word as a heavy silhouette, for prompts with no matching shape. */
export function textToBitmap(text: string, size = 256): Bitmap {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Shrink to fit rather than clipping: a long word must stay legible from the
  // side, and a clipped word is worse than a small one.
  let font = size * 0.6;
  do {
    ctx.font = `900 ${font}px ui-sans-serif, system-ui, "Helvetica Neue", Arial, sans-serif`;
    if (ctx.measureText(text).width <= size * 0.92) break;
    font *= 0.9;
  } while (font > 8);
  ctx.fillText(text, size / 2, size / 2);

  const { data } = ctx.getImageData(0, 0, size, size);
  return thresholdImageData(data, size, size, { threshold: 128 });
}

/**
 * Hand the viewer a file.
 *
 * Locally this is an ordinary anchor download. When the page is running inside
 * a sandboxed host that blocks page-initiated downloads, the anchor is silently
 * inert, so a host-provided save channel is tried first when one exists. That
 * channel enforces its own extension allowlist, which does not include the mesh
 * formats -- hence the explicit failure path rather than a silent no-op, so the
 * caller can tell the user why nothing happened instead of leaving them
 * clicking a dead button.
 */
export async function downloadBlob(data: BlobPart, filename: string, type: string): Promise<void> {
  const host = (globalThis as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
  if (host?.use) {
    const downloads = (await host.use('downloads').catch(() => null)) as
      | { save: (r: { filename: string; data: Blob }) => Promise<unknown> }
      | null;
    if (downloads) {
      try {
        await downloads.save({ filename, data: new Blob([data], { type }) });
        return;
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code === 'declined') return; // the viewer said no; nothing to report
        throw new Error(
          code === 'rejected_extension' || code === 'extension_not_enabled'
            ? `This hosted preview cannot save .${filename.split('.').pop()} files. Run the app locally to export the model.`
            : `Save failed (${code ?? 'unknown'}).`,
        );
      }
    }
  }

  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'qr3d';
}
