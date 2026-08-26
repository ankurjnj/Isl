import type { Handedness, NormFrame, TrackingQuality } from "@/landmarks/types";
import type { Component } from "@/score/types";

/**
 * A sign in the vocabulary (Part 5.3). PURE.
 *
 * Note what is NOT here: any description of how the sign is performed. This
 * document (and this codebase) contains no sign-form descriptions and must not
 * generate any — an invented sign taught confidently is the exact harm this
 * product exists to prevent (Part 5.2, Part 7 §1). Form lives only in recorded
 * `exemplars`, sourced from a Deaf ISL signer.
 */
export type Sign = {
  id: string; // "isl.milk"
  language: "isl" | "asl";
  english: string;
  hindi: string;
  region: string; // "Delhi", "Tamil Nadu" — always shown in the UI (Part 5.2)
  variantOf?: string;
  handedness: Handedness;

  videoUrl: string;
  slowMoUrl?: string;
  angle2Url?: string;

  /** IDs into the exemplar store. The recorded reference takes. */
  exemplars: string[];

  /** Per-component acceptance tolerances, set by a Deaf reviewer. */
  tolerances: Record<Component, number>;

  /**
   * Feedback authored PER SIGN by a Deaf reviewer, never templated (Part 5.3).
   * Generic templates ("check your handshape") are useless and often wrong.
   */
  feedback: Record<Component, { en: string; hi: string }>;

  signer: { name: string; credit: string };
  unit: string;
  /** Absent for Studio-recorded signs, which are Deaf-recorded by definition. */
  provenance?: Provenance;
};

/**
 * Where a sign form came from. Part 5.2 allows exactly two origins: a Deaf ISL
 * signer recording in Studio, or the ISLRTC / indiansignlanguage.org
 * dictionaries verified by a Deaf signer. Published ISL research corpora
 * (signed by Deaf adults) are the same second category. Nothing else is a
 * legitimate origin, and nothing is ever synthesised.
 */
export type Provenance = {
  /** "studio" | dataset or dictionary name, e.g. "INCLUDE" / "ISLRTC". */
  origin: string;
  /** Where it came from, for the credit line and for checking later. */
  url?: string;
  /** Licence / terms the source was published under. */
  license?: string;
  /**
   * Has a Deaf signer confirmed this form is right? Imported data starts
   * "unreviewed" and the UI says so — an unreviewed form is never presented as
   * settled ISL.
   */
  review: "unreviewed" | "deaf_reviewed";
};

/** A recorded reference take, resampled to ATTEMPT_FRAMES (Part 6.4 / v0.3). */
export type Exemplar = {
  id: string;
  signId: string;
  frames: NormFrame[];
  quality: TrackingQuality;
  signerId: string;
  /** Absent on takes recorded in Studio before provenance existed. */
  provenance?: Provenance;
  consent: {
    granted: true;
    scope: "prototype" | "training";
    date: string; // ISO
  };
};

/** What the recognizer is loaded with: a sign plus its (usable) exemplars. */
export type SignReference = {
  sign: Sign;
  exemplars: Exemplar[];
};
