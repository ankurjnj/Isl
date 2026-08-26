import type { Attempt } from "@/landmarks/types";
import type { Sign } from "@/content/schema";
import type { RecognitionResult } from "@/recognize/types";
import type { Lang } from "@/i18n/types";
import type { Component } from "./types";
import { COMPONENTS } from "./types";
import type { ComponentScores } from "./components";
import { COMPONENT_PASS, OVERALL_PASS } from "@/config/thresholds";

/**
 * Turn scores into ONE of the four learner-facing states (Part 4.5). PURE.
 *
 * Guardrails baked in here:
 *   - Never grade when quality is unusable or the match is ambiguous (§7):
 *     say so instead. A confident wrong grade is the worst thing the app does.
 *   - One correction at a time — the single weakest failing component (§6).
 *   - No percentages, no component breakdown table (§5) — the numbers stay
 *     inside; only a state and one sentence come out.
 */

export type FeedbackKind =
  | "got_it"
  | "not_yet"
  | "couldnt_see"
  | "unsure"
  | "unrecognized";

export type Feedback = {
  kind: FeedbackKind;
  /** The single component to correct, for "not_yet" only. */
  component?: Component;
  /** One resolved sentence, in the user's language. */
  message: string;
  /** Left-border colour of the feedback card. Never red anywhere (§3). */
  border: "sage" | "dusk" | "none";
  /** Whether a grade was actually issued. False for the no-grade states. */
  graded: boolean;
};

/** The interface-voice strings this module needs (from i18n feedback catalogue). */
export type FeedbackCopy = {
  gotItHeadline: string;
  tooDark: string;
  unsure: string;
  notRecognized: string;
};

function weakestComponent(scores: ComponentScores): Component {
  let worst: Component = COMPONENTS[0]!;
  for (const c of COMPONENTS) if (scores[c] < scores[worst]) worst = c;
  return worst;
}

export function decideFeedback(args: {
  attempt: Attempt;
  recognition: RecognitionResult;
  targetSign: Sign;
  scores: ComponentScores | null;
  lang: Lang;
  copy: FeedbackCopy;
}): Feedback {
  const { attempt, recognition, targetSign, scores, lang, copy } = args;

  // 1. Couldn't see — gate everything on tracking quality (§7).
  if (!attempt.quality.usable) {
    return { kind: "couldnt_see", message: copy.tooDark, border: "none", graded: false };
  }

  // 2. Nothing close enough — the honest failure (§6.1, demo step 5).
  if (recognition.best === null) {
    return {
      kind: "unrecognized",
      message: copy.notRecognized,
      border: "none",
      graded: false,
    };
  }

  // 3. Too close to call — never guess (§7).
  if (recognition.ambiguous) {
    return { kind: "unsure", message: copy.unsure, border: "none", graded: false };
  }

  // Need scores to grade; if we somehow can't compute them, stay honest.
  if (!scores) {
    return { kind: "unsure", message: copy.unsure, border: "none", graded: false };
  }

  const matchedTarget = recognition.best === targetSign.id;
  const passed =
    matchedTarget &&
    scores.overall >= OVERALL_PASS &&
    COMPONENTS.every((c) => scores[c] >= COMPONENT_PASS);

  if (passed) {
    return {
      kind: "got_it",
      message: copy.gotItHeadline,
      border: "sage",
      graded: true,
    };
  }

  // 4. Not yet — one correction, the weakest component, in the sign's own
  //    authored copy, in the user's language (§4.5).
  const component = weakestComponent(scores);
  return {
    kind: "not_yet",
    component,
    message: targetSign.feedback[component][lang],
    border: "dusk",
    graded: true,
  };
}
