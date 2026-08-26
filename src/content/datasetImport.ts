import type { Handedness, RawFrame, Landmark } from "@/landmarks/types";
import { buildAttempt } from "@/landmarks/attempt";
import type { Sign, Exemplar, Provenance } from "./schema";

/**
 * Import raw MediaPipe keypoints from a published ISL corpus.
 *
 * WHY THIS EXISTS: sign forms may only come from a Deaf signer or a verified
 * dictionary (Part 5.2, Part 7 §1) — this app never synthesises one. Open ISL
 * research corpora (INCLUDE / OpenHands / iSign) publish exactly what is needed:
 * MediaPipe keypoint sequences of isolated ISL words, performed by Deaf adult
 * signers. They are already in this app's representation, so they can be
 * imported without anybody inventing anything.
 *
 * Everything imported is marked `review: "unreviewed"` until a Deaf signer
 * confirms it, and the UI says so. See CONTENT_SOURCES.md.
 *
 * PURE — no React, no DOM.
 */

/** One frame of raw keypoints. Each point is [x, y, z] in MediaPipe's
 *  image-normalized space (0..1). A missing hand is null. */
export type KeypointFrame = {
  /** Milliseconds. Defaults to 30fps spacing when absent. */
  tMs?: number;
  hands: { left: number[][] | null; right: number[][] | null };
  /** MediaPipe's 33 pose landmarks. Indices 11–14 (shoulders, elbows) are
   *  required — normalization builds its frame from the shoulders. */
  pose: number[][] | null;
};

export type KeypointSign = {
  id: string; // "isl.milk"
  english: string;
  hindi: string;
  /** ISL varies substantially by region; every sign carries its tag (Part 5.2). */
  region: string;
  handedness: Handedness;
  /** The corpus's signer identifier, so takes stay attributable and so training
   *  and evaluation can be split by signer later (Part 7 §12). */
  signerId: string;
  /** Human-readable credit for the signer, when the corpus gives one. */
  signerName?: string;
  unit?: string;
  takes: { frames: KeypointFrame[] }[];
};

export type KeypointFile = {
  version: 1;
  language: "isl" | "asl";
  /** Provenance applied to every sign in the file. */
  source: {
    origin: string; // "INCLUDE", "OpenHands", "ISLRTC", …
    url?: string;
    license?: string;
  };
  signs: KeypointSign[];
};

export type ImportedSign = { sign: Sign; exemplars: Exemplar[] };

const FPS_MS = 1000 / 30;

function toLandmarks(pts: number[][] | null): Landmark[] | null {
  if (!pts || pts.length === 0) return null;
  return pts.map((p) => ({ x: p[0] ?? 0, y: p[1] ?? 0, z: p[2] ?? 0 }));
}

function toRawFrames(frames: KeypointFrame[]): RawFrame[] {
  return frames.map((f, i) => ({
    tMs: f.tMs ?? Math.round(i * FPS_MS),
    hands: { left: toLandmarks(f.hands.left), right: toLandmarks(f.hands.right) },
    pose: toLandmarks(f.pose),
  }));
}

/**
 * Convert a keypoint file into signs + exemplars, running the SAME pipeline the
 * camera uses (hand-identity smoothing → normalization → resample to 64 →
 * tracking quality). That is what makes an imported reference directly
 * comparable to a parent's attempt.
 *
 * Takes whose tracking quality is unusable are dropped: a bad exemplar poisons
 * every future comparison.
 */
export function importKeypointFile(file: KeypointFile): {
  signs: ImportedSign[];
  droppedTakes: number;
} {
  const provenance: Provenance = {
    origin: file.source.origin,
    url: file.source.url,
    license: file.source.license,
    review: "unreviewed",
  };
  const date = new Date().toISOString();
  const empty = { en: "", hi: "" };

  const signs: ImportedSign[] = [];
  let droppedTakes = 0;

  for (const ks of file.signs) {
    const exemplars: Exemplar[] = [];

    ks.takes.forEach((take, n) => {
      const attempt = buildAttempt(toRawFrames(take.frames));
      if (attempt.frames.length === 0 || !attempt.quality.usable) {
        droppedTakes++;
        return;
      }
      exemplars.push({
        id: `${ks.id}.${file.source.origin}.${ks.signerId}.${n}`,
        signId: ks.id,
        frames: attempt.frames,
        quality: attempt.quality,
        signerId: ks.signerId,
        provenance,
        // The corpus's published licence is the basis for use here, recorded
        // so it travels with the data rather than being reconstructed later.
        consent: { granted: true, scope: "prototype", date },
      });
    });

    if (exemplars.length === 0) continue;

    signs.push({
      sign: {
        id: ks.id,
        language: file.language,
        english: ks.english,
        hindi: ks.hindi,
        region: ks.region,
        handedness: ks.handedness,
        videoUrl: "",
        exemplars: exemplars.map((e) => e.id),
        tolerances: { handshape: 0.7, location: 0.7, movement: 0.7, orientation: 0.7 },
        // Feedback copy stays empty: it is authored per sign by a Deaf reviewer
        // (Part 5.3) and is never templated or generated.
        feedback: {
          handshape: empty,
          location: empty,
          movement: empty,
          orientation: empty,
        },
        signer: {
          name: ks.signerName ?? ks.signerId,
          credit: `${ks.signerName ?? ks.signerId} · ${file.source.origin}`,
        },
        unit: ks.unit ?? "Right now",
        provenance,
      },
      exemplars,
    });
  }

  return { signs, droppedTakes };
}
