import { create } from "zustand";
import type { Lang } from "@/i18n";
import { defaultLang } from "@/i18n";

/** Which handshape mirror-normalization to apply (Part 4.1, screen 3). */
export type Handedness = "left" | "right";

export type Route =
  | { name: "onboard" }
  | { name: "menu" }
  | { name: "learn" }
  | { name: "test" }
  | { name: "studio" };

type Persisted = {
  lang: Lang;
  handedness: Handedness;
  onboardComplete: boolean;
};

const STORAGE_KEY = "aangan.prefs.v1";

function loadPersisted(): Persisted {
  const fallback: Persisted = {
    lang:
      typeof navigator !== "undefined"
        ? defaultLang(navigator.languages ?? [navigator.language])
        : "en",
    handedness: "right",
    onboardComplete: false,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<Persisted>) };
  } catch {
    return fallback;
  }
}

function save(p: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* private mode / storage disabled — preferences just won't persist */
  }
}

type AppState = Persisted & {
  route: Route;
  /** Bumped when new content is imported, so screens re-read the library. */
  contentVersion: number;
  bumpContent: () => void;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  setHandedness: (h: Handedness) => void;
  completeOnboarding: () => void;
  go: (route: Route) => void;
};

export const useAppStore = create<AppState>((set, get) => {
  const persisted = loadPersisted();
  return {
    ...persisted,
    route: persisted.onboardComplete ? { name: "menu" } : { name: "onboard" },
    contentVersion: 0,
    bumpContent: () => set({ contentVersion: get().contentVersion + 1 }),

    setLang: (lang) => {
      set({ lang });
      save({ ...pick(get()), lang });
    },
    toggleLang: () => {
      const lang = get().lang === "en" ? "hi" : "en";
      set({ lang });
      save({ ...pick(get()), lang });
    },
    setHandedness: (handedness) => {
      set({ handedness });
      save({ ...pick(get()), handedness });
    },
    completeOnboarding: () => {
      set({ onboardComplete: true, route: { name: "menu" } });
      save({ ...pick(get()), onboardComplete: true });
    },
    go: (route) => set({ route }),
  };
});

function pick(s: Persisted): Persisted {
  return {
    lang: s.lang,
    handedness: s.handedness,
    onboardComplete: s.onboardComplete,
  };
}
