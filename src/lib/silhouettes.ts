export interface Silhouette {
  id: string;
  name: string;
  /** SVG path in a 0..100 box, y down. Even-odd fill: inner contours are holes. */
  d: string;
  /** Lowercase words that should select this shape. */
  keywords: string[];
}

/**
 * Each shape is authored as a single closed contour wherever possible.
 * Detached contours print as loose pieces until they are welded, so a
 * connected outline is preferred even when it costs a little fidelity.
 */
export const SILHOUETTES: Silhouette[] = [
  {
    id: 'heart', name: 'Heart',
    keywords: ['heart', 'love', 'valentine', 'romance', 'wedding'],
    d: 'M50 90 C18 66 4 48 4 32 C4 16 17 6 31 6 C40 6 47 11 50 19 C53 11 60 6 69 6 C83 6 96 16 96 32 C96 48 82 66 50 90 Z',
  },
  {
    id: 'star', name: 'Star',
    keywords: ['star', 'rating', 'favourite', 'favorite', 'night', 'space'],
    d: 'M50 4 L61 35 L94 36 L68 56 L77 88 L50 69 L23 88 L32 56 L6 36 L39 35 Z',
  },
  {
    id: 'cat', name: 'Cat',
    keywords: ['cat', 'kitten', 'kitty', 'feline', 'pet'],
    d: 'M22 34 L26 4 L39 28 C46 25 54 25 61 28 L74 4 L78 34 C85 42 85 52 77 58 C89 66 95 80 93 95 L7 95 C5 80 11 66 23 58 C15 52 15 42 22 34 Z',
  },
  {
    id: 'rabbit', name: 'Rabbit',
    keywords: ['rabbit', 'bunny', 'hare', 'easter'],
    d: 'M50 38 C59 38 67 47 69 57 C75 64 78 79 74 94 L26 94 C22 79 25 64 31 57 C33 47 41 38 50 38 Z M41 41 C34 29 31 9 38 4 C45 0 49 17 47 39 Z M59 41 C66 29 69 9 62 4 C55 0 51 17 53 39 Z',
  },
  {
    id: 'bird', name: 'Bird',
    keywords: ['bird', 'sparrow', 'flying', 'wing', 'dove', 'fly'],
    d: 'M8 48 C20 39 34 36 47 41 L59 19 C64 10 73 8 79 13 L74 26 L90 21 L80 37 C85 48 82 61 73 69 C60 82 38 84 24 75 C15 70 9 59 8 48 Z',
  },
  {
    id: 'tree', name: 'Tree',
    keywords: ['tree', 'forest', 'oak', 'nature', 'plant', 'wood'],
    d: 'M43 95 L43 65 C29 65 19 55 21 43 C12 37 13 24 22 19 C26 6 43 1 53 8 C65 1 79 10 78 22 C89 30 87 47 74 52 C74 62 64 68 57 65 L57 95 Z',
  },
  {
    id: 'rocket', name: 'Rocket',
    keywords: ['rocket', 'space', 'launch', 'startup', 'ship', 'moon', 'nasa'],
    d: 'M50 3 C63 16 69 34 69 51 L69 66 L82 83 L82 95 L63 86 L37 86 L18 95 L18 83 L31 66 L31 51 C31 34 37 16 50 3 Z',
  },
  {
    id: 'mountain', name: 'Mountains',
    keywords: ['mountain', 'peak', 'alps', 'hill', 'landscape', 'range', 'hike'],
    d: 'M3 90 L30 34 L45 60 L59 26 L97 90 Z',
  },
  {
    id: 'fish', name: 'Fish',
    keywords: ['fish', 'sea', 'ocean', 'aquarium', 'salmon', 'swim'],
    d: 'M6 50 C19 29 44 22 63 31 L80 14 L80 39 C88 43 92 48 94 50 C92 52 88 57 80 61 L80 86 L63 69 C44 78 19 71 6 50 Z',
  },
  {
    id: 'house', name: 'House',
    keywords: ['house', 'home', 'building', 'property', 'real estate', 'roof'],
    d: 'M50 6 L95 44 L84 44 L84 94 L16 94 L16 44 L5 44 Z',
  },
  {
    id: 'skull', name: 'Skull',
    keywords: ['skull', 'bone', 'halloween', 'pirate', 'skeleton', 'death'],
    d: 'M50 5 C75 5 89 22 89 43 C89 55 83 63 77 69 L77 83 C77 90 71 94 62 94 L38 94 C29 94 23 90 23 83 L23 69 C17 63 11 55 11 43 C11 22 25 5 50 5 Z M31 39 C31 50 38 54 43 49 C48 44 43 33 36 33 C32 33 31 36 31 39 Z M69 39 C69 50 62 54 57 49 C52 44 57 33 64 33 C68 33 69 36 69 39 Z',
  },
  {
    id: 'dino', name: 'Dinosaur',
    keywords: ['dinosaur', 'dino', 'trex', 't-rex', 'rex', 'jurassic', 'lizard'],
    d: 'M2 60 C12 54 24 52 34 54 C34 40 42 30 55 28 C57 16 67 8 78 10 C89 12 95 22 92 32 C97 35 98 42 93 44 L80 44 C79 54 74 61 66 65 L70 93 L57 93 L53 71 L40 71 L36 93 L23 93 L27 64 C17 66 7 66 2 60 Z',
  },
  {
    id: 'butterfly', name: 'Butterfly',
    keywords: ['butterfly', 'moth', 'insect', 'wings', 'spring'],
    d: 'M50 30 C44 13 25 4 14 13 C3 22 8 41 25 47 C8 53 3 72 14 81 C25 90 44 81 50 63 C56 81 75 90 86 81 C97 72 92 53 75 47 C92 41 97 22 86 13 C75 4 56 13 50 30 Z',
  },
  {
    id: 'ghost', name: 'Ghost',
    keywords: ['ghost', 'spooky', 'halloween', 'boo', 'spirit'],
    d: 'M17 94 L17 40 C17 19 32 6 50 6 C68 6 83 19 83 40 L83 94 L70 83 L58 94 L45 83 L33 94 L22 83 Z',
  },
  {
    id: 'crown', name: 'Crown',
    keywords: ['crown', 'king', 'queen', 'royal', 'premium', 'vip', 'winner'],
    d: 'M6 88 L13 22 L32 45 L50 8 L68 45 L87 22 L94 88 Z',
  },
  {
    id: 'cactus', name: 'Cactus',
    keywords: ['cactus', 'desert', 'succulent', 'plant', 'southwest'],
    d: 'M44 94 L44 64 L28 64 C19 64 13 57 13 48 L13 37 C13 30 22 30 22 37 L22 47 C22 53 24 56 30 56 L44 56 L44 25 C44 16 48 12 52 12 C56 12 60 16 60 25 L60 45 L74 45 C80 45 82 42 82 36 L82 27 C82 20 91 20 91 27 L91 39 C91 48 85 54 76 54 L60 54 L60 94 Z',
  },
  {
    id: 'bulb', name: 'Light bulb',
    keywords: ['bulb', 'lightbulb', 'idea', 'light', 'lamp', 'innovation', 'invention'],
    d: 'M50 5 C69 5 83 20 83 37 C83 49 75 57 69 65 L69 77 C69 81 67 83 63 83 L63 87 C63 91 60 95 56 95 L44 95 C40 95 37 91 37 87 L37 83 C33 83 31 81 31 77 L31 65 C25 57 17 49 17 37 C17 20 31 5 50 5 Z',
  },
  {
    id: 'coffee', name: 'Coffee cup',
    keywords: ['coffee', 'cup', 'mug', 'cafe', 'tea', 'espresso', 'latte'],
    d: 'M12 26 L70 26 L69 40 C84 40 93 47 93 57 C93 68 84 75 69 75 L67 84 C66 90 61 94 55 94 L29 94 C23 94 18 90 17 84 Z M70 49 L69 66 C78 66 84 62 84 57 C84 52 78 49 70 49 Z',
  },
  {
    id: 'anchor', name: 'Anchor',
    keywords: ['anchor', 'nautical', 'boat', 'marine', 'sailor', 'ship'],
    d: 'M50 4 C57 4 62 10 62 17 C62 22 59 26 55 28 L55 34 L71 34 L71 44 L55 44 L55 78 C68 76 77 66 79 53 L70 53 L86 34 L98 53 L89 53 C86 76 70 92 50 92 C30 92 14 76 11 53 L2 53 L18 34 L34 53 L25 53 C27 66 36 76 45 78 L45 44 L29 44 L29 34 L45 34 L45 28 C41 26 38 22 38 17 C38 10 43 4 50 4 Z M50 13 C48 13 47 15 47 17 C47 19 48 21 50 21 C52 21 53 19 53 17 C53 15 52 13 50 13 Z',
  },
  {
    id: 'dog', name: 'Dog',
    keywords: ['dog', 'puppy', 'hound', 'canine', 'pet', 'labrador'],
    d: 'M8 30 L8 12 L19 20 L31 17 C34 9 44 5 52 9 C58 12 61 18 60 25 L60 30 C74 31 86 36 92 44 L92 62 C92 68 88 72 82 72 L82 88 L70 88 L70 72 L44 72 L44 88 L32 88 L32 70 C22 66 14 56 12 44 L8 30 Z',
  },
  {
    id: 'whale', name: 'Whale',
    keywords: ['whale', 'ocean', 'sea', 'orca', 'blue whale', 'marine'],
    d: 'M2 52 C2 34 20 22 44 22 C62 22 76 30 84 42 L96 30 C99 27 100 30 99 34 L96 52 L99 70 C100 74 99 77 96 74 L84 62 C76 74 62 82 44 82 C20 82 2 70 2 52 Z',
  },
  {
    id: 'guitar', name: 'Guitar',
    keywords: ['guitar', 'music', 'band', 'rock', 'instrument', 'acoustic'],
    d: 'M46 2 L54 2 L54 40 C66 42 74 52 74 64 C74 80 63 94 50 94 C37 94 26 80 26 64 C26 52 34 42 46 40 Z M50 52 C44 52 40 57 40 63 C40 69 44 74 50 74 C56 74 60 69 60 63 C60 57 56 52 50 52 Z',
  },
  {
    id: 'robot', name: 'Robot',
    keywords: ['robot', 'ai', 'bot', 'android', 'machine', 'tech'],
    d: 'M47 2 L53 2 L53 12 L70 12 C77 12 82 17 82 24 L82 44 C82 51 77 56 70 56 L62 56 L62 66 L78 66 C85 66 90 71 90 78 L90 94 L78 94 L78 78 L62 78 L62 94 L38 94 L38 78 L22 78 L22 94 L10 94 L10 78 C10 71 15 66 22 66 L38 66 L38 56 L30 56 C23 56 18 51 18 44 L18 24 C18 17 23 12 30 12 L47 12 Z M32 26 C29 26 27 29 27 33 C27 37 29 40 32 40 C35 40 37 37 37 33 C37 29 35 26 32 26 Z M68 26 C65 26 63 29 63 33 C63 37 65 40 68 40 C71 40 73 37 73 33 C73 29 71 26 68 26 Z',
  },
  {
    id: 'mushroom', name: 'Mushroom',
    keywords: ['mushroom', 'fungus', 'toadstool', 'forest', 'shroom'],
    d: 'M50 6 C74 6 93 26 93 44 C93 50 89 53 82 53 L62 53 L62 82 C62 90 57 95 50 95 C43 95 38 90 38 82 L38 53 L18 53 C11 53 7 50 7 44 C7 26 26 6 50 6 Z',
  },
  {
    id: 'wave', name: 'Wave',
    keywords: ['wave', 'surf', 'water', 'tide', 'sea', 'beach'],
    d: 'M2 88 C2 60 18 36 44 30 C62 26 76 32 84 42 L96 30 L96 60 C96 76 84 88 66 88 Z',
  },
  {
    id: 'flame', name: 'Flame',
    keywords: ['flame', 'fire', 'burn', 'hot', 'torch', 'candle'],
    d: 'M52 2 C56 20 72 28 78 44 C86 64 74 94 50 94 C28 94 14 74 20 54 C24 42 32 38 36 30 C38 40 44 44 48 42 C44 30 44 14 52 2 Z',
  },
];

const BY_ID = new Map(SILHOUETTES.map((s) => [s.id, s]));

export function getSilhouette(id: string): Silhouette | undefined {
  return BY_ID.get(id);
}

/**
 * Pick the shape that best matches a free-text prompt.
 *
 * Scoring favours whole-word matches over substrings so that "startup rocket"
 * does not lose to a shape whose keyword merely appears inside another word.
 * Returns null when nothing matches, so the caller can fall back rather than
 * silently producing an unrelated shape.
 */
export function matchSilhouette(prompt: string): { silhouette: Silhouette; score: number } | null {
  const text = prompt.toLowerCase();
  const words = new Set(text.split(/[^a-z0-9]+/).filter(Boolean));
  let best: { silhouette: Silhouette; score: number } | null = null;

  for (const s of SILHOUETTES) {
    let score = 0;
    for (const kw of s.keywords) {
      if (words.has(kw)) score += 10;
      else if (kw.includes(' ') && text.includes(kw)) score += 8;
      else if (text.includes(kw)) score += 3;
    }
    if (words.has(s.id)) score += 6;
    if (score > 0 && (!best || score > best.score)) best = { silhouette: s, score };
  }
  return best;
}
