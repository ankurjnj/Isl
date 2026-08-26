import { useState } from "react";
import { useAppStore } from "@/ui/store/appStore";
import { useStrings } from "@/ui/hooks/useStrings";
import { useHomeData } from "@/ui/hooks/useHomeData";
import { useLesson } from "@/ui/hooks/useLesson";
import { useLamp } from "@/vision/useLamp";
import { Button } from "@/ui/components/Button";
import { CameraView } from "@/ui/components/CameraView";
import { Reference } from "@/ui/components/Reference";
import "./screens.css";

/**
 * "With your child" (Part 4.6). Phone flat between parent and child; both sign;
 * the skeleton overlay reacting to the child's hands is the entire point.
 * Nothing is graded, ever. Kept deliberately small — it's the most original
 * thing in the product and the easiest to over-engineer.
 */
export function ChildMode() {
  const t = useStrings();
  const go = useAppStore((s) => s.go);
  const { loading, practiceable } = useHomeData();
  const [idx, setIdx] = useState(0);
  useLamp(true);

  if (loading) {
    return (
      <div className="screen">
        <div className="screen__body">
          <p style={{ marginTop: "var(--s-6)" }}>…</p>
        </div>
      </div>
    );
  }

  if (practiceable.length === 0) {
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

  const current = practiceable[idx % practiceable.length]!;
  return <ChildStage signId={current.id} onPrev={() => setIdx((i) => i + practiceable.length - 1)} onNext={() => setIdx((i) => i + 1)} onHome={() => go({ name: "home" })} hint={t.child.hint} />;
}

function ChildStage(props: {
  signId: string;
  onPrev: () => void;
  onNext: () => void;
  onHome: () => void;
  hint: string;
}) {
  const { sign, exemplars } = useLesson(props.signId);
  if (!sign) return null;

  return (
    <div className="screen">
      <div className="lamp lamp--on">
        {/* Big card, no text label beyond the sign name in the display face. */}
        <div className="lamp__sign">{sign.hindi}</div>
        <Reference sign={sign} exemplars={exemplars} />
        {/* Both sign; the overlay responds to whoever is in frame. Never graded. */}
        <CameraView enabled />
        <p className="privacy-note" style={{ color: "var(--night)" }}>
          {props.hint}
        </p>
      </div>
      <div className="action-bar">
        <div style={{ display: "flex", gap: "var(--s-3)" }}>
          <Button variant="quiet" onClick={props.onPrev}>
            ‹
          </Button>
          <Button onClick={props.onNext}>›</Button>
        </div>
        <Button variant="quiet" onClick={props.onHome}>
          ←
        </Button>
      </div>
    </div>
  );
}
