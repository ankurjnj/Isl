import {
  Sdf, blade, box, capsule, ellipsoid, frustum, radialArray,
  rotateZ, sphere, taperedBox, union,
} from './sdf';

/**
 * Body plans and the parts that hang off them.
 *
 * A sculpture is assembled rather than authored: a plan lays down a body and
 * publishes the handful of places anything else could sensibly attach, and each
 * attachment is written against those handles rather than against fixed
 * coordinates. That is what lets "a cat" and "a dragon in a crown" come out of
 * the same code -- and why an attachment written once works on every plan that
 * has a head.
 *
 * Everything here is authored in whatever units read naturally; the assembly is
 * measured and scaled into the carver's box once, at the end.
 */

/** Where things attach, and how big they should be when they get there. */
export interface Anchors {
  /** Centre and radius of the head, or of whatever crowns the shape. */
  head: [number, number, number];
  headR: number;
  /** The face, on the +y side of the head. */
  face: [number, number, number];
  /** Top of the shoulders, for wings, packs and capes. */
  back: [number, number, number];
  backR: number;
  /** The hindquarters, for tails. */
  rear: [number, number, number];
  rearR: number;
  /** Where a held object goes, if the plan has anything to hold it with. */
  hand: [number, number, number] | null;
  /** Underside, so a mount knows what height to reach up to. */
  floor: number;
  /** A characteristic size, so attachments scale with their host. */
  unit: number;
}

export interface Body {
  parts: Sdf[];
  anchors: Anchors;
}

/** Knobs a prompt's adjectives can turn. */
export interface Shape {
  /** Overall stretch up. */
  height: number;
  /** Body thickness. */
  girth: number;
  /** Leg and stalk length. */
  legs: number;
  /** Neck and stem length. */
  neck: number;
}

export const DEFAULT_SHAPE: Shape = { height: 1, girth: 1, legs: 1, neck: 1 };

const cone = (cx: number, cy: number, z0: number, z1: number, r: number) =>
  frustum(cx, cy, z0, z1, r, 0);

/** A chain of shrinking spheres along a curve: tails, tentacles, vines. */
function taper(
  from: [number, number, number], to: [number, number, number],
  bend: [number, number, number], r0: number, r1: number, n = 7,
): Sdf {
  const parts: Sdf[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    // Quadratic Bezier, so a tail can curl rather than only point.
    const p = [0, 1, 2].map((k) => u * u * from[k] + 2 * u * t * bend[k] + t * t * to[k]);
    parts.push(sphere(p[0], p[1], p[2], r0 + (r1 - r0) * t));
  }
  return union(...parts);
}

// ---------------------------------------------------------------- body plans

/**
 * Four legs and a head: cats, dogs, foxes, bears, dragons, horses.
 *
 * Seated is the default for the small ones. It is not only a nicer pose -- it
 * is a more compact and taller footprint, which is what the code wants, since a
 * standing animal spends most of its silhouette on empty air between legs.
 */
