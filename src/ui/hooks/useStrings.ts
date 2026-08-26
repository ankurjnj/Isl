import { useAppStore } from "@/ui/store/appStore";
import { strings, type Strings } from "@/i18n";

/** The active language's string catalogue. */
export function useStrings(): Strings {
  const lang = useAppStore((s) => s.lang);
  return strings(lang);
}
