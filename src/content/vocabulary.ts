/**
 * The first 20 signs to record — the vocabulary PLAN (Part 5.1).
 *
 * IMPORTANT: this is a list of WORDS to be recorded, ordered by what a parent
 * needs tonight — NOT a list of signs. It contains English/Hindi labels and
 * unit grouping only. It contains no description of how any sign is performed,
 * and none may be added here (Part 5.2, Part 7 §1).
 *
 * A real `Sign` (content/schema.ts) comes into existence only once a Deaf ISL
 * signer has recorded exemplars for it in Studio mode. Until then the shipped
 * vocabulary is empty and this list is what Studio shows as "still to record".
 */

export type VocabItem = {
  /** Canonical id once recorded, e.g. "isl.milk". */
  id: string;
  english: string;
  hindi: string;
  unit: string;
};

export const UNITS = [
  "Right now",
  "Your body",
  "Us",
  "Answers",
] as const;

export const VOCABULARY: VocabItem[] = [
  // Unit 1 — Right now
  { id: "isl.eat", english: "eat", hindi: "खाना", unit: "Right now" },
  { id: "isl.milk", english: "milk", hindi: "दूध", unit: "Right now" },
  { id: "isl.water", english: "water", hindi: "पानी", unit: "Right now" },
  { id: "isl.more", english: "more", hindi: "और", unit: "Right now" },
  { id: "isl.finished", english: "finished", hindi: "हो गया", unit: "Right now" },

  // Unit 2 — Your body
  { id: "isl.sleep", english: "sleep", hindi: "सोना", unit: "Your body" },
  { id: "isl.bath", english: "bath", hindi: "नहाना", unit: "Your body" },
  { id: "isl.toilet", english: "toilet", hindi: "शौचालय", unit: "Your body" },
  // `hurt` is in the first ten deliberately: a child who cannot say where it
  // hurts is the situation parents describe as the worst part (Part 5.1).
  { id: "isl.hurt", english: "hurt", hindi: "दर्द", unit: "Your body" },
  { id: "isl.help", english: "help", hindi: "मदद", unit: "Your body" },

  // Unit 3 — Us
  { id: "isl.mother", english: "mother", hindi: "माँ", unit: "Us" },
  { id: "isl.father", english: "father", hindi: "पिता", unit: "Us" },
  { id: "isl.love", english: "love", hindi: "प्यार", unit: "Us" },
  { id: "isl.good", english: "good", hindi: "अच्छा", unit: "Us" },
  { id: "isl.play", english: "play", hindi: "खेलना", unit: "Us" },

  // Unit 4 — Answers
  { id: "isl.yes", english: "yes", hindi: "हाँ", unit: "Answers" },
  { id: "isl.no", english: "no", hindi: "नहीं", unit: "Answers" },
  { id: "isl.come", english: "come", hindi: "आओ", unit: "Answers" },
  { id: "isl.wait", english: "wait", hindi: "रुको", unit: "Answers" },
  { id: "isl.careful", english: "careful", hindi: "सावधान", unit: "Answers" },
];