export function quadruped(s: Shape, opts: { seated?: boolean; snout?: number } = {}): Body {
  const g = s.girth, seated = opts.seated ?? true;
  if (seated) {
    const hipZ = 0.17 * s.height;
    const chestZ = (0.34 + 0.06 * s.neck) * s.height;
    const headZ = chestZ + (0.20 + 0.09 * s.neck) * s.height;
    const headR = 0.15 * (0.85 + 0.15 * g);
    const parts = [
      // Haunches, low and to the back, with the chest rising in front of them.
      ellipsoid(0, -0.10, hipZ, 0.18 * g, 0.20 * g, 0.17 * s.height),
      ellipsoid(0, 0.04, chestZ, 0.155 * g, 0.155 * g, 0.17 * s.height),
      // Front legs, straight down to the ground.
      capsule(-0.10, 0.13, 0, -0.10, 0.15, chestZ, 0.045 * g),
      capsule(0.10, 0.13, 0, 0.10, 0.15, chestZ, 0.045 * g),
      // Paws.
      ellipsoid(-0.10, 0.19, 0.035, 0.055, 0.075, 0.035),
      ellipsoid(0.10, 0.19, 0.035, 0.055, 0.075, 0.035),
      // Neck and head.
      capsule(0, 0.04, chestZ, 0, 0.06, headZ, 0.075 * g),
      sphere(0, 0.06, headZ, headR),
    ];
    return {
      parts,
      anchors: {
        head: [0, 0.06, headZ], headR,
        face: [0, 0.06 + headR * 0.75, headZ - headR * 0.15],
        back: [0, -0.02, chestZ + 0.13], backR: 0.15 * g,
        rear: [0, -0.24 * g, hipZ + 0.06], rearR: 0.09 * g,
        hand: [0.13, 0.19, chestZ * 0.6],
        floor: 0, unit: 1,
      },
    };
  }
  const legZ = 0.30 * s.legs * s.height;
  const bodyRz = 0.145 * g;
  const bodyZ = legZ + bodyRz * 0.95;
  const headR = 0.135 * (0.85 + 0.15 * g);
  const headZ = bodyZ + bodyRz + 0.14 * s.neck;
  const snout = opts.snout ?? 0;
  const parts = [
    ellipsoid(0, -0.02, bodyZ, 0.155 * g, 0.28, bodyRz),
    capsule(-0.11, -0.19, 0, -0.11, -0.19, bodyZ, 0.042 * g),
    capsule(0.11, -0.19, 0, 0.11, -0.19, bodyZ, 0.042 * g),
    capsule(-0.11, 0.16, 0, -0.11, 0.16, bodyZ, 0.042 * g),
    capsule(0.11, 0.16, 0, 0.11, 0.16, bodyZ, 0.042 * g),
    capsule(0, 0.20, bodyZ, 0, 0.24, headZ, 0.07 * g),
    sphere(0, 0.24, headZ, headR),
  ];
  if (snout) parts.push(ellipsoid(0, 0.24 + headR * 0.8, headZ - headR * 0.25, 0.055, 0.075 * snout, 0.05));
  return {
    parts,
    anchors: {
      head: [0, 0.24, headZ], headR,
      face: [0, 0.24 + headR * 0.8, headZ - headR * 0.2],
      back: [0, 0.02, bodyZ + bodyRz * 0.85], backR: 0.14 * g,
      rear: [0, -0.28, bodyZ + 0.02], rearR: 0.09 * g,
      hand: null,
      floor: 0, unit: 1,
    },
  };
}

/** Two legs, two arms, a head: robots, people, penguins, monsters. */
export function biped(s: Shape, opts: { blocky?: boolean } = {}): Body {
  const g = s.girth, blocky = opts.blocky ?? false;
  const legZ = 0.26 * s.legs * s.height;
  const torsoH = 0.22 * s.height;
  const torsoZ = legZ + torsoH;
  const neckZ = torsoZ + torsoH + 0.03 * s.neck;
  const headR = 0.145 * (0.85 + 0.15 * g);
  const headZ = neckZ + headR * 0.9;
  const shoulderZ = torsoZ + torsoH * 0.7;
  const hx = 0.15 * g;
  const parts: Sdf[] = blocky
    ? [
      box(0, 0, torsoZ, hx, 0.10 * g, torsoH),
      box(-0.075, 0, legZ / 2, 0.055, 0.06, legZ / 2),
      box(0.075, 0, legZ / 2, 0.055, 0.06, legZ / 2),
      box(0, 0, headZ, headR * 0.9, headR * 0.8, headR),
      box(-hx - 0.045, 0, shoulderZ - 0.08, 0.045, 0.05, 0.14),
      box(hx + 0.045, 0, shoulderZ - 0.08, 0.045, 0.05, 0.14),
      capsule(0, 0, torsoZ + torsoH, 0, 0, headZ, 0.045),
      // Feet, so it does not stand on two bare stumps.
      box(-0.075, 0.03, 0.022, 0.06, 0.09, 0.022),
      box(0.075, 0.03, 0.022, 0.06, 0.09, 0.022),
    ]
    : [
      ellipsoid(0, 0, torsoZ, hx, 0.105 * g, torsoH),
      capsule(-0.075, 0, 0.02, -0.075, 0, legZ + 0.02, 0.048 * g),
      capsule(0.075, 0, 0.02, 0.075, 0, legZ + 0.02, 0.048 * g),
      capsule(-hx * 0.95, 0, shoulderZ, -hx - 0.05, 0, shoulderZ - 0.20, 0.042 * g),
      capsule(hx * 0.95, 0, shoulderZ, hx + 0.05, 0, shoulderZ - 0.20, 0.042 * g),
      capsule(0, 0, torsoZ + torsoH * 0.8, 0, 0, headZ, 0.055),
      sphere(0, 0, headZ, headR),
      ellipsoid(-0.075, 0.045, 0.03, 0.055, 0.085, 0.03),
      ellipsoid(0.075, 0.045, 0.03, 0.055, 0.085, 0.03),
    ];
  return {
    parts,
    anchors: {
      head: [0, 0, headZ], headR,
      face: [0, headR * 0.8, headZ - headR * 0.1],
      back: [0, -0.05 * g, shoulderZ + 0.04], backR: hx,
      rear: [0, -0.10 * g, torsoZ - torsoH * 0.4], rearR: 0.07 * g,
      hand: [hx + 0.07, 0.02, shoulderZ - 0.20],
      floor: 0, unit: 1,
    },
  };
}

