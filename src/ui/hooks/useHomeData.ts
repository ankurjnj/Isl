import { useEffect, useState } from "react";
import { allSigns, usableExemplarsFor } from "@/store/signs";
import { allProgress } from "@/store/progress";
import type { Sign } from "@/content/schema";

export type HomeData = {
  loading: boolean;
  /** Signs that have at least one usable exemplar (practiceable). */
  practiceable: Sign[];
  next: Sign | null;
  learnedIds: Set<string>;
  reviewIds: Set<string>;
};

/** Loads the home-screen state from the on-device store. */
export function useHomeData(): HomeData {
  const [data, setData] = useState<HomeData>({
    loading: true,
    practiceable: [],
    next: null,
    learnedIds: new Set(),
    reviewIds: new Set(),
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      const signs = await allSigns();
      const practiceable: Sign[] = [];
      for (const s of signs) {
        if ((await usableExemplarsFor(s.id)).length > 0) practiceable.push(s);
      }
      const progress = await allProgress();
      const learnedIds = new Set(progress.filter((p) => p.learned).map((p) => p.signId));
      const practised = new Set(
        progress.filter((p) => p.lastPractisedMs !== null).map((p) => p.signId),
      );
      // "Right now": the first practiceable sign the parent hasn't learned yet.
      const next =
        practiceable.find((s) => !learnedIds.has(s.id)) ?? practiceable[0] ?? null;
      const reviewIds = new Set(
        practiceable.filter((s) => practised.has(s.id) && !learnedIds.has(s.id)).map((s) => s.id),
      );
      if (alive) setData({ loading: false, practiceable, next, learnedIds, reviewIds });
    })();
    return () => {
      alive = false;
    };
  }, []);

  return data;
}
