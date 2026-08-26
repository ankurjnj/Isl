import { useState } from "react";
import { useAppStore } from "@/ui/store/appStore";
import { useStrings } from "@/ui/hooks/useStrings";
import { Button } from "@/ui/components/Button";
import { LanguageToggle } from "@/ui/components/LanguageToggle";
import { brand } from "@/config/brand";
import "./screens.css";

/**
 * First run (Part 4.1). Three screens, skippable, under 40 seconds.
 * No account, no email, nothing to sign up for.
 */
export function Onboarding() {
  const t = useStrings();
  const [step, setStep] = useState(0);
  const handedness = useAppStore((s) => s.handedness);
  const setHandedness = useAppStore((s) => s.setHandedness);
  const complete = useAppStore((s) => s.completeOnboarding);

  return (
    <div className="screen">
      <div className="app-header">
        <h1>{brand.nameDevanagari}</h1>
        <LanguageToggle />
      </div>

      <div className="onboard">
        <div className="onboard__dots" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`onboard__dot ${i === step ? "onboard__dot--on" : ""}`}
            />
          ))}
        </div>

        <div className="onboard__body">
          {step === 0 && (
            <>
              <h2>{t.onboard.s1Title}</h2>
              <p>{t.onboard.s1Body}</p>
            </>
          )}

          {step === 1 && (
            <>
              <h2>{t.onboard.s2Title}</h2>
              <p>{t.onboard.s2Body}</p>
              <p>
                <a href={brand.links.islrtc} target="_blank" rel="noreferrer">
                  ISLRTC
                </a>
                {" · "}
                <a href={brand.links.nadIndia} target="_blank" rel="noreferrer">
                  NAD India
                </a>
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <h2>{t.onboard.s3Title}</h2>

              <div className="onboard__field">
                <span>{t.onboard.langLabel}</span>
                <LanguageToggle />
              </div>

              <div className="onboard__field">
                <span>{t.onboard.handLabel}</span>
                <div className="choice-row">
                  <button
                    className="choice"
                    aria-pressed={handedness === "left"}
                    onClick={() => setHandedness("left")}
                  >
                    {t.onboard.leftHanded}
                  </button>
                  <button
                    className="choice"
                    aria-pressed={handedness === "right"}
                    onClick={() => setHandedness("right")}
                  >
                    {t.onboard.rightHanded}
                  </button>
                </div>
              </div>

              <div className="onboard__field">
                <span>{t.onboard.cameraTitle}</span>
                <p>{t.onboard.cameraBody}</p>
              </div>
            </>
          )}
        </div>

        <div className="action-bar">
          {step < 2 ? (
            <>
              <Button onClick={() => setStep(step + 1)}>{t.onboard.next}</Button>
              <Button variant="quiet" onClick={complete}>
                {t.onboard.skip}
              </Button>
            </>
          ) : (
            <Button onClick={complete}>{t.onboard.begin}</Button>
          )}
        </div>
      </div>
    </div>
  );
}