/** A rounded body over short legs: owls, penguins, chicks, ducks. */
export function bird(s: Shape, opts: { neckless?: boolean } = {}): Body {
  const g = s.girth;
  const legZ = 0.09 * s.legs;
  const bodyRz = 0.30 * s.height;
  const bodyZ = legZ + bodyRz;
  const headR = 0.165 * (0.85 + 0.15 * g);
  // An owl's head sits straight on its shoulders; a duck's is up on a neck.
  const headZ = opts.neckless ? bodyZ + bodyRz * 0.72 : bodyZ + bodyRz + 0.13 * s.neck;
  const parts: Sdf[] = [
    ellipsoid(0, 0, bodyZ, 0.21 * g, 0.185 * g, bodyRz),
    sphere(0, 0.01, headZ, headR),
    capsule(-0.075, 0.02, 0, -0.075, 0.03, legZ + 0.03, 0.028),
    capsule(0.075, 0.02, 0, 0.075, 0.03, legZ + 0.03, 0.028),
    ellipsoid(-0.075, 0.07, 0.022, 0.045, 0.075, 0.022),
    ellipsoid(0.075, 0.07, 0.022, 0.045, 0.075, 0.022),
    // Folded wings down each flank.
    ellipsoid(-0.19 * g, -0.01, bodyZ - 0.02, 0.05, 0.115, bodyRz * 0.72),
    ellipsoid(0.19 * g, -0.01, bodyZ - 0.02, 0.05, 0.115, bodyRz * 0.72),
  ];
  if (!opts.neckless) parts.push(capsule(0, 0, bodyZ + bodyRz * 0.6, 0, 0.01, headZ, 0.06 * g));
  return {
    parts,
    anchors: {
      head: [0, 0.01, headZ], headR,
      face: [0, 0.01 + headR * 0.8, headZ - headR * 0.05],
      back: [0, -0.09, bodyZ + bodyRz * 0.55], backR: 0.16 * g,
      rear: [0, -0.17 * g, bodyZ - bodyRz * 0.45], rearR: 0.08,
      hand: null,
      floor: 0, unit: 1,
    },
  };
}

/**
 * A streamlined body: whales, sharks, dolphins, fish.
 *
 * Held clear of the ground on a stand, because a fish lying on its belly is not
 * a fish -- and the stand has to actually reach the body, which is one of the
 * modelling errors the one-piece assertion caught the first time round.
 */
export function swimmer(s: Shape): Body {
  const g = s.girth;
  const bodyZ = 0.42 * s.height;
  const ry = 0.42, rz = 0.155 * g;
  const parts: Sdf[] = [
    ellipsoid(0, 0.02, bodyZ, 0.145 * g, ry, rz),
    // Peduncle into the tail, overlapping the body so the flukes are not a
    // separate piece balanced on the end of it.
    capsule(0, -0.34, bodyZ, 0, -0.46, bodyZ + 0.05, 0.05),
    blade(0, -0.50, bodyZ + 0.02, bodyZ + 0.07, 0.02, 0.19, 0.022),
    // Pectoral fins.
    rotateZ(0.5, blade(0.20, 0.05, bodyZ - 0.05, bodyZ + 0.01, 0.09, 0.02, 0.02)),
    rotateZ(-0.5, blade(-0.20, 0.05, bodyZ - 0.05, bodyZ + 0.01, 0.09, 0.02, 0.02)),
    // Dorsal fin.
    blade(0, 0.02, bodyZ + rz * 0.6, bodyZ + rz + 0.10, 0.075, 0.015, 0.022),
    // The stand.
    frustum(0, 0.02, 0, bodyZ, 0.115, 0.075),
  ];
  return {
    parts,
    anchors: {
      head: [0, 0.34, bodyZ + 0.02], headR: 0.11 * g,
      face: [0, 0.42, bodyZ],
      back: [0, 0.02, bodyZ + rz * 0.8], backR: 0.13 * g,
      rear: [0, -0.40, bodyZ + 0.03], rearR: 0.05,
      hand: null,
      floor: 0, unit: 1,
    },
  };
}

