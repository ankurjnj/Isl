import { useAppStore } from "@/ui/store/appStore";

/**
 * English / हिंदी, persistent in the header, two taps from anywhere (Part 3).
 * A parent may hand the phone to a grandparent mid-session.
 */
export function LanguageToggle() {
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>
        English
      </button>
      <button aria-pressed={lang === "hi"} onClick={() => setLang("hi")}>
        हिंदी
      </button>
    </div>
  );
}
