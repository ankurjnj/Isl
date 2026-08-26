import type { Lang, Strings } from "./types";
import { en } from "./en";
import { hi } from "./hi";

export type { Lang, Strings } from "./types";

const catalogues: Record<Lang, Strings> = { en, hi };

export function strings(lang: Lang): Strings {
  return catalogues[lang];
}

export const LANGS: Lang[] = ["en", "hi"];

/** Pick a sensible default from the browser's language, without touching the DOM. */
export function defaultLang(navigatorLanguages: readonly string[]): Lang {
  return navigatorLanguages.some((l) => l.toLowerCase().startsWith("hi"))
    ? "hi"
    : "en";
}