/** A stem under a crown: trees, mushrooms, flowers, palms. */
export function plant(s: Shape, opts: { crown: 'broadleaf' | 'conifer' | 'cap' | 'bloom' }): Body {
  const trunkTop = (opts.crown === 'cap' ? 0.42 : 0.40) * s.legs * s.height;
  const parts: Sdf[] = [];
  let headZ = trunkTop, headR = 0.2;
  if (opts.crown === 'conifer') {
    parts.push(frustum(0, 0, 0, 0.26 * s.legs, 0.055, 0.042));
    const tiers = 4;
    for (let i = 0; i < tiers; i++) {
      const z0 = (0.18 + i * 0.24) * s.height, r = (0.34 - i * 0.08) * s.girth;
      parts.push(frustum(0, 0, z0, z0 + 0.32 * s.height, r, r * 0.15));
    }
    headZ = 0.18 + tiers * 0.24 * s.height; headR = 0.09;
  } else if (opts.crown === 'cap') {
    parts.push(frustum(0, 0, 0, trunkTop + 0.06, 0.085 * s.girth, 0.075 * s.girth));
    const capR = 0.34 * s.girth;
    parts.push(ellipsoid(0, 0, trunkTop, capR, capR, 0.20 * s.height));
    parts.push(frustum(0, 0, trunkTop - 0.09, trunkTop + 0.02, 0.16, capR * 0.92));
    headZ = trunkTop + 0.18; headR = capR * 0.6;
  } else if (opts.crown === 'bloom') {
    parts.push(capsule(0, 0, 0, 0, 0, trunkTop + 0.14, 0.035 * s.girth));
    parts.push(sphere(0, 0, trunkTop + 0.20, 0.10));
    parts.push(radialArray(6, (a) => ellipsoid(
      Math.cos(a) * 0.19, Math.sin(a) * 0.19, trunkTop + 0.20, 0.13, 0.13, 0.045)));
    // A pair of leaves down the stem, so it is not a lollipop.
    parts.push(ellipsoid(0.13, 0, trunkTop * 0.55, 0.11, 0.05, 0.035));
    parts.push(ellipsoid(-0.13, 0, trunkTop * 0.72, 0.11, 0.05, 0.035));
    headZ = trunkTop + 0.20; headR = 0.12;
  } else {
    parts.push(frustum(0, 0, 0, trunkTop + 0.04, 0.075 * s.girth, 0.045 * s.girth));
    parts.push(capsule(0, 0, trunkTop - 0.08, -0.13, 0.05, trunkTop + 0.14, 0.028));
    parts.push(capsule(0, 0, trunkTop - 0.04, 0.14, -0.06, trunkTop + 0.18, 0.028));
    const cz = trunkTop + 0.30 * s.height, cr = 0.26 * s.girth;
    parts.push(sphere(0, 0, cz, cr));
    parts.push(sphere(-0.17, 0.06, cz - 0.12, cr * 0.66));
    parts.push(sphere(0.18, -0.05, cz - 0.09, cr * 0.62));
    parts.push(sphere(0.05, 0.15, cz + 0.10, cr * 0.58));
    parts.push(sphere(-0.06, -0.13, cz + 0.13, cr * 0.54));
    headZ = cz + cr * 0.7; headR = cr;
  }
  return {
    parts,
    anchors: {
      head: [0, 0, headZ], headR,
      face: [0, headR * 0.8, headZ],
      back: [0, 0, headZ - headR * 0.6], backR: headR * 0.7,
      rear: [0, -headR * 0.7, headZ - headR * 0.5], rearR: headR * 0.4,
      hand: null,
      floor: 0, unit: 1,
    },
  };
}

