import type { Attempt } from "@/landmarks/types";
import type { SignReference } from "@/content/schema";
import { REJECT_THRESHOLD, AMBIGUOUS_MARGIN } from "@/config/thresholds";
import { clipFeatures } from "./features";
import { dtw } from "./dtw";
import type { SignRecognizer, RecognitionResult, Candidate } from "./types";

/**
 * Exemplar-matching recognizer (Part 6.1). PURE.
 *
 * No trained model: match an attempt against 3–5 recorded reference takes per
 * sign with DTW; the DTW distance IS the score. A sign is practiceable the
 * moment it's recorded. Compare only against the active unit's signs, not the
 * whole vocabulary (set by `load`).
 */

type PreparedSign = {
  signId: string;
  symmetric: boolean;
  /** One feature matrix per exemplar take. */
  takes: Float32Array[][];
};

export function median(xs: number[]): number {
  if (xs.length === 0) return Number.POSITIVE_INFINITY;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export class DtwRecognizer implements SignRecognizer {
  readonly engine = "dtw-v1";
  private signs: PreparedSign[] = [];

  async load(refs: SignReference[]): Promise<void> {
    this.signs = refs.map((ref) => ({
      signId: ref.sign.id,
      symmetric: ref.sign.handedness === "symmetric",
      // Only usable exemplars should ever reach here (store filters them), but
      // guard anyway — a bad exemplar poisons every comparison.
      takes: ref.exemplars
        .filter((e) => e.quality.usable)
        .map((e) => clipFeatures(e.frames)),
    })).filter((s) => s.takes.length > 0);
  }

  async recognize(attempt: Attempt): Promise<RecognitionResult> {
    const a = clipFeatures(attempt.frames);
    // For symmetric signs, either hand-assignment is acceptable: also prepare a
    // mirrored attempt and take whichever matches better.
    const aSwapped = clipFeatures(attempt.frames, true);

    const candidates: Candidate[] = this.signs.map((sign) => {
      const perTake = sign.takes.map((take) => {
        const d = dtw(a, take).distance;
        if (!sign.symmetric) return d;
        return Math.min(d, dtw(aSwapped, take).distance);
      });
      // Per-sign distance = MEDIAN across takes, not min: min lets one lucky
      // exemplar dominate (Part 6 v0.4).
      const distance = median(perTake);
      const confidence = Math.max(0, Math.min(1, 1 - distance / REJECT_THRESHOLD));
      return { signId: sign.signId, distance, confidence };
    });

    candidates.sort((x, y) => x.distance - y.distance);

    const d1 = candidates[0]?.distance ?? Number.POSITIVE_INFINITY;
    const d2 = candidates[1]?.distance ?? Number.POSITIVE_INFINITY;

    const best = d1 <= REJECT_THRESHOLD ? candidates[0]!.signId : null;
    const ambiguous =
      best !== null &&
      Number.isFinite(d2) &&
      d1 > 0 &&
      (d2 - d1) / d1 < AMBIGUOUS_MARGIN;

    return { candidates, best, ambiguous };
  }
}
