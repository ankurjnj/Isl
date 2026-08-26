import { describe, it, expect } from "vitest";
import { scoreComponents } from "./components";
import { decideFeedback } from "./feedback";
import { COMPONENTS, type Component } from "./types";
import { ATTEMPT_FRAMES } from "@/config/thresholds";
import type { NormFrame, Attempt, TrackingQuality } from "@/landmarks/types";
import type { Sign, Exemplar } from "@/content/schema";
import type { RecognitionResult } from "@/recognize/types";

/* ── Controllable single-hand fixtures ──────────────────────────────────── */

const USABLE: TrackingQuality = {
  meanHandConfidence: 0.9,
  framesDropped: 0,
  bothHandsSeenRatio: 0,
  usable: true,
};

type Flaw = "none" | "shape" | "place" | "path" | "orientation";

function shapeVec(flawed: boolean, jit: (s: number) => number): Float32Array {
  const v = new Float32Array(63);
  for (let i = 0; i < 63; i++) {
    const base = i % 2 === 0 ? 0.5 : -0.3;
    v[i] = (flawed ? -base : base) + jit(0.01);
  }
  return v;
}

function palm(flawed: boolean): Float32Array {
  // Correct palm faces +z; flawed faces +x (90° off).
  return flawed ? Float32Array.from([1, 0, 0]) : Float32Array.from([0, 0, 1]);
}

function makeFrame(centerX: number, centerY: number, s: Float32Array, o: Float32Array): NormFrame {
  const g = new Float32Array(63);
  for (let k = 0; k < 21; k++) {
    g[k * 3] = centerX;
    g[k * 3 + 1] = centerY;
    g[k * 3 + 2] = 0;
  }
  return {
    tMs: 0,
    present: [false, true],
    handsGlobal: [new Float32Array(63), g],
    handsLocal: [new Float32Array(63), s],
    palmNormal: [new Float32Array(3), o],
    pose: new Float32Array(12),
  };
}

/** A clip: hand starts at x=0 and travels to x=0.4 (the "movement"), at height
 *  yBase, with handshape S and orientation O. Flaws perturb exactly one aspect. */
function makeClip(flaw: Flaw, seed: number): NormFrame[] {
  let a = seed;
  const rnd = () => {
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    return a / 0x7fffffff;
  };
  const jit = (s: number) => (rnd() - 0.5) * 2 * s;

  const yBase = flaw === "place" ? 0.6 : 0.0; // wrong place: shifted in y
  const s = shapeVec(flaw === "shape", jit);
  const o = palm(flaw === "orientation");

  const frames: NormFrame[] = [];
  for (let f = 0; f < ATTEMPT_FRAMES; f++) {
    const t = f / (ATTEMPT_FRAMES - 1);
    let x: number;
    if (flaw === "path") {
      // Same spatial extent, different temporal path: out and back.
      x = t < 0.5 ? 0.8 * t : 0.8 * (1 - t);
    } else {
      x = 0.4 * t; // monotonic
    }
    frames.push(makeFrame(x + jit(0.005), yBase + jit(0.005), s, o));
  }
  return frames;
}

function exemplarOf(frames: NormFrame[]): Exemplar {
  return {
    id: "isl.x.take0",
    signId: "isl.x",
    frames,
    quality: USABLE,
    signerId: "test",
    consent: { granted: true, scope: "prototype", date: "2026-01-01" },
  };
}

function attemptOf(frames: NormFrame[]): Attempt {
  return { frames, durationMs: 1000, quality: USABLE };
}

const REFERENCE = [exemplarOf(makeClip("none", 1))];

/* ── Component attribution ──────────────────────────────────────────────── */

describe("scoreComponents — a correct attempt", () => {
  it("scores every component high", () => {
    const s = scoreComponents(attemptOf(makeClip("none", 42)), REFERENCE)!;
    for (const c of COMPONENTS) expect(s[c]).toBeGreaterThan(0.7);
    expect(s.overall).toBeGreaterThan(0.7);
  });

  it("returns null when there is no usable exemplar", () => {
    expect(scoreComponents(attemptOf(makeClip("none", 1)), [])).toBeNull();
  });
});

