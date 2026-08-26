import type { RawFrame, Attempt } from "./types";
import { smoothHandIdentity } from "./smooth";
import { normalizeFrames } from "./normalize";
import { resample } from "./resample";
import { trackingQuality } from "./quality";
import { ATTEMPT_FRAMES } from "@/config/thresholds";

/**
 * The full capture pipeline (Part 6.4). PURE.
 *
 *   raw frames → hand-identity smoothing → normalization → resample to 64
 *              → tracking quality
 *
 * Used identically for a learner's attempt and for a Studio exemplar take, so
 * they are always compared in the same representation.
 */
export function buildAttempt(rawFrames: RawFrame[]): Attempt {
  if (rawFrames.length === 0) {
    return {
      frames: [],
      durationMs: 0,
      quality: trackingQuality([]),
    };
  }
  const quality = trackingQuality(rawFrames);
  const smoothed = smoothHandIdentity(rawFrames);
  const normalized = normalizeFrames(smoothed);
  const frames = resample(normalized, ATTEMPT_FRAMES);
  const first = rawFrames[0]!;
  const last = rawFrames[rawFrames.length - 1]!;
  return {
    frames,
    durationMs: last.tMs - first.tMs,
    quality,
  };
}
