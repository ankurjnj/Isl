import type { NormFrame, Attempt } from "@/landmarks/types";
import { LEFT, RIGHT } from "@/landmarks/types";
import type { Exemplar } from "@/content/schema";
import { clipFeatures } from "@/recognize/features";
import { dtw } from "@/recognize/dtw";
import type { Component } from "./types";
import {
  KEYFRAMES,
  OVERALL_MIN_WEIGHT,
  HANDSHAPE_COS_SCALE,
  LOCATION_SW_SCALE,
  MOVEMENT_SCALE,
  ORIENTATION_RAD_SCALE,
} from "@/config/thresholds";

/**
 * Component scoring (Part 6 slice v0.5). PURE.
 *
 * Four independent 0–1 scores against the matched sign's nearest exemplar. The
 * DTW alignment path pairs frames, so signing at a different tempo is not
 * penalised (comparing frame i to frame i would be). The overall combine uses
 * a min term so one badly-wrong component can't hide behind three good ones —
 * that is how learners internalise errors.
 */

export type ComponentScores = Record<Component, number> & { overall: number };

const clampScore = (distance: number, scale: number): number =>
  Math.max(0, Math.min(1, 1 - distance / scale));

/** Mean centroid of the present hands, in shoulder-relative (global) space. */
function centroid(frame: NormFrame): [number, number, number] | null {
  let n = 0;
  const c: [number, number, number] = [0, 0, 0];
  for (const slot of [LEFT, RIGHT] as const) {
    if (!frame.present[slot]) continue;
    const g = frame.handsGlobal[slot];
    // Mean over the 21 landmarks of this hand.
    let sx = 0,
      sy = 0,
      sz = 0;
    for (let k = 0; k < 21; k++) {
      sx += g[k * 3]!;
      sy += g[k * 3 + 1]!;
      sz += g[k * 3 + 2]!;
    }
    c[0] += sx / 21;
    c[1] += sy / 21;
    c[2] += sz / 21;
    n++;
  }
  if (n === 0) return null;
  return [c[0] / n, c[1] / n, c[2] / n];
}

function cosineDistanceSlot(a: NormFrame, b: NormFrame, slot: 0 | 1): number | null {
  if (!a.present[slot] || !b.present[slot]) return null;
  const va = a.handsLocal[slot];
  const vb = b.handsLocal[slot];
  let dot = 0,
    na = 0,
    nb = 0;
  for (let k = 0; k < va.length; k++) {
    dot += va[k]! * vb[k]!;
    na += va[k]! * va[k]!;
    nb += vb[k]! * vb[k]!;
  }
  if (na < 1e-9 || nb < 1e-9) return null;
  const sim = dot / (Math.sqrt(na) * Math.sqrt(nb));
  return 1 - Math.max(-1, Math.min(1, sim)); // 0 (identical) .. 2 (opposite)
}

function angleSlot(a: NormFrame, b: NormFrame, slot: 0 | 1): number | null {
  if (!a.present[slot] || !b.present[slot]) return null;
  const pa = a.palmNormal[slot];
  const pb = b.palmNormal[slot];
  const dot = pa[0]! * pb[0]! + pa[1]! * pb[1]! + pa[2]! * pb[2]!;
  const ma = Math.hypot(pa[0]!, pa[1]!, pa[2]!);
  const mb = Math.hypot(pb[0]!, pb[1]!, pb[2]!);
  if (ma < 1e-6 || mb < 1e-6) return null;
  return Math.acos(Math.max(-1, Math.min(1, dot / (ma * mb))));
}

/** Evenly spaced indices into a path of the given length. */
function keyframeIndices(pathLen: number, k: number): number[] {
  if (pathLen <= k) return Array.from({ length: pathLen }, (_, i) => i);
  return Array.from({ length: k }, (_, i) => Math.round((i * (pathLen - 1)) / (k - 1)));
}

/** Pick the nearest exemplar take (min DTW) to compare against. */
function nearestExemplar(
  attemptFeatures: Float32Array[],
  exemplars: Exemplar[],
): { ex: Exemplar; path: [number, number][] } | null {
  let best: { ex: Exemplar; path: [number, number][]; d: number } | null = null;
  for (const ex of exemplars) {
    if (!ex.quality.usable) continue;
    const { distance, path } = dtw(attemptFeatures, clipFeatures(ex.frames));
    if (!best || distance < best.d) best = { ex, path, d: distance };
  }
  return best ? { ex: best.ex, path: best.path } : null;
}

/** Movement: path-normalized DTW over the centroid trajectory, start subtracted. */
function movementDistance(attempt: NormFrame[], exemplar: NormFrame[]): number {
  const traj = (frames: NormFrame[]): Float32Array[] => {
    const cs = frames.map(centroid);
    const first = cs.find((c) => c !== null) ?? [0, 0, 0];
    return cs.map((c) => {
      const p = c ?? first;
      return Float32Array.from([p[0] - first[0], p[1] - first[1], p[2] - first[2]]);
    });
  };
  return dtw(traj(attempt), traj(exemplar)).distance;
}

/**
 * Score an attempt against a sign's exemplars. Returns null when there is no
 * usable exemplar to compare against — the caller must not grade.
 */
export function scoreComponents(
  attempt: Attempt,
  exemplars: Exemplar[],
): ComponentScores | null {
  const attemptFeatures = clipFeatures(attempt.frames);
  const match = nearestExemplar(attemptFeatures, exemplars);
  if (!match) return null;

  const ex = match.ex.frames;
  const at = attempt.frames;
  const keys = keyframeIndices(match.path.length, KEYFRAMES).map((i) => match.path[i]!);

  // Handshape & orientation at aligned keyframes.
  const handDists: number[] = [];
  const angles: number[] = [];
  for (const [ai, ei] of keys) {
    const a = at[ai]!;
    const e = ex[ei]!;
    for (const slot of [LEFT, RIGHT] as const) {
      const cd = cosineDistanceSlot(a, e, slot);
      if (cd !== null) handDists.push(cd);
      else if (e.present[slot]) handDists.push(2); // expected a hand, saw none
      const ang = angleSlot(a, e, slot);
      if (ang !== null) angles.push(ang);
      else if (e.present[slot]) angles.push(Math.PI);
    }
  }

  // Location over all aligned pairs: distance between centroids in shoulder-widths.
  const locDists: number[] = [];
  for (const [ai, ei] of match.path) {
    const ca = centroid(at[ai]!);
    const ce = centroid(ex[ei]!);
    if (ca && ce) {
      locDists.push(Math.hypot(ca[0] - ce[0], ca[1] - ce[1], ca[2] - ce[2]));
    }
  }

  const mean = (xs: number[], fallback: number): number =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fallback;

  const handshape = clampScore(mean(handDists, 2), HANDSHAPE_COS_SCALE);
  const orientation = clampScore(mean(angles, Math.PI), ORIENTATION_RAD_SCALE);
  const location = clampScore(mean(locDists, LOCATION_SW_SCALE * 2), LOCATION_SW_SCALE);
  const movement = clampScore(movementDistance(at, ex), MOVEMENT_SCALE);

  const scores = [handshape, location, movement, orientation];
  const min = Math.min(...scores);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const overall = OVERALL_MIN_WEIGHT * min + (1 - OVERALL_MIN_WEIGHT) * avg;

  return { handshape, location, movement, orientation, overall };
}