/** Stacked masses under a roof: houses, castles, towers, lighthouses, blocks. */
export function building(
  s: Shape,
  opts: { roof: 'gable' | 'cone' | 'spire' | 'flat'; towers?: boolean; taper?: boolean; stripes?: boolean },
): Body {
  const g = s.girth, parts: Sdf[] = [];
  const wallTop = (opts.roof === 'flat' ? 0.86 : 0.52) * s.height;
  let apex = wallTop, apexR = 0.3 * g;
  if (opts.taper) {
    const tiers = 4;
    let z = 0, half = 0.31 * g;
    for (let i = 0; i < tiers; i++) {
      const h = (0.26 - i * 0.045) * s.height;
      parts.push(box(0, 0, z + h / 2, half, half, h / 2));
      z += h; half *= 0.75;
    }
    apex = z; apexR = half;
  } else if (opts.stripes) {
    parts.push(frustum(0, 0, 0, wallTop + 0.22, 0.24 * g, 0.135 * g));
    // A gallery ringing the lamp room, which is what makes a lighthouse read
    // as one rather than as a traffic cone.
    parts.push(frustum(0, 0, wallTop + 0.20, wallTop + 0.26, 0.20, 0.20));
    parts.push(frustum(0, 0, wallTop + 0.24, wallTop + 0.40, 0.125, 0.125));
    apex = wallTop + 0.40; apexR = 0.125;
  } else {
    parts.push(box(0, 0, wallTop / 2, 0.30 * g, 0.26 * g, wallTop / 2));
  }
  if (opts.towers) {
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const cx = sx * 0.30 * g, cy = sy * 0.26 * g;
      parts.push(frustum(cx, cy, 0, wallTop + 0.20, 0.095, 0.085));
      parts.push(cone(cx, cy, wallTop + 0.18, wallTop + 0.42, 0.115));
    }
    apex = wallTop + 0.42; apexR = 0.1;
  }
  if (opts.roof === 'gable') {
    // A ridged roof: a blade laid across the walls, not a pyramid.
    parts.push(blade(0, 0, wallTop - 0.01, wallTop + 0.30 * s.height, 0.32 * g, 0.01, 0.28 * g));
    apex = wallTop + 0.30 * s.height; apexR = 0.05;
    parts.push(box(0.15, 0, wallTop + 0.16, 0.045, 0.045, 0.14));
  } else if (opts.roof === 'cone') {
    parts.push(cone(0, 0, wallTop - 0.02, wallTop + 0.34 * s.height, 0.33 * g));
    apex = wallTop + 0.34 * s.height; apexR = 0.05;
  } else if (opts.roof === 'spire') {
    parts.push(taperedBox(0, 0, wallTop - 0.02, wallTop + 0.26, 0.26 * g, 0.09));
    parts.push(cone(0, 0, wallTop + 0.22, wallTop + 0.52, 0.10));
    apex = wallTop + 0.52; apexR = 0.05;
  }
  return {
    parts,
    anchors: {
      head: [0, 0, apex - apexR], headR: Math.max(0.06, apexR),
      face: [0, 0.26 * g, wallTop * 0.6],
      back: [0, -0.20 * g, wallTop], backR: 0.2 * g,
      rear: [0, -0.28 * g, wallTop * 0.4], rearR: 0.1,
      hand: null,
      floor: 0, unit: 1,
    },
  };
}

/** A fuselage with fins or wings: rockets, planes, cars, boats, submarines. */
export function vehicle(
  s: Shape,
  opts: { form: 'rocket' | 'plane' | 'car' | 'boat' },
): Body {
  const g = s.girth, parts: Sdf[] = [];
  let apex = 1, apexR = 0.05;
  if (opts.form === 'rocket') {
    const bodyTop = 0.62 * s.height, noseTop = 0.98 * s.height;
    parts.push(frustum(0, 0, 0, 0.09, 0.115 * g, 0.075 * g));
    parts.push(frustum(0, 0, 0.07, bodyTop, 0.145 * g, 0.145 * g));
    parts.push(frustum(0, 0, bodyTop - 0.02, bodyTop + 0.03, 0.165 * g, 0.165 * g));
    parts.push(cone(0, 0, bodyTop, noseTop, 0.145 * g));
    parts.push(radialArray(4, (a) => rotateZ(a,
      blade(0, 0.20 * g, 0.02, 0.30, 0.10, 0.02, 0.018))));
    apex = noseTop; apexR = 0.03;
  } else if (opts.form === 'plane') {
    const z = 0.40 * s.height;
    parts.push(frustum(0, 0, 0, z, 0.075, 0.055));
    parts.push(ellipsoid(0, 0, z + 0.10, 0.085 * g, 0.34, 0.085 * g));
    parts.push(cone(0, 0, z + 0.10, z + 0.10, 0.08));
    parts.push(rotateZ(Math.PI / 2, blade(0, 0, z + 0.06, z + 0.12, 0.40, 0.09, 0.018)));
    parts.push(blade(0, -0.28, z + 0.10, z + 0.26, 0.015, 0.09, 0.018));
    parts.push(rotateZ(Math.PI / 2, blade(0, -0.28, z + 0.08, z + 0.12, 0.15, 0.05, 0.016)));
    apex = z + 0.26; apexR = 0.05;
  } else if (opts.form === 'car') {
    parts.push(box(0, 0, 0.16, 0.19 * g, 0.36, 0.075));
    parts.push(box(0, -0.02, 0.28, 0.155 * g, 0.19, 0.075));
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      parts.push(rotateZ(Math.PI / 2, frustum(sy * 0.24, -sx * 0.19 * g, 0, 0.001, 0.10, 0.10)));
    }
    apex = 0.355; apexR = 0.14;
  } else {
    parts.push(ellipsoid(0, 0, 0.24, 0.20 * g, 0.42, 0.16));
    parts.push(box(0, -0.06, 0.40, 0.11 * g, 0.13, 0.075));
    parts.push(capsule(0, 0.06, 0.30, 0, 0.06, 0.92, 0.022));
    parts.push(blade(0, 0.06, 0.44, 0.88, 0.001, 0.02, 0.22));
    apex = 0.92; apexR = 0.03;
  }
  return {
    parts,
    anchors: {
      head: [0, 0, apex - apexR * 1.5], headR: Math.max(0.06, apexR),
      face: [0, 0.14, apex * 0.6],
      back: [0, -0.10, apex * 0.55], backR: 0.14 * g,
      rear: [0, -0.20, apex * 0.3], rearR: 0.08,
      hand: null,
      floor: 0, unit: 1,
    },
  };
}

