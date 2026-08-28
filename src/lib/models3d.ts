import { Sdf, box, capsule, frustum, radialArray, smoothUnion, sphere, subtract, union } from './sdf';

export interface Model3D {
  id: string;
  name: string;
  keywords: string[];
  sdf: Sdf;
}

/** A cone: radius r at z0, tapering to a point at z1. */
const spire = (cx: number, cy: number, z0: number, z1: number, r: number) =>
  frustum(cx, cy, z0, z1, r, 0);

/** A square tower section, as a box centred on the axis. */
const slab = (z0: number, z1: number, half: number) =>
  box(0, 0, (z0 + z1) / 2, half, half, (z1 - z0) / 2);

/**
 * The library of solids.
 *
 * Every model is authored so its radius never grows with height. That is not a
 * stylistic preference, it is what the structure demands. Nothing may bridge
 * sideways between two parts of the sculpture (see the note in voxel.ts), so a
 * column that does not reach the ground on its own has to be filled down to
 * it -- which propagates that column's width all the way down. A shape that
 * re-widens above a narrow point (a chess king's crown over its stem, a
 * mushroom cap over its stalk) therefore loses exactly the feature that made it
 * recognisable, while a shape that tapers is reproduced faithfully.
 *
 * Two things follow, and both shaped this list. Subjects that stand and taper
 * are the ones this medium renders: towers, trees, rockets, peaks, seated
 * animals. And stepped profiles read far better than smooth ones -- a silhouette
 * is only ~30 modules tall, so a gentle curve becomes an anonymous mound, while
 * a hard setback survives as a shape you can name.
 */
