import {
  Body, DEFAULT_SHAPE, Shape, attachment, biped, bird, building,
  mount, plant, quadruped, swimmer, vehicle,
} from './anatomy';
import { Sdf, fitToSpace, scaled, smoothUnion, translateZ, union } from './sdf';

/**
 * Turn a prompt into a sculpture.
 *
 * The library it replaced held fourteen finished models and matched a prompt to
 * the nearest one, so "a cat in a wizard hat riding a rocket" was a cat. Here a
 * prompt is read as a body plan, a set of things hanging off it, and something
 * it stands on -- three small vocabularies that multiply out to far more
 * sculptures than anyone would author by hand.
 *
 * The recipe is plain data on purpose. Models are closures and cannot cross a
 * worker boundary, so what gets sent is the recipe and the worker rebuilds it.
 */

export type PlanId =
  | 'quadruped' | 'quadrupedStanding' | 'biped' | 'bipedBlocky'
  | 'bird' | 'birdNecked' | 'swimmer'
  | 'treeBroadleaf' | 'treeConifer' | 'mushroom' | 'flower'
  | 'house' | 'castle' | 'tower' | 'lighthouse' | 'skyscraper'
  | 'rocket' | 'plane' | 'car' | 'boat';

export interface Recipe {
  plan: PlanId;
  shape: Shape;
  attach: string[];
  mount?: string;
  /** What to call this in the interface. */
  label: string;
}

function plan(id: PlanId, s: Shape): Body {
  switch (id) {
    case 'quadruped': return quadruped(s, { seated: true });
    case 'quadrupedStanding': return quadruped(s, { seated: false, snout: 1 });
    case 'biped': return biped(s);
    case 'bipedBlocky': return biped(s, { blocky: true });
    case 'bird': return bird(s, { neckless: true });
    case 'birdNecked': return bird(s);
    case 'swimmer': return swimmer(s);
    case 'treeBroadleaf': return plant(s, { crown: 'broadleaf' });
    case 'treeConifer': return plant(s, { crown: 'conifer' });
    case 'mushroom': return plant(s, { crown: 'cap' });
    case 'flower': return plant(s, { crown: 'bloom' });
    case 'house': return building(s, { roof: 'gable' });
    case 'castle': return building(s, { roof: 'spire', towers: true });
    case 'tower': return building(s, { roof: 'cone' });
    case 'lighthouse': return building(s, { roof: 'cone', stripes: true });
    case 'skyscraper': return building(s, { roof: 'flat', taper: true });
    case 'rocket': return vehicle(s, { form: 'rocket' });
    case 'plane': return vehicle(s, { form: 'plane' });
    case 'car': return vehicle(s, { form: 'car' });
    case 'boat': return vehicle(s, { form: 'boat' });
  }
}

/**
 * Assemble a recipe into a solid.
 *
 * Smooth-unioned rather than plain-unioned so joints read as fillets: an ear
 * meeting a skull at a hard crease looks like two parts stuck together, which
 * is exactly what it is and exactly what should not show. The blend radius is
 * small -- enough to fillet a seam, not enough to melt a beak into a face.
 */
export function composeRecipe(r: Recipe): Sdf {
  const body = plan(r.plan, r.shape);
  const parts = [...body.parts];
  for (const id of r.attach) {
    const make = attachment(id);
    if (make) parts.push(...make(body.anchors));
  }
  let solid: Sdf = smoothUnion(0.022, ...parts);
  const m = r.mount ? mount(r.mount) : undefined;
  if (m) {
    // Mounts are authored at body scale and then taken down, because a rocket
    // that reads as the subject's equal reads as the subject: what is being
    // sculpted is a dragon on a rocket, not a rocket with a dragon on it.
    const k = 0.72;
    const lift = m.lift * k;
    // The subject is lifted clear and the mount raised to meet it, so the two
    // overlap rather than merely touching -- a print has to be one body.
    solid = union(translateZ(lift - 0.02, solid), ...m.parts.map((q) => scaled(k, q)));
  }
  return fitToSpace(solid);
}

// ------------------------------------------------------------------- the words

interface Subject {
  plan: PlanId;
  /** What this creature has by default -- a cat has ears and a tail. */
  attach?: string[];
  shape?: Partial<Shape>;
  name: string;
}

/**
 * Nouns the parser knows, richest first.
 *
 * Order matters: two-word entries are tested before one-word ones, so "polar
 * bear" is not read as "bear" wearing nothing and "top hat" is never "hat".
 */
