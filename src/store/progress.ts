import { db, type SignProgress } from "./db";
import type { Component } from "@/score/types";
import { REVIEW_STALE_DAYS } from "@/config/thresholds";

/**
 * Progress is shown as what your child can now understand, never as a score or
 * a debt (Part 2 §3). These helpers only ever count UP.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function empty(signId: string): SignProgress {
  return {
    signId,
    attempts: 0,
    bestComponents: {},
    learned: false,
    lastPractisedMs: null,
  };
}

export async function getProgress(signId: string): Promise<SignProgress> {
  return (await db.progress.get(signId)) ?? empty(signId);
}

export async function allProgress(): Promise<SignProgress[]> {
  return db.progress.toArray();
}

/**
 * Record one attempt. Component scores are kept as a running best (additive) —
 * a worse attempt never lowers what's shown.
 */
export async function recordAttempt(
  signId: string,
  components: Partial<Record<Component, number>>,
  nowMs: number,
): Promise<SignProgress> {
  const prev = await getProgress(signId);
  const bestComponents = { ...prev.bestComponents };
  for (const [k, v] of Object.entries(components) as [Component, number][]) {
    const cur = bestComponents[k];
    if (cur === undefined || v > cur) bestComponents[k] = v;
  }
  const next: SignProgress = {
    ...prev,
    attempts: prev.attempts + 1,
    bestComponents,
    lastPractisedMs: nowMs,
  };
  await db.progress.put(next);
  return next;
}

/** Mark a sign as learned — it moves into "your home signs" and stays. */
export async function markLearned(signId: string): Promise<void> {
  const prev = await getProgress(signId);
  if (prev.learned) return;
  await db.progress.put({ ...prev, learned: true });
}

export async function learnedSignIds(): Promise<string[]> {
  const rows = await db.progress.where("learned").equals(1 as never).toArray();
  // Dexie can't index booleans reliably across engines; filter defensively.
  return (rows.length ? rows : await allProgress())
    .filter((p) => p.learned)
    .map((p) => p.signId);
}

/**
 * Review queue: signs not practised in REVIEW_STALE_DAYS+, or with any tracked
 * component below tolerance (Part 6 v0.6). Plain, no FSRS until there is real
 * attempt volume.
 */
export async function reviewQueue(
  tolerances: Record<string, Record<Component, number>>,
  nowMs: number,
): Promise<string[]> {
  const all = await allProgress();
  const due: string[] = [];
  for (const p of all) {
    if (p.lastPractisedMs === null) continue;
    const stale = nowMs - p.lastPractisedMs >= REVIEW_STALE_DAYS * DAY_MS;
    const tol = tolerances[p.signId];
    const weak =
      tol !== undefined &&
      (Object.keys(tol) as Component[]).some((c) => {
        const best = p.bestComponents[c];
        return best !== undefined && best < tol[c];
      });
    if (stale || weak) due.push(p.signId);
  }
  return due;
}
