import { useEffect, useState } from "react";
import { getSign, usableExemplarsFor, referencesForUnit } from "@/store/signs";
import { DtwRecognizer } from "@/recognize/dtwRecognizer";
import type { SignRecognizer } from "@/recognize/types";
import type { Sign, Exemplar } from "@/content/schema";

export type LessonData = {
  loading: boolean;
  sign: Sign | null;
  exemplars: Exemplar[];
  recognizer: SignRecognizer | null;
};

/**
 * Loads everything a lesson needs: the target sign, its usable exemplars, and a
 * recognizer loaded with the whole active unit (matches are compared only
 * against the unit, not the whole vocabulary — Part 6 v0.4).
 */
export function useLesson(signId: string): LessonData {
  const [data, setData] = useState<LessonData>({
    loading: true,
    sign: null,
    exemplars: [],
    recognizer: null,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      const sign = await getSign(signId);
      if (!sign) {
        if (alive) setData({ loading: false, sign: null, exemplars: [], recognizer: null });
        return;
      }
      const exemplars = await usableExemplarsFor(signId);
      const refs = await referencesForUnit(sign.unit);
      const recognizer = new DtwRecognizer();
      await recognizer.load(refs);
      if (alive) setData({ loading: false, sign, exemplars, recognizer });
    })();
    return () => {
      alive = false;
    };
  }, [signId]);

  return data;
}
