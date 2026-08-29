import { Bitmap } from './bitmap';
import { composeRecipe, Recipe } from './compose';
import { Sdf } from './sdf';
import { extrudeSilhouette, revolveSilhouette } from './voxelize';

/**
 * A serialisable description of what to sculpt.
 *
 * Models are closures, so they cannot cross a worker boundary. Sending what the
 * model is made of instead -- an assembly recipe, or the bitmap behind a lathe
 * or a word -- keeps the build's whole input structured-cloneable.
 */
export type ModelSource =
  | { kind: 'composed'; recipe: Recipe }
  | { kind: 'lathe'; bitmap: Bitmap }
  | { kind: 'text'; bitmap: Bitmap };

export function resolveSource(src: ModelSource): Sdf | null {
  switch (src.kind) {
    case 'composed': return composeRecipe(src.recipe);
    // Only lettering is extruded, because extruded lettering is what 3D text
    // actually is. An uploaded outline becomes a lathe: a real solid, not a slab.
    case 'text': return extrudeSilhouette(src.bitmap);
    case 'lathe': return revolveSilhouette(src.bitmap);
  }
}
