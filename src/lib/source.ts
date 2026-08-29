import { Bitmap } from './bitmap';
import { getModel } from './models3d';
import { Sdf } from './sdf';
import { extrudeSilhouette, revolveSilhouette } from './voxelize';

/**
 * A serialisable description of what to sculpt.
 *
 * The models themselves are closures, so they cannot cross a worker boundary.
 * Naming the source instead -- a library id, or the bitmap behind a lathe or a
 * word -- keeps the build's whole input structured-cloneable.
 */
export type ModelSource =
  | { kind: 'library'; id: string }
  | { kind: 'lathe'; bitmap: Bitmap }
  | { kind: 'text'; bitmap: Bitmap };

export function resolveSource(src: ModelSource): Sdf | null {
  switch (src.kind) {
    case 'library': return getModel(src.id)?.sdf ?? null;
    // Only lettering is extruded, because extruded lettering is what 3D text
    // actually is. An uploaded outline becomes a lathe: a real solid, not a slab.
    case 'text': return extrudeSilhouette(src.bitmap);
    case 'lathe': return revolveSilhouette(src.bitmap);
  }
}