// --------------------------------------------------------------- attachments

/**
 * Each takes the body's anchors and returns parts that overlap it.
 *
 * Overlap is not a stylistic choice: the whole print has to come out as one
 * connected body, so an attachment that merely touches its host is a defect the
 * suite fails on.
 */
export type Attachment = (a: Anchors) => Sdf[];

const ATTACH: Record<string, Attachment> = {
  wizardHat: (a) => {
    const [x, y, z] = a.head, r = a.headR;
    const base = z + r * 0.55;
    return [
      frustum(x, y, base - r * 0.35, base + r * 0.12, r * 1.45, r * 1.25),
      cone(x, y - r * 0.1, base, base + r * 3.0, r * 0.95),
    ];
  },
  topHat: (a) => {
    const [x, y, z] = a.head, r = a.headR;
    const base = z + r * 0.6;
    return [
      frustum(x, y, base - r * 0.3, base + r * 0.1, r * 1.5, r * 1.5),
      frustum(x, y, base - r * 0.2, base + r * 1.6, r * 0.95, r * 0.95),
    ];
  },
  cap: (a) => {
    const [x, y, z] = a.head, r = a.headR;
    return [
      ellipsoid(x, y, z + r * 0.35, r * 1.05, r * 1.05, r * 0.7),
      blade(x, y + r * 1.1, z + r * 0.42, z + r * 0.55, r * 0.8, r * 0.5, r * 0.55),
    ];
  },
  crown: (a) => {
    const [x, y, z] = a.head, r = a.headR;
    const base = z + r * 0.55;
    return [
      frustum(x, y, base - r * 0.25, base + r * 0.45, r * 1.02, r * 1.02),
      radialArray(6, (ang) => cone(
        x + Math.cos(ang) * r * 0.92, y + Math.sin(ang) * r * 0.92,
        base + r * 0.25, base + r * 1.05, r * 0.24)),
    ];
  },
  horns: (a) => {
    const [x, y, z] = a.head, r = a.headR;
    return [-1, 1].map((s) => taper(
      [x + s * r * 0.55, y - r * 0.1, z + r * 0.6],
      [x + s * r * 1.5, y - r * 0.35, z + r * 1.5],
      [x + s * r * 1.35, y - r * 0.1, z + r * 0.85],
      r * 0.26, r * 0.03, 6));
  },
  catEars: (a) => {
    const [x, y, z] = a.head, r = a.headR;
    return [-1, 1].map((s) => cone(
      x + s * r * 0.6, y - r * 0.05, z + r * 0.35, z + r * 1.45, r * 0.42));
  },
  longEars: (a) => {
    const [x, y, z] = a.head, r = a.headR;
    return [-1, 1].map((s) => ellipsoid(
      x + s * r * 0.45, y - r * 0.1, z + r * 1.25, r * 0.28, r * 0.22, r * 0.95));
  },
  earTufts: (a) => {
    const [x, y, z] = a.head, r = a.headR;
    return [-1, 1].map((s) => cone(
      x + s * r * 0.62, y - r * 0.1, z + r * 0.5, z + r * 1.15, r * 0.34));
  },
  antenna: (a) => {
    const [x, y, z] = a.head, r = a.headR;
    return [
      capsule(x, y, z + r * 0.6, x, y, z + r * 2.1, r * 0.09),
      sphere(x, y, z + r * 2.2, r * 0.22),
    ];
  },
  halo: (a) => {
    const [x, y, z] = a.head, r = a.headR;
    return [
      radialArray(14, (ang) => sphere(
        x + Math.cos(ang) * r * 1.15, y + Math.sin(ang) * r * 1.15, z + r * 2.0, r * 0.13)),
      // A stalk, because a halo that floats is a halo that prints as litter.
      capsule(x, y - r * 0.6, z + r * 0.7, x, y - r * 1.05, z + r * 2.0, r * 0.07),
    ];
  },
  beak: (a) => {
    const [x, y, z] = a.face;
    const r = a.headR;
    return [rotateZ(0, frustum(x, y - r * 0.25, z - r * 0.18, z + r * 0.18, r * 0.42, 0.001))]
      .concat([cone(x, y, z, z, r * 0.3)])
      .concat([blade(x, y + r * 0.28, z - r * 0.2, z + r * 0.12, r * 0.22, 0.004, r * 0.5)]);
  },
  snout: (a) => {
    const [x, y, z] = a.face, r = a.headR;
    return [
      ellipsoid(x, y + r * 0.2, z - r * 0.1, r * 0.42, r * 0.6, r * 0.34),
      sphere(x, y + r * 0.75, z, r * 0.15),
    ];
  },
  wings: (a) => {
    const [x, y, z] = a.back, r = a.backR;
    return [-1, 1].map((s) => rotateZ(s * 0.55, blade(
      x + s * r * 1.5, y - r * 0.2, z - r * 0.5, z + r * 1.5, r * 0.95, r * 0.15, r * 0.16)));
  },
  batWings: (a) => {
    const [x, y, z] = a.back, r = a.backR;
    const out: Sdf[] = [];
    for (const s of [-1, 1]) {
      out.push(rotateZ(s * 0.45, blade(
        x + s * r * 1.3, y - r * 0.1, z - r * 0.3, z + r * 1.3, r * 0.9, r * 0.1, r * 0.12)));
      // A leading-edge spar, so the membrane reads as a bat's and not a bird's.
      out.push(rotateZ(s * 0.45, capsule(
        x + s * r * 0.4, y - r * 0.1, z - r * 0.3, x + s * r * 2.2, y - r * 0.1, z + r * 1.35, r * 0.1)));
    }
    return out;
  },
  shell: (a) => {
    const [x, y, z] = a.back, r = a.backR;
    return [
      ellipsoid(x, y - r * 0.1, z - r * 0.15, r * 1.35, r * 1.5, r * 1.05),
      radialArray(7, (ang) => sphere(
        x + Math.cos(ang) * r * 0.85, y - r * 0.1 + Math.sin(ang) * r * 0.95, z + r * 0.5, r * 0.18)),
    ];
  },
  backpack: (a) => {
    const [x, y, z] = a.back, r = a.backR;
    return [box(x, y - r * 1.0, z - r * 0.35, r * 0.85, r * 0.45, r * 0.9)];
  },
  jetpack: (a) => {
    const [x, y, z] = a.back, r = a.backR;
    return [-1, 1].map((s) => frustum(
      x + s * r * 0.45, y - r * 0.95, z - r * 1.1, z + r * 0.8, r * 0.34, r * 0.28));
  },
  cape: (a) => {
    const [x, y, z] = a.back, r = a.backR;
    return [
      blade(x, y - r * 0.9, a.floor + r * 0.2, z + r * 0.5, r * 1.5, r * 0.75, r * 0.12),
      frustum(x, y - r * 0.2, z + r * 0.3, z + r * 0.6, r * 1.05, r * 0.95),
    ];
  },
  scarf: (a) => {
    const [x, y, z] = a.head, r = a.headR;
    return [
      frustum(x, y, z - r * 1.15, z - r * 0.7, r * 0.85, r * 0.85),
      blade(x + r * 0.5, y - r * 0.6, z - r * 2.2, z - r * 0.8, r * 0.34, r * 0.28, r * 0.14),
    ];
  },
  curlTail: (a) => {
    const [x, y, z] = a.rear, r = a.rearR;
    return [taper([x, y + r * 0.4, z], [x + r * 0.3, y - r * 3.2, z + r * 4.4],
      [x, y - r * 3.6, z + r * 0.6], r * 0.8, r * 0.34, 8)];
  },
  bushyTail: (a) => {
    const [x, y, z] = a.rear, r = a.rearR;
    return [taper([x, y + r * 0.3, z], [x, y - r * 2.6, z + r * 3.6],
      [x, y - r * 2.8, z + r * 0.4], r * 0.85, r * 1.35, 8)];
  },
  sword: (a) => {
    if (!a.hand) return [];
    const [x, y, z] = a.hand;
    return [
      capsule(x, y, z - 0.03, x, y, z + 0.05, 0.022),
      box(x, y, z + 0.055, 0.055, 0.016, 0.012),
      blade(x, y, z + 0.06, z + 0.34, 0.028, 0.012, 0.012),
    ];
  },
  staff: (a) => {
    if (!a.hand) return [];
    const [x, y, z] = a.hand;
    return [capsule(x, y, z - 0.16, x, y, z + 0.30, 0.018), sphere(x, y, z + 0.33, 0.045)];
  },
  flag: (a) => {
    if (!a.hand) return [];
    const [x, y, z] = a.hand;
    return [
      capsule(x, y, z - 0.10, x, y, z + 0.36, 0.016),
      blade(x + 0.09, y, z + 0.18, z + 0.35, 0.09, 0.09, 0.012),
    ];
  },
};

