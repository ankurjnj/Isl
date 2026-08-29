import {
  Sdf, blade, box, capsule, ellipsoid, frustum, radialArray,
  rotateZ, smoothUnion, sphere, subtract, taperedBox, union,
} from './sdf';

export interface Model3D {
  id: string;
  name: string;
  keywords: string[];
  sdf: Sdf;
}

/** A cone: radius r at z0, tapering to a point at z1. */
const spire = (cx: number, cy: number, z0: number, z1: number, r: number) =>
  frustum(cx, cy, z0, z1, r, 0);

/**
 * The library of sculptures.
 *
 * These are free-standing: they stand on the code rather than being carved out
 * of it, so nothing here is constrained by the module grid. Undercuts, thin
 * features and separated parts are all allowed -- a trunk under a canopy, a cap
 * over a stalk, legs under a body -- because the sculpture is voxelised several
 * times finer than a module and only has to print, not scan. The one rule left
 * is that each model must be a single connected piece; the suite asserts it.
 *
 * Model space is x, y in [-0.5, 0.5] and z in [0, 1], with z = 0 the ground.
 */
export const MODELS: Model3D[] = [
  {
    id: 'tree', name: 'Tree',
    keywords: ['tree', 'oak', 'forest', 'nature', 'wood', 'park', 'leaf', 'branch'],
    sdf: smoothUnion(0.045,
      frustum(0, 0, 0.00, 0.44, 0.075, 0.045),
      capsule(0, 0, 0.36, -0.13, 0.05, 0.54, 0.028),
      capsule(0, 0, 0.40, 0.14, -0.06, 0.58, 0.028),
      sphere(0, 0, 0.72, 0.26),
      sphere(-0.17, 0.06, 0.60, 0.17),
      sphere(0.18, -0.05, 0.63, 0.16),
      sphere(0.05, 0.15, 0.82, 0.15),
      sphere(-0.06, -0.13, 0.85, 0.14),
    ),
  },
  {
    id: 'pine', name: 'Pine tree',
    keywords: ['pine', 'fir', 'conifer', 'christmas', 'spruce', 'evergreen'],
    sdf: union(
      frustum(0, 0, 0.00, 0.24, 0.055, 0.042),
      frustum(0, 0, 0.18, 0.50, 0.34, 0.05),
      frustum(0, 0, 0.42, 0.72, 0.26, 0.04),
      frustum(0, 0, 0.66, 0.90, 0.18, 0.03),
      spire(0, 0, 0.86, 1.00, 0.09),
    ),
  },
  {
    id: 'rocket', name: 'Rocket',
    keywords: ['rocket', 'space', 'launch', 'startup', 'ship', 'moon', 'nasa', 'missile'],
    sdf: union(
      // Engine bell, flaring outward at the bottom.
      frustum(0, 0, 0.00, 0.09, 0.115, 0.075),
      frustum(0, 0, 0.09, 0.14, 0.085, 0.125),
      // Body, with a raised band where the stages meet.
      frustum(0, 0, 0.14, 0.64, 0.125, 0.125),
      frustum(0, 0, 0.40, 0.44, 0.138, 0.138),
      frustum(0, 0, 0.64, 0.70, 0.125, 0.112),
      spire(0, 0, 0.70, 1.00, 0.112),
      // Four swept fins, tapering to a point at the top.
      radialArray(4, (a) => rotateZ(a, blade(0.20, 0, 0.02, 0.34, 0.115, 0.02, 0.020))),
      // Porthole surround.
      subtract(
        frustum(0, -0.10, 0.50, 0.58, 0.075, 0.075),
        frustum(0, -0.16, 0.515, 0.565, 0.048, 0.048),
      ),
    ),
  },
  {
    id: 'cat', name: 'Sitting cat',
    keywords: ['cat', 'kitten', 'kitty', 'feline', 'pet', 'bastet'],
    sdf: smoothUnion(0.035,
      // Haunches at the back, chest tapering up to the shoulders.
      ellipsoid(0, 0.10, 0.20, 0.20, 0.19, 0.20),
      ellipsoid(0, -0.02, 0.30, 0.145, 0.15, 0.30),
      // Head, muzzle and ears.
      sphere(0, -0.05, 0.71, 0.135),
      ellipsoid(0, -0.15, 0.67, 0.075, 0.06, 0.055),
      spire(-0.095, -0.04, 0.78, 0.98, 0.062),
      spire(0.095, -0.04, 0.78, 0.98, 0.062),
      // Front legs and paws.
      capsule(-0.085, -0.15, 0.30, -0.085, -0.16, 0.045, 0.045),
      capsule(0.085, -0.15, 0.30, 0.085, -0.16, 0.045, 0.045),
      ellipsoid(-0.085, -0.19, 0.035, 0.05, 0.065, 0.035),
      ellipsoid(0.085, -0.19, 0.035, 0.05, 0.065, 0.035),
      // Tail, curling round the base.
      capsule(0, 0.26, 0.09, 0.19, 0.20, 0.05, 0.038),
      capsule(0.19, 0.20, 0.05, 0.26, 0.02, 0.05, 0.034),
    ),
  },
  {
    id: 'mushroom', name: 'Mushroom',
    keywords: ['mushroom', 'fungus', 'toadstool', 'shroom', 'amanita'],
    sdf: union(
      // The stalk has to reach into the cap: the subtract below trims the cap's
      // underside flat at 0.58, so a stalk ending at 0.58 only touches it.
      frustum(0, 0, 0.00, 0.68, 0.115, 0.085),
      frustum(0, 0, 0.06, 0.13, 0.145, 0.11),
      // A cap that genuinely overhangs the stalk.
      subtract(
        ellipsoid(0, 0, 0.60, 0.34, 0.34, 0.30),
        box(0, 0, 0.44, 0.5, 0.5, 0.16),
      ),
    ),
  },
  {
    id: 'house', name: 'House',
    keywords: ['house', 'home', 'building', 'property', 'roof', 'cottage', 'real estate'],
    sdf: union(
      box(0, 0, 0.22, 0.28, 0.24, 0.22),
      taperedBox(0, 0, 0.44, 0.78, 0.33, 0.015),
      frustum(0.15, -0.13, 0.52, 0.90, 0.045, 0.045),
      // Door and two windows, pressed into the front wall.
      subtract(box(0, -0.24, 0.10, 0.055, 0.03, 0.10), box(0, -0.30, 0.10, 0.04, 0.05, 0.085)),
      box(-0.16, -0.243, 0.30, 0.05, 0.022, 0.05),
      box(0.16, -0.243, 0.30, 0.05, 0.022, 0.05),
    ),
  },
  {
    id: 'castle', name: 'Castle',
    keywords: ['castle', 'keep', 'fort', 'tower', 'fortress', 'medieval', 'turret', 'palace'],
    sdf: union(
      box(0, 0, 0.26, 0.28, 0.28, 0.26),
      radialArray(4, (a) => union(
        frustum(Math.cos(a + Math.PI / 4) * 0.28, Math.sin(a + Math.PI / 4) * 0.28, 0.00, 0.62, 0.085, 0.085),
        radialArray(6, (b) => box(
          Math.cos(a + Math.PI / 4) * 0.28 + Math.cos(b) * 0.075,
          Math.sin(a + Math.PI / 4) * 0.28 + Math.sin(b) * 0.075, 0.655, 0.022, 0.022, 0.035)),
        spire(Math.cos(a + Math.PI / 4) * 0.28, Math.sin(a + Math.PI / 4) * 0.28, 0.66, 0.86, 0.105),
      )),
      radialArray(12, (b) => box(Math.cos(b) * 0.26, Math.sin(b) * 0.26, 0.535, 0.03, 0.03, 0.04)),
      box(0, 0, 0.60, 0.14, 0.14, 0.14),
      spire(0, 0, 0.74, 1.00, 0.17),
      subtract(box(0, -0.28, 0.09, 0.06, 0.03, 0.09), box(0, -0.34, 0.09, 0.045, 0.05, 0.075)),
    ),
  },
  {
    id: 'lighthouse', name: 'Lighthouse',
    keywords: ['lighthouse', 'beacon', 'coast', 'harbour', 'harbor', 'nautical', 'sea'],
    sdf: union(
      frustum(0, 0, 0.00, 0.10, 0.26, 0.21),
      frustum(0, 0, 0.10, 0.66, 0.19, 0.115),
      // Gallery deck with a railing of posts.
      frustum(0, 0, 0.66, 0.70, 0.185, 0.185),
      radialArray(12, (a) => box(Math.cos(a) * 0.165, Math.sin(a) * 0.165, 0.75, 0.016, 0.016, 0.05)),
      frustum(0, 0, 0.70, 0.86, 0.115, 0.115),
      frustum(0, 0, 0.86, 0.90, 0.15, 0.15),
      spire(0, 0, 0.90, 1.00, 0.13),
    ),
  },
  {
    id: 'robot', name: 'Robot',
    keywords: ['robot', 'ai', 'bot', 'android', 'machine', 'tech', 'mech'],
    sdf: union(
      box(-0.11, 0, 0.10, 0.07, 0.08, 0.10),
      box(0.11, 0, 0.10, 0.07, 0.08, 0.10),
      box(-0.11, -0.04, 0.03, 0.08, 0.12, 0.03),
      box(0.11, -0.04, 0.03, 0.08, 0.12, 0.03),
      box(0, 0, 0.42, 0.19, 0.13, 0.22),
      capsule(-0.24, 0, 0.58, -0.26, -0.06, 0.24, 0.052),
      capsule(0.24, 0, 0.58, 0.26, -0.06, 0.24, 0.052),
      frustum(0, 0, 0.64, 0.70, 0.07, 0.09),
      box(0, 0, 0.81, 0.145, 0.115, 0.115),
      subtract(box(0, -0.117, 0.83, 0.10, 0.02, 0.045), box(0, -0.14, 0.83, 0.085, 0.03, 0.03)),
      capsule(0, 0, 0.92, 0, 0, 1.00, 0.016),
      sphere(0, 0, 1.00, 0.032),
    ),
  },
  {
    id: 'owl', name: 'Owl',
    keywords: ['owl', 'bird', 'night', 'wise', 'hoot', 'barn owl'],
    sdf: subtract(
      smoothUnion(0.05,
        ellipsoid(0, 0, 0.36, 0.24, 0.20, 0.36),
        sphere(0, -0.02, 0.70, 0.21),
        spire(-0.145, -0.02, 0.80, 0.98, 0.075),
        spire(0.145, -0.02, 0.80, 0.98, 0.075),
        ellipsoid(-0.235, 0.02, 0.34, 0.06, 0.13, 0.26),
        ellipsoid(0.235, 0.02, 0.34, 0.06, 0.13, 0.26),
        capsule(-0.09, -0.02, 0.03, -0.09, -0.10, 0.03, 0.045),
        capsule(0.09, -0.02, 0.03, 0.09, -0.10, 0.03, 0.045),
      ),
      union(
        sphere(-0.095, -0.185, 0.73, 0.062),
        sphere(0.095, -0.185, 0.73, 0.062),
      ),
    ),
  },
  {
    id: 'teapot', name: 'Teapot',
    keywords: ['teapot', 'tea', 'pot', 'kettle', 'kitchen', 'brew'],
    sdf: union(
      frustum(0, 0, 0.00, 0.08, 0.16, 0.21),
      ellipsoid(0, 0, 0.36, 0.30, 0.30, 0.30),
      frustum(0, 0, 0.58, 0.66, 0.15, 0.13),
      frustum(0, 0, 0.66, 0.70, 0.17, 0.17),
      sphere(0, 0, 0.76, 0.055),
      // Spout and handle, both genuine overhangs.
      capsule(-0.22, 0, 0.34, -0.40, 0, 0.62, 0.045),
      capsule(0.26, 0, 0.50, 0.42, 0, 0.40, 0.035),
      capsule(0.42, 0, 0.40, 0.40, 0, 0.22, 0.035),
      capsule(0.40, 0, 0.22, 0.24, 0, 0.16, 0.035),
    ),
  },
  {
    id: 'whale', name: 'Whale',
    keywords: ['whale', 'ocean', 'sea', 'orca', 'marine', 'humpback'],
    sdf: union(
      // The stand must reach the body: the whale swims clear of the plate, so a
      // short pedestal leaves it as a second, floating piece.
      frustum(0, 0, 0.00, 0.40, 0.11, 0.055),
      smoothUnion(0.05,
        ellipsoid(0, 0, 0.52, 0.34, 0.19, 0.20),
        ellipsoid(0.30, 0, 0.54, 0.14, 0.09, 0.10),
        capsule(-0.30, 0, 0.52, -0.46, 0, 0.64, 0.040),
        ellipsoid(-0.46, 0.11, 0.64, 0.09, 0.13, 0.035),
        ellipsoid(-0.46, -0.11, 0.64, 0.09, 0.13, 0.035),
        ellipsoid(0.02, 0.20, 0.46, 0.14, 0.09, 0.025),
        ellipsoid(0.02, -0.20, 0.46, 0.14, 0.09, 0.025),
        blade(0, 0, 0.62, 0.78, 0.05, 0.02, 0.022),
      ),
    ),
  },
  {
    id: 'mountain', name: 'Mountain',
    keywords: ['mountain', 'peak', 'alps', 'hill', 'landscape', 'summit', 'hike', 'everest'],
    sdf: union(
      spire(-0.06, 0.02, 0.00, 1.00, 0.40),
      spire(0.22, -0.10, 0.00, 0.62, 0.24),
      spire(-0.26, -0.14, 0.00, 0.44, 0.19),
    ),
  },
  {
    id: 'skyscraper', name: 'Skyscraper',
    keywords: ['skyscraper', 'city', 'office', 'building', 'deco', 'chrysler', 'empire'],
    sdf: union(
      box(0, 0, 0.13, 0.30, 0.30, 0.13),
      box(0, 0, 0.38, 0.23, 0.23, 0.13),
      box(0, 0, 0.60, 0.17, 0.17, 0.10),
      box(0, 0, 0.77, 0.11, 0.11, 0.08),
      frustum(0, 0, 0.85, 0.92, 0.075, 0.045),
      capsule(0, 0, 0.92, 0, 0, 1.00, 0.014),
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
