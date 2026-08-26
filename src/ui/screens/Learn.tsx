import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/ui/store/appStore";
import { useStrings } from "@/ui/hooks/useStrings";
import { useLesson } from "@/ui/hooks/useLesson";
import { useRecorder } from "@/ui/hooks/useRecorder";
import { Button } from "@/ui/components/Button";
import { CameraView } from "@/ui/components/CameraView";
import { Reference } from "@/ui/components/Reference";
import { useLamp } from "@/vision/useLamp";
import { scoreComponents } from "@/score/components";
import { decideFeedback, type Feedback } from "@/score/feedback";
import type { Component } from "@/score/types";
import { recordAttempt, markLearned } from "@/store/progress";
import { signsInUnit, usableExemplarsFor } from "@/store/signs";
import "./screens.css";

type Phase = "watch" | "along" | "onyourown";

/**
 * The three-phase lesson (Part 4.3), the core loop:
 *   Watch → Along with me → On your own
 * The middle phase matters most: you're doing it but not being graded, so you
 * don't freeze. There is no fail state and retry is unlimited and unremarked.
 */
export function Learn({ signId }: { signId: string }) {
  const t = useStrings();
  const lang = useAppStore((s) => s.lang);
  const go = useAppStore((s) => s.go);
  const { loading, sign, exemplars, recognizer } = useLesson(signId);

  const [phase, setPhase] = useState<Phase>("watch");
  const [slowMo, setSlowMo] = useState(false);
  const [angle2, setAngle2] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const rec = useRecorder();

  const lampOn = phase === "along" || phase === "onyourown";
  useLamp(lampOn); // keep the screen bright while the lamp is up

  const grade = useCallback(
    async (): Promise<void> => {
      if (!sign || !recognizer || !rec.preview) return;
      const attempt = rec.preview;
      const recognition = await recognizer.recognize(attempt);
      const scores = scoreComponents(attempt, exemplars);
      const fb = decideFeedback({
        attempt,
        recognition,
        targetSign: sign,
        scores,
        lang,
        copy: {
          gotItHeadline: t.feedback.gotItHeadline,
          tooDark: t.feedback.tooDark,
          unsure: t.feedback.unsure,
          notRecognized: t.feedback.notRecognized,
        },
      });
      // Progress is additive; record best component scores when we actually graded.
      if (fb.graded && scores) {
        const comps: Partial<Record<Component, number>> = {
          handshape: scores.handshape,
          location: scores.location,
          movement: scores.movement,
          orientation: scores.orientation,
        };
        await recordAttempt(sign.id, comps, Date.now());
        if (fb.kind === "got_it") await markLearned(sign.id);
      }
      setFeedback(fb);
    },
    [sign, recognizer, exemplars, rec.preview, lang, t],
  );

  // When a take finishes in the "on your own" phase, grade it (once).
  useEffect(() => {
    if (phase === "onyourown" && rec.preview && !feedback) void grade();
  }, [phase, rec.preview, feedback, grade]);

  async function nextSign() {
    if (!sign) return go({ name: "home" });
    const inUnit = await signsInUnit(sign.unit);
    for (const s of inUnit) {
      if (s.id === sign.id) continue;
      if ((await usableExemplarsFor(s.id)).length > 0) {
        // Reset and move on.
        return go({ name: "learn", signId: s.id });
      }
    }
    go({ name: "home" });
  }

  if (loading) {
    return (
      <div className="screen">
        <div className="screen__body">
          <p style={{ marginTop: "var(--s-6)" }}>…</p>
        </div>
      </div>
    );
  }

  if (!sign || exemplars.length === 0) {
    return (
      <div className="screen">
        <div className="screen__body">
          <p style={{ marginTop: "var(--s-6)" }}>{t.home.empty}</p>
        </div>
        <div className="action-bar">
          <Button variant="quiet" onClick={() => go({ name: "home" })}>
            ←
          </Button>
        </div>
      </div>
    );
  }

  const name = sign.hindi; // sign name shown in Devanagari display face

  return (
    <div className="screen">
      <div className={`lamp ${lampOn ? "lamp--on" : ""}`}>
        <div className="lamp__sign">{name}</div>

        {phase === "watch" && (
          <>
            <Reference sign={sign} exemplars={exemplars} slowMo={slowMo} angle2={angle2} />
            <div className="sign-card__gloss" style={{ textAlign: "center" }}>
              {sign.english} · {sign.hindi}
            </div>
            <div className="sign-card__credit">
              {t.learn.signedBy(sign.signer.name, sign.region)}
            </div>
            <div style={{ display: "flex", gap: "var(--s-3)", marginTop: "var(--s-4)" }}>
              <Button variant="quiet" onClick={() => setSlowMo((v) => !v)}>
                {t.learn.slowMotion}
              </Button>
              <Button variant="quiet" onClick={() => setAngle2((v) => !v)}>
                {t.learn.otherAngle}
              </Button>
            </div>
          </>
        )}

        {phase === "along" && (
          <>
            <CameraView enabled onFrame={rec.onFrame} />
            <div className="tracking-meter">
              <div className="tracking-meter__bar">
                <div
                  className="tracking-meter__fill"
                  style={{ width: `${Math.round(rec.liveLevel * 100)}%` }}
                />
              </div>
              <span>{rec.liveLevel > 0.5 ? t.learn.seeingYou : t.learn.cannotSeeYou}</span>
            </div>
            {/* Reference stays visible, small, looping. No grade in this phase. */}
            <div className="reference-corner">
              <Reference sign={sign} exemplars={exemplars} />
            </div>
          </>
        )}

        {phase === "onyourown" && (
          <>
            <CameraView enabled onFrame={rec.onFrame} />
            {!feedback && (
              <div className="tracking-meter">
                <div className="tracking-meter__bar">
                  <div
                    className="tracking-meter__fill"
                    style={{ width: `${Math.round(rec.liveLevel * 100)}%` }}
                  />
                </div>
                <span>{rec.liveLevel > 0.5 ? t.learn.seeingYou : t.learn.cannotSeeYou}</span>
              </div>
            )}
            {feedback && (
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
          </>
        )}
      </div>

      <div className="action-bar">
        {phase === "watch" && (
          <Button onClick={() => setPhase("along")}>{t.learn.continue}</Button>
        )}

        {phase === "along" && (
          <>
            <Button onClick={() => setPhase("onyourown")}>{t.learn.onYourOwn}</Button>
            <Button variant="quiet" onClick={() => setPhase("watch")}>
              {t.learn.watch}
            </Button>
          </>
        )}

        {phase === "onyourown" && !feedback && (
          <Button onClick={rec.phase === "recording" ? rec.stop : rec.start} disabled={rec.phase === "countdown"}>
            {rec.phase === "recording"
              ? t.studio.stop
              : rec.phase === "countdown"
                ? String(rec.countdown || "•")
                : t.learn.signNow}
          </Button>
        )}

        {phase === "onyourown" && feedback && (
          <>
            {feedback.kind === "got_it" ? (
              <Button onClick={nextSign}>{t.feedback.nextSign}</Button>
            ) : (
              <>
                <Button
                  onClick={() => {
                    setFeedback(null);
                    rec.clearPreview();
                  }}
                >
                  {t.feedback.tryAgain}
                </Button>
                {feedback.kind !== "couldnt_see" && (
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setFeedback(null);
                      rec.clearPreview();
                      setPhase("watch");
                    }}
                  >
                    {t.feedback.watchAgain}
                  </Button>
                )}
              </>
            )}
          </>
        )}

        <Button variant="quiet" onClick={() => go({ name: "home" })}>
          ←
        </Button>
      </div>
    </div>
  );
}
