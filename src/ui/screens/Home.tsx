import { useAppStore } from "@/ui/store/appStore";
import { useStrings } from "@/ui/hooks/useStrings";
import { useHomeData } from "@/ui/hooks/useHomeData";
import { Button } from "@/ui/components/Button";
import { LanguageToggle } from "@/ui/components/LanguageToggle";
import { PrivacyNote } from "@/ui/components/PrivacyNote";
import { brand } from "@/config/brand";
import "./screens.css";

/**
 * Home (Part 4.2). One primary action, stating its time cost — five free
 * minutes is the actual decision being made. "Your home signs" is the only
 * progress display: it counts up and never counts down (Part 2 §3).
 */
export function Home() {
  const t = useStrings();
  const lang = useAppStore((s) => s.lang);
  const go = useAppStore((s) => s.go);
  const { loading, practiceable, next, learnedIds } = useHomeData();

  const learned = practiceable.filter((s) => learnedIds.has(s.id));
  const groupCount = next ? practiceable.filter((s) => s.unit === next.unit).length : 0;

  return (
    <div className="screen">
      <div className="app-header">
        <h1>{brand.nameDevanagari}</h1>
        <LanguageToggle />
      </div>

      <div className="screen__body">
        {!loading && next && (
          <section>
            <div className="section-label">
              <span>{t.home.rightNow}</span>
            </div>
            <div className="card" style={{ marginTop: "var(--s-3)" }}>
              <div className="sign-card__name">{lang === "hi" ? next.hindi : next.english}</div>
              <div className="sign-card__gloss">
                {next.english} · {next.hindi}
              </div>
              <div className="sign-card__gloss">{t.home.signsInGroup(groupCount)}</div>
              {/* The signer is credited on the card, not in settings (Part 7 §10). */}
              <div className="sign-card__credit">
                {next.signer.name} · {next.region}
              </div>
            </div>
          </section>
        )}

        {!loading && learned.length > 0 && (
          <section>
            <div className="section-label">
              <span>{t.home.homeSigns}</span>
              <span className="section-count">{learned.length}</span>
            </div>
            <div className="card" style={{ marginTop: "var(--s-3)" }}>
              <div className="chips">
                {learned.map((s) => (
                  <span key={s.id} className="chip">
                    {lang === "hi" ? s.hindi : s.english}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {!loading && practiceable.length === 0 && (
          <section>
            <div className="card">
              <p style={{ color: "var(--ink-soft)", lineHeight: "var(--t-lead-lh)" }}>
                {t.home.empty}
              </p>
            </div>
          </section>
        )}

        <PrivacyNote />
      </div>

      <div className="action-bar">
        {next ? (
          <Button onClick={() => go({ name: "learn", signId: next.id })}>
            {t.home.start}
          </Button>
        ) : (
          <Button onClick={() => go({ name: "studio" })}>{t.studio.title}</Button>
        )}
        <Button variant="quiet" onClick={() => go({ name: "studio" })}>
          {t.studio.title}
        </Button>
      </div>
    </div>
  );
}
