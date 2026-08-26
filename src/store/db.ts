import Dexie, { type Table } from "dexie";
import type { Sign, Exemplar } from "@/content/schema";
import type { Component } from "@/score/types";

/**
 * On-device store (Part 6.2). PURE of React and DOM — persistence goes through
 * Dexie, which is the only bridge to IndexedDB the app layers may cross.
 *
 * Everything here is local to the device. There is no upload path, not even a
 * disabled one (Part 7 §11). Video is never stored — only derived NormFrame
 * landmarks, which cannot reconstruct an image.
 */

/** Per-sign learning progress. Additive only — counts up, never down (Part 2 §3). */
export type SignProgress = {
  signId: string;
  attempts: number;
  bestComponents: Partial<Record<Component, number>>;
  learned: boolean; // has moved into "your home signs"
  lastPractisedMs: number | null;
};

class AanganDB extends Dexie {
  signs!: Table<Sign, string>;
  exemplars!: Table<Exemplar, string>;
  progress!: Table<SignProgress, string>;

  constructor() {
    super("aangan");
    this.version(1).stores({
      // Only the indexed keys are listed; full objects are stored regardless.
      signs: "id, unit, language, region",
      exemplars: "id, signId, signerId",
      progress: "signId, learned, lastPractisedMs",
    });
  }
}

export const db = new AanganDB();
