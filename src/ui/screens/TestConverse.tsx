import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/ui/store/appStore";
import { useStrings } from "@/ui/hooks/useStrings";
import { useRecorder } from "@/ui/hooks/useRecorder";
import { useLamp } from "@/vision/useLamp";
import { Button } from "@/ui/components/Button";
import { CameraView } from "@/ui/components/CameraView";
import { allReferences } from "@/store/signs";
import { DtwRecognizer } from "@/recognize/dtwRecognizer";
import type { SignRecognizer } from "@/recognize/types";
import type { SignReference } from "@/content/schema";
import { scoreComponents } from "@/score/components";
import { decideFeedback, type Feedback } from "@/score/feedback";
import type { Component } from "@/score/types";
import { recordAttempt, markLearned } from "@/store/progress";
import "./screens.css";

/**
 * Test & Converse — the camera side. Converse works with zero content (the
 * overlay just responds; nothing is graded). If signs have been recorded, the
 * Test tab lets you sign one and get a single honest result. One toggle, no
 * scattered options.
 */
export function TestConverse() {
  const t = useStrings();
  const lang = useAppStore((s) => s.lang);
  const go = useAppStore((s) => s.go);
  const rec = useRecorder();
  useLamp(true);

  const [refs, setRefs] = useState<SignReference[]>([]);
  const [recognizer, setRecognizer] = useState<SignRecognizer | null>(null);
  const [tab, setTab] = useState<"converse" | "test">("converse");
  const [target, setTarget] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await allReferences();
      if (!alive) return;
      setRefs(r);
      if (r.length) {
        const rec = new DtwRecognizer();
        await rec.load(r);
        if (alive) setRecognizer(rec);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const hasContent = refs.length > 0;
  const targetRef = hasContent ? refs[target % refs.length]! : null;

  const grade = useCallback(async () => {
    if (!recognizer || !targetRef || !rec.preview) return;
    const attempt = rec.preview;
    const recognition = await recognizer.recognize(attempt);
    const scores = scoreComponents(attempt, targetRef.exemplars);
    const fb = decideFeedback({
      attempt,
      recognition,
      targetSign: targetRef.sign,
      scores,
      lang,
      copy: {
        gotItHeadline: t.feedback.gotItHeadline,
        tooDark: t.feedback.tooDark,
        unsure: t.feedback.unsure,
        notRecognized: t.feedback.notRecognized,
      },
    });
    if (fb.graded && scores) {
      const comps: Partial<Record<Component, number>> = {
        handshape: scores.handshape,
        location: scores.location,
        movement: scores.movement,
        orientation: scores.orientation,
      };
      await recordAttempt(targetRef.sign.id, comps, Date.now());
      if (fb.kind === "got_it") await markLearned(targetRef.sign.id);
    }
    setFeedback(fb);
  }, [recognizer, targetRef, rec.preview, lang, t]);

  useEffect(() => {
    if (tab === "test" && rec.preview && !feedback) void grade();
  }, [tab, rec.preview, feedback, grade]);

  const meterLabel = rec.liveLevel > 0.5 ? t.learn.seeingYou : t.learn.cannotSeeYou;

  return (
    <div className="screen">
      <div className="lamp lamp--on">
        {/* One toggle: Converse (always available) / Test (needs signs). */}
        <div className="seg-toggle">
          <button aria-pressed={tab === "converse"} onClick={() => setTab("converse")}>
            {t.mode.converse}
          </button>
          <button
            aria-pressed={tab === "test"}
            onClick={() => hasContent && setTab("test")}
            disabled={!hasContent}
          >
            {t.mode.test}
          </button>
        </div>

        {tab === "test" && targetRef && (
          <div className="lamp__sign" style={{ marginBottom: "var(--s-3)" }}>
            {targetRef.sign.hindi}
          </div>
        )}

        <CameraView enabled onFrame={rec.onFrame} />

        {!feedback && (
          <div className="tracking-meter">
            <div className="tracking-meter__bar">
              <div
                className="tracking-meter__fill"
                style={{ width: `${Math.round(rec.liveLevel * 100)}%` }}
              />
            </div>
            <span>{meterLabel}</span>
          </div>
        )}

        {tab === "converse" && (
          <p className="privacy-note" style={{ color: "var(--night)" }}>
            {t.mode.converseHint}
          </p>
        )}

        {tab === "test" && feedback && (
          <div
            className={`feedback-card ${
              feedback.border === "sage"
                ? "feedback-card--got-it"
                : feedback.border === "dusk"
                  ? "feedback-card--not-yet"
                  : ""
            }`}
          >
            <p>{feedback.message}</p>
          </div>
        )}
      </div>

      <div className="action-bar">
        {tab === "test" && !feedback && (
          <>
            <Button
              onClick={rec.phase === "recording" ? rec.stop : rec.start}
              disabled={rec.phase === "countdown"}
            >
              {rec.phase === "recording"
                ? t.studio.stop
                : rec.phase === "countdown"
                  ? String(rec.countdown || "•")
                  : t.learn.signNow}
            </Button>
            {refs.length > 1 && (
              <div className="pager">
                <Button variant="quiet" onClick={() => setTarget((n) => n + refs.length - 1)}>
                  ‹
                </Button>
                <span className="pager__count">{t.mode.pickSign}</span>
                <Button variant="quiet" onClick={() => setTarget((n) => n + 1)}>
                  ›
                </Button>
              </div>
            )}
          </>
        )}

        {tab === "test" && feedback && (
          <Button
            onClick={() => {
              if (feedback.kind === "got_it") setTarget((n) => n + 1);
              setFeedback(null);
              rec.clearPreview();
            }}
          >
            {feedback.kind === "got_it" ? t.feedback.nextSign : t.feedback.tryAgain}
          </Button>
        )}

        <button className="text-link" onClick={() => go({ name: "menu" })}>
          {t.mode.back}
        </button>
      </div>
    </div>
  );
}
