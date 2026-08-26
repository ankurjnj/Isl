import type { Attempt } from "@/landmarks/types";
import type { SignReference } from "@/content/schema";

/**
 * The recognizer boundary (Part 6 slice v0.4). The DTW engine lives behind this
 * so a trained model can replace it later without touching anything else — it
 * degrades past ~50 signs and the POC targets 20 (Part 6.1).
 */
export interface SignRecognizer {
  readonly engine: string; // "dtw-v1" | "cnn-v1"
  load(signs: SignReference[]): Promise<void>;
  recognize(attempt: Attempt): Promise<RecognitionResult>;
}

export type Candidate = {
  signId: string;
  distance: number;
  confidence: number; // 0–1, for display only; never shown as a percentage
};

export type RecognitionResult = {
  candidates: Candidate[];
  /** null when nothing is close enough — the honest failure mode (Part 6.1). */
  best: string | null;
  /** true when the top two are too close to call (Part 7 §7 → say so, don't grade). */
  ambiguous: boolean;
};
