import type { RawFrame, Attempt } from "@/landmarks/types";
import { buildAttempt } from "@/landmarks/attempt";
import { createLandmarkers, detect, closeLandmarkers, type Landmarkers } from "@/vision/landmarker";

/**
 * Extract keypoints from an uploaded reference video, entirely in the browser.
 *
 * This is the whole "training" step. Aangan matches signs with DTW against
 * recorded exemplars (Part 6.1) — there is no model to fit, so a sign becomes
 * practiceable the moment its keypoints exist. Because extraction runs here,
 * the video itself never has to leave the admin's machine; only the small
 * keypoint pack is published.
 */

export type ExtractProgress = {
  /** 0..1 through the current clip. */
  ratio: number;
  frames: number;
};

/** Step the video deterministically rather than playing it, so extraction is
 *  reproducible and faster than realtime. */
function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error("seek failed"));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = t;
  });
}

function loadVideo(file: File): Promise<{ video: HTMLVideoElement; revoke: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true; // no audio anywhere in this product
    video.playsInline = true;
    video.src = url;
    const revoke = () => URL.revokeObjectURL(url);
    video.onloadedmetadata = () => resolve({ video, revoke });
    video.onerror = () => {
      revoke();
      reject(new Error(`Could not read ${file.name}. Is it a video file?`));
    };
  });
}

/** A landmarker pair is expensive to build; share one across a whole batch. */
export async function openExtractor(): Promise<Landmarkers> {
  return createLandmarkers();
}
export function closeExtractor(l: Landmarkers): void {
  closeLandmarkers(l);
}

/**
 * One video → one Attempt (64 normalized frames + tracking quality), run through
 * the exact same pipeline as the live camera, so a reference and a parent's
 * attempt are always in the same representation.
 */
export async function extractAttempt(
  file: File,
  landmarkers: Landmarkers,
  fps = 25,
  onProgress?: (p: ExtractProgress) => void,
): Promise<Attempt> {
  const { video, revoke } = await loadVideo(file);
  try {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration <= 0) throw new Error(`${file.name} has no readable duration.`);

    const step = 1 / fps;
    const raw: RawFrame[] = [];
    let tMs = 0;

    for (let t = 0; t < duration; t += step) {
      await seekTo(video, t);
      // MediaPipe requires strictly increasing timestamps.
      tMs += Math.round(step * 1000);
      raw.push(detect(landmarkers, video, tMs));
      onProgress?.({ ratio: Math.min(1, t / duration), frames: raw.length });
    }

    if (raw.length === 0) throw new Error(`No frames read from ${file.name}.`);
    return buildAttempt(raw);
  } finally {
    revoke();
  }
}