describe("scoreComponents — flaw attribution (spec ≥75%)", () => {
  const flaws: [Flaw, Component][] = [
    ["shape", "handshape"],
    ["place", "location"],
    ["path", "movement"],
    ["orientation", "orientation"],
  ];

  it("flags the correct weakest component on ≥75% of flawed attempts", () => {
    let correct = 0;
    let total = 0;
    for (const [flaw, expected] of flaws) {
      for (let i = 0; i < 8; i++) {
        const s = scoreComponents(attemptOf(makeClip(flaw, 1000 + i)), REFERENCE)!;
        let worst: Component = COMPONENTS[0]!;
        for (const c of COMPONENTS) if (s[c] < s[worst]) worst = c;
        if (worst === expected) correct++;
        total++;
      }
    }
    expect(total).toBe(32);
    expect(correct / total).toBeGreaterThanOrEqual(0.75);
  });
});

/* ── Feedback states / guardrails ───────────────────────────────────────── */

const COPY = {
  gotItHeadline: "That’s it.",
  tooDark: "Too dark.",
  unsure: "On me, not you.",
  notRecognized: "I don’t recognise that sign.",
};

function makeSign(): Sign {
  const s = (t: string) => ({ en: t, hi: t });
  return {
    id: "isl.x",
    language: "isl",
    english: "x",
    hindi: "x",
    region: "Test",
    handedness: "one_handed",
    videoUrl: "",
    exemplars: [],
    tolerances: { handshape: 0.7, location: 0.7, movement: 0.7, orientation: 0.7 },
    feedback: {
      handshape: s("shape hint"),
      location: s("place hint"),
      movement: s("move hint"),
      orientation: s("turn hint"),
    },
    signer: { name: "Signer", credit: "" },
    unit: "Right now",
  };
}

const recognized = (id: string | null, ambiguous = false): RecognitionResult => ({
  candidates: id ? [{ signId: id, distance: 0.2, confidence: 0.8 }] : [],
  best: id,
  ambiguous,
});

describe("decideFeedback — guardrails", () => {
  const sign = makeSign();

  it("couldn't see when quality is unusable — no grade", () => {
    const attempt: Attempt = {
      frames: makeClip("none", 1),
      durationMs: 1000,
      quality: { ...USABLE, usable: false },
    };
    const fb = decideFeedback({
      attempt,
      recognition: recognized("isl.x"),
      targetSign: sign,
      scores: scoreComponents(attempt, REFERENCE),
      lang: "en",
      copy: COPY,
    });
    expect(fb.kind).toBe("couldnt_see");
    expect(fb.graded).toBe(false);
    expect(fb.border).toBe("none");
  });

  it("never grades when ambiguous", () => {
    const attempt = attemptOf(makeClip("none", 1));
    const fb = decideFeedback({
      attempt,
      recognition: recognized("isl.x", true),
      targetSign: sign,
      scores: scoreComponents(attempt, REFERENCE),
      lang: "en",
      copy: COPY,
    });
    expect(fb.kind).toBe("unsure");
    expect(fb.graded).toBe(false);
  });

  it("says 'not recognised' when nothing is close enough", () => {
    const attempt = attemptOf(makeClip("none", 1));
    const fb = decideFeedback({
      attempt,
      recognition: recognized(null),
      targetSign: sign,
      scores: null,
      lang: "en",
      copy: COPY,
    });
    expect(fb.kind).toBe("unrecognized");
    expect(fb.graded).toBe(false);
  });

  it("got it on a clean attempt", () => {
    const attempt = attemptOf(makeClip("none", 7));
    const fb = decideFeedback({
      attempt,
      recognition: recognized("isl.x"),
      targetSign: sign,
      scores: scoreComponents(attempt, REFERENCE),
      lang: "en",
      copy: COPY,
    });
    expect(fb.kind).toBe("got_it");
    expect(fb.border).toBe("sage");
  });

  it("not yet names ONE component, in the sign's authored copy", () => {
    const attempt = attemptOf(makeClip("shape", 3));
    const fb = decideFeedback({
      attempt,
      recognition: recognized("isl.x"),
      targetSign: sign,
      scores: scoreComponents(attempt, REFERENCE),
      lang: "en",
      copy: COPY,
    });
    expect(fb.kind).toBe("not_yet");
    expect(fb.component).toBe("handshape");
    expect(fb.message).toBe("shape hint");
    expect(fb.border).toBe("dusk");
  });
});