export function attachment(id: string): Attachment | undefined {
  return ATTACH[id];
}

export const ATTACHMENT_IDS = Object.keys(ATTACH);

// --------------------------------------------------------------------- mounts

/** Something the subject stands on. Returns its parts and the height to lift by. */
export type Mount = { parts: Sdf[]; lift: number };

const MOUNTS: Record<string, () => Mount> = {
  rocket: () => ({
    lift: 0.62,
    parts: [
      frustum(0, 0, 0, 0.07, 0.15, 0.10),
      frustum(0, 0, 0.05, 0.58, 0.185, 0.185),
      frustum(0, 0, 0.55, 0.66, 0.185, 0.13),
      radialArray(4, (a) => rotateZ(a, blade(0, 0.24, 0.01, 0.26, 0.10, 0.02, 0.018))),
    ],
  }),
  hill: () => ({
    lift: 0.24,
    parts: [
      ellipsoid(0, 0, -0.06, 0.48, 0.48, 0.32),
      sphere(-0.26, 0.14, 0.10, 0.10),
      sphere(0.28, -0.10, 0.08, 0.09),
    ],
  }),
  pedestal: () => ({
    lift: 0.26,
    parts: [
      box(0, 0, 0.035, 0.30, 0.30, 0.035),
      frustum(0, 0, 0.05, 0.22, 0.17, 0.17),
      box(0, 0, 0.245, 0.24, 0.24, 0.035),
    ],
  }),
  wave: () => ({
    lift: 0.28,
    parts: [
      ellipsoid(0, 0, 0.06, 0.46, 0.40, 0.16),
      ellipsoid(0, -0.10, 0.20, 0.34, 0.26, 0.13),
      taper([0.30, -0.20, 0.16], [0.40, -0.34, 0.44], [0.44, -0.24, 0.30], 0.09, 0.03, 6),
      taper([-0.28, -0.16, 0.16], [-0.38, -0.30, 0.40], [-0.42, -0.20, 0.28], 0.08, 0.03, 6),
    ],
  }),
  skateboard: () => ({
    lift: 0.12,
    parts: [
      box(0, 0, 0.085, 0.13, 0.34, 0.022),
      frustum(0, 0.30, 0.085, 0.11, 0.12, 0.10),
      frustum(0, -0.30, 0.085, 0.11, 0.12, 0.10),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => rotateZ(
        Math.PI / 2, frustum(sy * 0.22, -sx * 0.13, 0, 0.001, 0.055, 0.055))),
    ],
  }),
  stack: () => ({
    lift: 0.30,
    parts: [
      box(0, 0, 0.05, 0.30, 0.24, 0.05),
      box(0.02, 0, 0.15, 0.26, 0.21, 0.05),
      box(-0.02, 0.01, 0.25, 0.22, 0.18, 0.05),
    ],
  }),
};

export function mount(id: string): Mount | undefined {
  return MOUNTS[id]?.();
}

export const MOUNT_IDS = Object.keys(MOUNTS);
