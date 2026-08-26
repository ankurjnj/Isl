import { useEffect, useState } from "react";
import { useAppStore } from "@/ui/store/appStore";
import { useStrings } from "@/ui/hooks/useStrings";
import { useHomeData } from "@/ui/hooks/useHomeData";
import { Button } from "@/ui/components/Button";
import { DigitalHand } from "@/ui/components/DigitalHand";
import { usableExemplarsFor } from "@/store/signs";
import type { Exemplar } from "@/content/schema";
import "./screens.css";

/**
 * Learn — the digital hand. No camera, nothing to grade: just the recorded
 * signer's hand played back so a parent can watch and copy. (It shows the Deaf
 * signer's OWN recorded landmarks, never an invented form — Part 7 §1.)
 */
export function LearnDigital() {
  const t = useStrings();
  const lang = useAppStore((s) => s.lang);
  const go = useAppStore((s) => s.go);
  const { loading, practiceable } = useHomeData();
  const [i, setI] = useState(0);
  const [slowMo, setSlowMo] = useState(false);
  const [exemplars, setExemplars] = useState<Exemplar[]>([]);

  const sign = practiceable.length ? practiceable[i % practiceable.length]! : null;
  const signId = sign?.id;

  useEffect(() => {
    let alive = true;
    if (!signId) {
      setExemplars([]);
      return;
    }
    void usableExemplarsFor(signId).then((ex) => alive && setExemplars(ex));
    return () => {
      alive = false;
    };
  }, [signId]);

  if (!loading && practiceable.length === 0) {
    return <EmptyLearn onAdd={() => go({ name: "studio" })} onBack={() => go({ name: "menu" })} />;
  }

  return (
    <div className="screen">
      <div className="lamp">
        <div className="lamp__sign">{sign ? sign.hindi : "…"}</div>
        <div className="camera-frame reference-skeleton" style={{ maxWidth: 360 }}>
          <DigitalHand frames={exemplars[0]?.frames ?? []} slowMo={slowMo} />
        </div>
        {sign && (
          <>
            <div className="sign-card__gloss" style={{ textAlign: "center" }}>
              {lang === "hi" ? sign.english : sign.hindi}
            </div>
            <div className="sign-card__credit">
              {sign.signer.name} · {sign.region}
            </div>
            {/* An unreviewed form is never presented as settled ISL. */}
            {sign.provenance?.review === "unreviewed" && (
              <p className="provenance-note">{t.mode.unreviewed}</p>
            )}
          </>
        )}
        <Button
          variant="quiet"
          onClick={() => setSlowMo((v) => !v)}
          className="learn-slowmo"
        >
          {t.learn.slowMotion}
        </Button>
      </div>

      <div className="action-bar">
        <div className="pager">
          <Button variant="quiet" onClick={() => setI((n) => n + practiceable.length - 1)}>
            ‹ {t.mode.prev}
          </Button>
          <span className="pager__count">
            {(i % practiceable.length) + 1} / {practiceable.length}
          </span>
          <Button onClick={() => setI((n) => n + 1)}>{t.mode.next} ›</Button>
        </div>
        <button className="text-link" onClick={() => go({ name: "menu" })}>
          {t.mode.back}
        </button>
      </div>
    </div>
  );
}

function EmptyLearn({ onAdd, onBack }: { onAdd: () => void; onBack: () => void }) {
  const t = useStrings();
  return (
    <div className="screen">
      <div className="screen__body" style={{ justifyContent: "center", flex: 1 }}>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>👐</div>
          <p style={{ color: "var(--ink-soft)", lineHeight: "var(--t-lead-lh)", marginTop: "var(--s-4)" }}>
            {t.home.empty}
          </p>
        </div>
      </div>
      <div className="action-bar">
        <Button onClick={onAdd}>{t.menu.addSigns}</Button>
        <button className="text-link" onClick={onBack}>
          {t.mode.back}
        </button>
      </div>
    </div>
  );
}
