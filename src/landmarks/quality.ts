import type { RawFrame, Landmark, TrackingQuality } from "./types";
import { QUALITY_MIN_CONFIDENCE, QUALITY_MAX_DROPPED_RATIO } from "@/config/thresholds";

/**
 * Tracking quality (Part 6.4). PURE. Everything downstream gates on
 * quality.usable — a confident wrong grade is the worst thing the app can do
 * (Part 7 §7). When in doubt, this returns not-usable.
 */

function handConfidence(hand: Landmark[] | null): number | null {
  if (!hand || hand.length === 0) return null;
  let sum = 0;
  let seen = 0;
  for (const lm of hand) {
    // MediaPipe hands may omit visibility; a present hand counts as confident.
    sum += lm.visibility ?? 1;
    seen++;
  }
  return seen > 0 ? sum / seen : null;
}

export function trackingQuality(frames: RawFrame[]): TrackingQuality {
  const total = frames.length;
  if (total === 0) {
    return {
      meanHandConfidence: 0,
      framesDropped: 0,
      bothHandsSeenRatio: 0,
      usable: false,
    };
  }

  let confSum = 0;
  let confFrames = 0;
  let dropped = 0;
  let both = 0;

  for (const f of frames) {
    const l = handConfidence(f.hands.left);
    const r = handConfidence(f.hands.right);
    if (l === null && r === null) {
      dropped++;
      continue;
    }
    if (l !== null && r !== null) both++;
    const vals = [l, r].filter((x): x is number => x !== null);
    confSum += vals.reduce((a, b) => a + b, 0) / vals.length;
    confFrames++;
  }

  const meanHandConfidence = confFrames > 0 ? confSum / confFrames : 0;
  const droppedRatio = dropped / total;
  const usable =
    confFrames > 0 &&
    meanHandConfidence >= QUALITY_MIN_CONFIDENCE &&
    droppedRatio <= QUALITY_MAX_DROPPED_RATIO;

  return {
    meanHandConfidence,
    framesDropped: dropped,
    bothHandsSeenRatio: both / total,
    usable,
  };
}