const SUBJECTS: Array<[string[], Subject]> = [
  [['cat', 'kitten', 'kitty', 'feline'], { plan: 'quadruped', attach: ['catEars', 'snout', 'curlTail'], name: 'Cat' }],
  [['fox'], { plan: 'quadruped', attach: ['catEars', 'snout', 'bushyTail'], name: 'Fox' }],
  [['dog', 'puppy', 'hound', 'corgi', 'shiba'], { plan: 'quadrupedStanding', attach: ['longEars', 'bushyTail'], name: 'Dog' }],
  [['bear', 'panda'], { plan: 'quadrupedStanding', attach: ['snout'], shape: { girth: 1.25 }, name: 'Bear' }],
  [['horse', 'pony', 'unicorn'], { plan: 'quadrupedStanding', attach: ['longEars', 'bushyTail'], shape: { legs: 1.3, neck: 1.4 }, name: 'Horse' }],
  [['giraffe'], { plan: 'quadrupedStanding', attach: ['longEars'], shape: { legs: 1.5, neck: 2.6, girth: 0.8 }, name: 'Giraffe' }],
  [['elephant'], { plan: 'quadrupedStanding', attach: ['longEars', 'snout'], shape: { girth: 1.4, legs: 1.15 }, name: 'Elephant' }],
  [['pig', 'hog', 'boar'], { plan: 'quadrupedStanding', attach: ['snout', 'curlTail'], shape: { girth: 1.35, legs: 0.75 }, name: 'Pig' }],
  [['cow', 'bull', 'ox'], { plan: 'quadrupedStanding', attach: ['horns', 'snout', 'bushyTail'], shape: { girth: 1.25 }, name: 'Cow' }],
  [['sheep', 'lamb', 'goat'], { plan: 'quadrupedStanding', attach: ['horns', 'snout'], shape: { girth: 1.3, legs: 0.85 }, name: 'Sheep' }],
  [['frog', 'toad'], { plan: 'quadruped', attach: ['snout'], shape: { girth: 1.3, height: 0.8, legs: 0.6 }, name: 'Frog' }],
  [['dragon', 'wyvern'], { plan: 'quadrupedStanding', attach: ['horns', 'batWings', 'curlTail', 'snout'], name: 'Dragon' }],
  [['rabbit', 'bunny', 'hare'], { plan: 'quadruped', attach: ['longEars', 'snout'], shape: { girth: 1.1 }, name: 'Rabbit' }],
  [['mouse', 'rat', 'hamster'], { plan: 'quadruped', attach: ['longEars', 'snout', 'curlTail'], shape: { height: 0.85 }, name: 'Mouse' }],
  [['turtle', 'tortoise'], { plan: 'quadrupedStanding', attach: ['shell', 'snout'], shape: { legs: 0.6, girth: 1.2 }, name: 'Turtle' }],

  [['owl'], { plan: 'bird', attach: ['earTufts', 'beak'], name: 'Owl' }],
  [['penguin'], { plan: 'bird', attach: ['beak'], shape: { height: 1.15 }, name: 'Penguin' }],
  [['chick', 'chicken', 'hen', 'bird', 'duck', 'goose', 'parrot', 'robin'],
    { plan: 'birdNecked', attach: ['beak'], name: 'Bird' }],

  [['whale', 'orca'], { plan: 'swimmer', shape: { girth: 1.25 }, name: 'Whale' }],
  [['shark', 'dolphin', 'fish', 'salmon', 'koi'], { plan: 'swimmer', name: 'Fish' }],

  [['robot', 'android', 'bot', 'droid', 'mech'], { plan: 'bipedBlocky', attach: ['antenna'], name: 'Robot' }],
  [['astronaut', 'spaceman'], { plan: 'biped', attach: ['jetpack'], name: 'Astronaut' }],
  [['knight'], { plan: 'biped', attach: ['sword', 'cape'], name: 'Knight' }],
  [['wizard', 'witch', 'mage', 'sorcerer'], { plan: 'biped', attach: ['wizardHat', 'staff'], name: 'Wizard' }],
  [['person', 'human', 'figure', 'man', 'woman', 'kid', 'child'], { plan: 'biped', name: 'Figure' }],
  [['monster', 'troll', 'ogre', 'yeti'], { plan: 'biped', attach: ['horns'], shape: { girth: 1.3 }, name: 'Monster' }],

  [['pine', 'fir', 'conifer', 'spruce', 'evergreen', 'christmas'], { plan: 'treeConifer', name: 'Pine tree' }],
  [['tree', 'oak', 'forest', 'woodland'], { plan: 'treeBroadleaf', name: 'Tree' }],
  [['mushroom', 'toadstool', 'fungus'], { plan: 'mushroom', name: 'Mushroom' }],
  [['flower', 'rose', 'tulip', 'daisy', 'bloom', 'sunflower'], { plan: 'flower', name: 'Flower' }],

  [['castle', 'fortress', 'palace', 'keep'], { plan: 'castle', name: 'Castle' }],
  [['lighthouse', 'beacon'], { plan: 'lighthouse', name: 'Lighthouse' }],
  [['skyscraper', 'office', 'tower block'], { plan: 'skyscraper', name: 'Skyscraper' }],
  [['tower', 'turret', 'silo'], { plan: 'tower', name: 'Tower' }],
  [['house', 'home', 'cottage', 'cabin', 'barn', 'hut'], { plan: 'house', name: 'House' }],

  [['rocket', 'spaceship', 'starship', 'missile', 'launch'], { plan: 'rocket', name: 'Rocket' }],
  [['plane', 'aeroplane', 'airplane', 'jet', 'aircraft'], { plan: 'plane', name: 'Plane' }],
  [['car', 'truck', 'van', 'racer', 'automobile'], { plan: 'car', name: 'Car' }],
  [['boat', 'ship', 'yacht', 'sailboat', 'sloop'], { plan: 'boat', name: 'Boat' }],
];