export const MODELS: Model3D[] = [
  {
    id: 'pine', name: 'Pine tree',
    keywords: ['tree', 'pine', 'fir', 'conifer', 'forest', 'christmas', 'spruce', 'wood', 'nature'],
    sdf: union(
      frustum(0, 0, 0.00, 0.20, 0.06, 0.05),
      frustum(0, 0, 0.10, 0.46, 0.42, 0.10),
      frustum(0, 0, 0.34, 0.68, 0.32, 0.08),
      frustum(0, 0, 0.58, 0.86, 0.22, 0.06),
      spire(0, 0, 0.80, 1.00, 0.12),
    ),
  },
  {
    id: 'cypress', name: 'Cypress',
    keywords: ['cypress', 'poplar', 'tall tree', 'italian', 'topiary', 'hedge'],
    sdf: union(
      frustum(0, 0, 0.00, 0.12, 0.07, 0.06),
      frustum(0, 0, 0.06, 0.55, 0.21, 0.17),
      frustum(0, 0, 0.55, 0.86, 0.17, 0.11),
      spire(0, 0, 0.86, 1.00, 0.11),
    ),
  },
  {
    id: 'rocket', name: 'Rocket',
    keywords: ['rocket', 'space', 'launch', 'startup', 'ship', 'moon', 'nasa', 'missile'],
    sdf: union(
      frustum(0, 0, 0.08, 0.14, 0.19, 0.16),
      frustum(0, 0, 0.14, 0.62, 0.16, 0.16),
      spire(0, 0, 0.62, 0.99, 0.16),
      radialArray(4, (a) => capsule(
        Math.cos(a) * 0.10, Math.sin(a) * 0.10, 0.34,
        Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0.02, 0.030)),
    ),
  },
  {
    id: 'house', name: 'House',
    keywords: ['house', 'home', 'building', 'property', 'roof', 'cottage', 'real estate'],
    sdf: union(
      box(0, 0, 0.24, 0.30, 0.26, 0.24),
      ...Array.from({ length: 22 }, (_, i) => {
        const t = i / 21;
        return box(0, 0, 0.48 + t * 0.30, 0.34 * (1 - t), 0.30, 0.009);
      }),
      frustum(0.16, -0.14, 0.60, 0.92, 0.045, 0.045),
    ),
  },
  {
    id: 'lighthouse', name: 'Lighthouse',
    keywords: ['lighthouse', 'beacon', 'coast', 'harbour', 'harbor', 'nautical', 'sea'],
    sdf: union(
      frustum(0, 0, 0.00, 0.12, 0.30, 0.24),
      frustum(0, 0, 0.12, 0.66, 0.22, 0.13),
      frustum(0, 0, 0.66, 0.72, 0.20, 0.20),
      frustum(0, 0, 0.72, 0.88, 0.14, 0.14),
      spire(0, 0, 0.88, 1.00, 0.17),
    ),
  },
  {
    id: 'mountain', name: 'Mountain',
    keywords: ['mountain', 'peak', 'alps', 'hill', 'landscape', 'summit', 'hike', 'everest'],
    sdf: union(
      spire(-0.06, 0.02, 0.00, 1.00, 0.42),
      spire(0.22, -0.10, 0.00, 0.62, 0.26),
      spire(-0.26, -0.14, 0.00, 0.44, 0.20),
    ),
  },
  {
    id: 'volcano', name: 'Volcano',
    keywords: ['volcano', 'crater', 'eruption', 'lava', 'island'],
    sdf: subtract(
      frustum(0, 0, 0.00, 1.00, 0.44, 0.15),
      frustum(0, 0, 0.86, 1.02, 0.06, 0.11),
    ),
  },
  {
    id: 'pyramid', name: 'Pyramid',
    keywords: ['pyramid', 'egypt', 'giza', 'tomb', 'ancient', 'triangle'],
    sdf: union(...Array.from({ length: 40 }, (_, i) => {
      const t = i / 39;
      return box(0, 0, t * 0.98 + 0.012, 0.42 * (1 - t), 0.42 * (1 - t), 0.014);
    })),
  },
  {
    id: 'tower', name: 'Castle keep',
    keywords: ['castle', 'keep', 'fort', 'tower', 'fortress', 'medieval', 'turret'],
    sdf: union(
      slab(0.00, 0.62, 0.32),
      radialArray(4, (a) => frustum(Math.cos(a + Math.PI / 4) * 0.25, Math.sin(a + Math.PI / 4) * 0.25,
        0.00, 0.80, 0.075, 0.075)),
      radialArray(4, (a) => spire(Math.cos(a + Math.PI / 4) * 0.25, Math.sin(a + Math.PI / 4) * 0.25,
        0.80, 0.92, 0.085)),
      slab(0.62, 0.72, 0.20),
      spire(0, 0, 0.72, 1.00, 0.18),
    ),
  },
  {
    id: 'skyscraper', name: 'Skyscraper',
    keywords: ['skyscraper', 'tower', 'city', 'office', 'building', 'deco', 'chrysler', 'empire'],
    sdf: union(
      slab(0.00, 0.26, 0.34),
      slab(0.26, 0.50, 0.26),
      slab(0.50, 0.70, 0.19),
      slab(0.70, 0.84, 0.12),
      frustum(0, 0, 0.84, 0.92, 0.08, 0.05),
      frustum(0, 0, 0.92, 1.00, 0.018, 0.018),
    ),
  },
  {
    id: 'obelisk', name: 'Obelisk',
    keywords: ['obelisk', 'monument', 'column', 'memorial', 'washington', 'stele'],
    sdf: union(
      slab(0.00, 0.06, 0.20),
      ...Array.from({ length: 30 }, (_, i) => {
        const t = i / 29;
        return box(0, 0, 0.06 + t * 0.82, 0.15 - t * 0.045, 0.15 - t * 0.045, 0.016);
      }),
      ...Array.from({ length: 12 }, (_, i) => {
        const t = i / 11;
        return box(0, 0, 0.88 + t * 0.11, 0.105 * (1 - t), 0.105 * (1 - t), 0.008);
      }),
    ),
  },
  {
    id: 'tepee', name: 'Tepee',
    keywords: ['tepee', 'teepee', 'tipi', 'tent', 'camp', 'camping', 'wigwam'],
    sdf: union(
      spire(0, 0, 0.00, 0.92, 0.40),
      radialArray(5, (a) => capsule(
        Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0.60,
        Math.cos(a) * 0.04, Math.sin(a) * 0.04, 1.00, 0.022)),
    ),
  },
  {
    id: 'crystal', name: 'Crystal',
    keywords: ['crystal', 'gem', 'diamond', 'quartz', 'shard', 'jewel', 'mineral'],
    sdf: union(
      frustum(0, 0, 0.00, 0.52, 0.30, 0.26),
      spire(0, 0, 0.52, 0.96, 0.26),
      frustum(0.26, 0.06, 0.00, 0.28, 0.15, 0.13),
      spire(0.26, 0.06, 0.28, 0.52, 0.13),
    ),
  },
  {
    id: 'cat', name: 'Sitting cat',
    keywords: ['cat', 'kitten', 'kitty', 'feline', 'pet', 'bastet'],
    // The ears carry the whole reading. Everything else about a seated cat is a
    // taper, and a taper at this resolution is anonymous -- so they are cut
    // deliberately thick and well separated, wide enough to survive the code
    // masking away a module or two.
    sdf: smoothUnion(0.04,
      frustum(0, 0.02, 0.00, 0.22, 0.31, 0.21),
      frustum(0, 0.02, 0.22, 0.58, 0.20, 0.15),
      sphere(0, -0.01, 0.68, 0.145),
      spire(-0.125, -0.01, 0.72, 1.00, 0.095),
      spire(0.125, -0.01, 0.72, 1.00, 0.095),
      capsule(0, 0.18, 0.05, 0, 0.21, 0.42, 0.045),
    ),
  },
];

const BY_ID = new Map(MODELS.map((m) => [m.id, m]));

export function getModel(id: string): Model3D | undefined {
  return BY_ID.get(id);
}

/**
 * Pick the model that best matches a free-text prompt. Whole-word matches
 * outrank substrings, so "startup rocket" is not beaten by a keyword that
 * merely appears inside another word.
 */
export function matchModel(prompt: string): { model: Model3D; score: number } | null {
  const text = prompt.toLowerCase();
  const words = new Set(text.split(/[^a-z0-9]+/).filter(Boolean));
  let best: { model: Model3D; score: number } | null = null;
  for (const m of MODELS) {
    let score = 0;
    for (const kw of m.keywords) {
      if (words.has(kw)) score += 10;
      else if (kw.includes(' ') && text.includes(kw)) score += 8;
      else if (text.includes(kw)) score += 3;
    }
    if (words.has(m.id)) score += 6;
    if (score > 0 && (!best || score > best.score)) best = { model: m, score };
  }
  return best;
}
