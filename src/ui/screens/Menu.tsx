import { useAppStore } from "@/ui/store/appStore";
import { useStrings } from "@/ui/hooks/useStrings";
import { useHomeData } from "@/ui/hooks/useHomeData";
import { LanguageToggle } from "@/ui/components/LanguageToggle";
import { PrivacyNote } from "@/ui/components/PrivacyNote";
import { brand } from "@/config/brand";
import "./screens.css";

/**
 * The whole app is two choices (Duolingo-style): Learn (digital hand, no camera)
 * and Test & Converse (camera). Everything else — recording new signs — is one
 * quiet link, out of the way. No options scattered around.
 */
export function Menu() {
  const t = useStrings();
  const go = useAppStore((s) => s.go);
  const { practiceable } = useHomeData();
  const ready = practiceable.length;

  return (
    <div className="screen menu">
      <div className="app-header">
        <h1>{brand.nameDevanagari}</h1>
        <LanguageToggle />
      </div>

      <div className="menu__cards">
        <button className="big-card big-card--learn" onClick={() => go({ name: "learn" })}>
          <span className="big-card__icon" aria-hidden>
            👐
          </span>
          <span className="big-card__text">
            <span className="big-card__title">{t.menu.learnTitle}</span>
            <span className="big-card__sub">{t.menu.learnSubtitle}</span>
            {ready > 0 && <span className="big-card__badge">{t.menu.learnCount(ready)}</span>}
          </span>
        </button>

        <button className="big-card big-card--test" onClick={() => go({ name: "test" })}>
          <span className="big-card__icon" aria-hidden>
            📷
          </span>
          <span className="big-card__text">
            <span className="big-card__title">{t.menu.testTitle}</span>
            <span className="big-card__sub">{t.menu.testSubtitle}</span>
          </span>
        </button>
      </div>

      <div className="menu__foot">
        <button className="text-link" onClick={() => go({ name: "studio" })}>
          + {t.menu.addSigns}
        </button>
        <PrivacyNote />
      </div>
    </div>
  );
}