/** Things that hang off a subject. Multi-word entries are matched first. */
const ACCESSORIES: Array<[string[], string, string]> = [
  [['wizard hat', 'pointy hat', 'witch hat', 'sorting hat'], 'wizardHat', 'wizard hat'],
  [['top hat', 'tophat', 'stovepipe'], 'topHat', 'top hat'],
  [['baseball cap', 'cap', 'beanie'], 'cap', 'cap'],
  [['crown', 'tiara', 'diadem'], 'crown', 'crown'],
  [['horns', 'horn', 'antlers'], 'horns', 'horns'],
  [['bunny ears', 'long ears', 'rabbit ears'], 'longEars', 'long ears'],
  [['cat ears'], 'catEars', 'cat ears'],
  [['antenna', 'aerial'], 'antenna', 'antenna'],
  [['halo'], 'halo', 'halo'],
  [['bat wings', 'dragon wings', 'leathery wings'], 'batWings', 'bat wings'],
  [['wings', 'wing'], 'wings', 'wings'],
  [['shell'], 'shell', 'shell'],
  [['jetpack', 'jet pack', 'rocket pack'], 'jetpack', 'jetpack'],
  [['backpack', 'rucksack', 'satchel'], 'backpack', 'backpack'],
  [['cape', 'cloak'], 'cape', 'cape'],
  [['scarf'], 'scarf', 'scarf'],
  [['bushy tail', 'fluffy tail'], 'bushyTail', 'bushy tail'],
  [['tail'], 'curlTail', 'tail'],
  [['sword', 'blade', 'katana'], 'sword', 'sword'],
  [['staff', 'wand', 'sceptre', 'scepter'], 'staff', 'staff'],
  [['flag', 'banner', 'pennant'], 'flag', 'flag'],
  [['beak'], 'beak', 'beak'],
];

/** Things a subject can stand on. */
const MOUNTS: Array<[string[], string, string]> = [
  [['rocket', 'spaceship', 'missile'], 'rocket', 'a rocket'],
  [['hill', 'mountain', 'boulder', 'rock', 'moon'], 'hill', 'a hill'],
  [['pedestal', 'plinth', 'podium', 'trophy', 'stand'], 'pedestal', 'a pedestal'],
  [['wave', 'water', 'sea', 'ocean', 'surf'], 'wave', 'a wave'],
  [['skateboard', 'board', 'surfboard', 'sled'], 'skateboard', 'a skateboard'],
  [['books', 'boxes', 'stack', 'crates', 'blocks'], 'stack', 'a stack'],
];

/** Adjectives that turn the shape knobs. */
const MODIFIERS: Array<[string[], Partial<Shape>]> = [
  [['tall', 'towering', 'lanky', 'stretched'], { height: 1.3, legs: 1.25 }],
  [['tiny', 'small', 'little', 'mini', 'baby', 'chibi'], { height: 0.8, girth: 1.15, legs: 0.8 }],
  [['fat', 'chubby', 'round', 'plump', 'fluffy', 'thicc'], { girth: 1.35 }],
  [['thin', 'slim', 'skinny', 'slender'], { girth: 0.75 }],
  [['long-necked', 'giraffe'], { neck: 2.0 }],
  [['stubby', 'squat', 'short'], { height: 0.85, legs: 0.6, girth: 1.2 }],
  [['giant', 'huge', 'massive'], { height: 1.2, girth: 1.25 }],
];

/**
 * The words that mean "and this hangs off it" versus "and it stands on that".
 *
 * Without them "a cat on a rocket" and "a cat with a rocket pack" would read
 * the same, and the difference between the two is the whole sculpture.
 */
const MOUNT_CUES = /\b(riding|rides|on top of|standing on|sitting on|atop|perched on|on a|on an|on the|surfing|driving|in a|inside a)\b/;

function findPhrase(text: string, phrases: string[]): { phrase: string; at: number } | null {
  let best: { phrase: string; at: number } | null = null;
  for (const p of phrases) {
    const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    const m = re.exec(text);
    if (!m) continue;
    // Prefer the longest phrase, then the earliest -- "top hat" beats "hat".
    if (!best || p.length > best.phrase.length) best = { phrase: p, at: m.index };
  }
  return best;
}

/**
 * Read a prompt into a recipe.
 *
 * Returns null only when nothing at all was recognised, which the caller falls
 * back on by casting the word itself as lettering.
 */
export function parsePrompt(prompt: string): Recipe | null {
  const text = ` ${prompt.toLowerCase().replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ')} `;

  // The subject is the earliest noun in the sentence; anything later that also
  // names a subject is scenery -- "a cat riding a rocket" is a cat.
  let subject: { s: Subject; at: number } | null = null;
  for (const [words, s] of SUBJECTS) {
    const hit = findPhrase(text, words);
    if (!hit) continue;
    if (!subject || hit.at < subject.at) subject = { s, at: hit.at };
  }
  if (!subject) return null;

  // Modifiers multiply rather than replace, so "a tall chubby bear" is both,
  // and neither erases the bear's own build.
  const shape: Shape = { ...DEFAULT_SHAPE, ...subject.s.shape };
  const adjectives: string[] = [];
  for (const [words, mod] of MODIFIERS) {
    const hit = findPhrase(text, words);
    if (!hit) continue;
    adjectives.push(hit.phrase);
    for (const k of Object.keys(shape) as Array<keyof Shape>) shape[k] *= mod[k] ?? 1;
  }

  // Each match is struck out of the text before the next group is tried. Left
  // in, "a bushy tail" matches the bushy-tail group and then the plain tail
  // group inside its own words, and the fox comes out with two tails.
  let rest = text;
  const attach = [...(subject.s.attach ?? [])];
  const added: string[] = [];
  for (const [words, id, label] of ACCESSORIES) {
    const hit = findPhrase(rest, words);
    // Only after the subject: a word inside the subject's own name is not an
    // accessory it is wearing.
    if (!hit || hit.at < subject.at) continue;
    rest = rest.slice(0, hit.at) + ' '.repeat(hit.phrase.length) + rest.slice(hit.at + hit.phrase.length);
    if (!attach.includes(id)) { attach.push(id); added.push(label); }
  }

  // A mount needs both a cue and a noun after it, so "a rocket" as the subject
  // is never also the thing the subject stands on.
  let mountId: string | undefined, mountLabel = '';
  const cue = MOUNT_CUES.exec(text);
  if (cue) {
    const tail = text.slice(cue.index);
    for (const [words, id, label] of MOUNTS) {
      const hit = findPhrase(tail, words);
      if (!hit) continue;
      if (subject.at >= cue.index) continue;
      mountId = id; mountLabel = label; break;
    }
  }

  const bits = [adjectives.length ? `${adjectives[0]} ${subject.s.name.toLowerCase()}` : subject.s.name];
  if (added.length) bits.push(`with ${added.join(', ')}`);
  if (mountLabel) bits.push(`on ${mountLabel}`);
  return { plan: subject.s.plan, shape, attach, mount: mountId, label: bits.join(' ') };
}

/**
 * Compose straight from a prompt. Null when nothing was recognised.
 */
export function sculpt(prompt: string): { sdf: Sdf; recipe: Recipe } | null {
  const recipe = parsePrompt(prompt);
  return recipe ? { sdf: composeRecipe(recipe), recipe } : null;
}

/**
 * The row of one-click examples.
 *
 * Chosen to advertise the grammar rather than to be a menu: half of them are
 * combinations no library could hold, so it is obvious the prompt box is doing
 * more than picking from a list. Every body plan appears at least once.
 */
export const EXAMPLES: string[] = [
  'a cat in a wizard hat',
  'a dragon with a crown riding a rocket',
  'an owl with a top hat',
  'a robot with a jetpack',
  'a chubby penguin with a scarf',
  'a knight with a sword on a pedestal',
  'a fox with a bushy tail',
  'a whale on a wave',
  'a tall pine tree',
  'a mushroom',
  'a castle',
  'a lighthouse',
  'a skyscraper',
  'a rocket',
  'a plane',
  'a boat',
  'a car on a hill',
  'a bear with a cape',
  'a rabbit with long ears',
  'a giraffe',
  'a turtle with a shell',
  'a flower',
  'a house',
  'a dog on a skateboard',
  'a wizard with a staff',
  'a tiny astronaut',
  'a monster with horns',
  'a shark',
];
