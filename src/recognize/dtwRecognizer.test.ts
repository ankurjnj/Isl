import { describe, it, expect } from "vitest";
import { DtwRecognizer, median } from "./dtwRecognizer";
import { dtw } from "./dtw";
import { clipFeatures } from "./features";
import { ATTEMPT_FRAMES } from "@/config/thresholds";
import type { NormFrame, Attempt, TrackingQuality } from "@/landmarks/types";
import type { Sign, Exemplar, SignReference } from "@/content/schema";

/* ── Deterministic fixtures ─────────────────────────────────────────────── */

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A synthetic clip: a fixed per-sign handshape "fingerprint" plus a wrist path,
 *  with optional gaussian-ish noise to simulate a fresh take/attempt. */
function makeClip(signIndex: number, moveAxis: 0 | 1, noise: number, rnd: () => number): NormFrame[] {
  const frames: NormFrame[] = [];
  const jitter = () => (noise === 0 ? 0 : (rnd() - 0.5) * 2 * noise);
  for (let f = 0; f < ATTEMPT_FRAMES; f++) {
    const t = f / (ATTEMPT_FRAMES - 1);
    const local = new Float32Array(63);
    for (let i = 0; i < 63; i++) {
      // Distinct, well-separated fingerprint per sign.
      local[i] = ((i + signIndex) % 4 === 0 ? 0.6 : -0.2) + jitter();
    }
    const global = new Float32Array(63);
    global[moveAxis] = t + jitter(); // wrist travels along one axis
    frames.push({
      tMs: f * 16,
      present: [false, true],
      handsGlobal: [new Float32Array(63), global],
      handsLocal: [new Float32Array(63), local],
      palmNormal: [new Float32Array(3), new Float32Array(3)],
      pose: new Float32Array(12),
    });
  }
  return frames;
}

const USABLE: TrackingQuality = {
  meanHandConfidence: 0.9,
  framesDropped: 0,
  bothHandsSeenRatio: 0,
  usable: true,
};

function exemplar(signId: string, frames: NormFrame[], n: number): Exemplar {
  return {
    id: `${signId}.take${n}`,
    signId,
    frames,
    quality: USABLE,
    signerId: "test",
    consent: { granted: true, scope: "prototype", date: "2026-01-01" },
  };
}

function makeSign(id: string): Sign {
  return {
    id,
    language: "isl",
    english: id,
    hindi: id,
    region: "Test",
    handedness: "one_handed",
    videoUrl: "",
    exemplars: [],
    tolerances: { handshape: 0.7, location: 0.7, movement: 0.7, orientation: 0.7 },
    feedback: {
      handshape: { en: "", hi: "" },
      location: { en: "", hi: "" },
      movement: { en: "", hi: "" },
      orientation: { en: "", hi: "" },
    },
    signer: { name: "Test Signer", credit: "" },
    unit: "Right now",
  };
}

function attemptOf(frames: NormFrame[]): Attempt {
  return { frames, durationMs: 1000, quality: USABLE };
}

/** Three well-separated signs, 3 exemplar takes each. */
function threeSignReferences(): SignReference[] {
  const specs: [string, 0 | 1][] = [
    ["isl.a", 0],
    ["isl.b", 1],
    ["isl.c", 0],
  ];
  return specs.map(([id, axis], k) => {
    const rnd = mulberry32(100 + k);
    const exemplars = [0, 1, 2].map((n) =>
      exemplar(id, makeClip(k, axis, 0.01, rnd), n),
    );
    return { sign: makeSign(id), exemplars };
  });
}

/* ── DTW basics ─────────────────────────────────────────────────────────── */

describe("dtw", () => {
  it("is zero for identical sequences", () => {
    const a = clipFeatures(makeClip(0, 0, 0, mulberry32(1)));
    expect(dtw(a, a).distance).toBeCloseTo(0, 6);
    expect(dtw(a, a).path.length).toBeGreaterThan(0);
  });

  it("tolerates a tempo difference (warp) with a small distance", () => {
    const full = makeClip(0, 0, 0, mulberry32(1));
    // Same sign performed at half speed: repeat each frame, then truncate to 64.
    const slow: NormFrame[] = [];
    for (const f of full) {
      slow.push(f, f);
    }
    const a = clipFeatures(full);
    const b = clipFeatures(slow.slice(0, ATTEMPT_FRAMES));
    const sameTempo = dtw(a, a).distance;
    const warped = dtw(a, b).distance;
    // Warp cost is close to the identity cost, not blown up by the tempo shift.
    expect(warped).toBeLessThan(sameTempo + 0.2);
  });
});

describe("median", () => {
  it("takes the middle, not the min", () => {
    expect(median([0.1, 0.5, 0.9])).toBe(0.5);
    expect(median([0.2, 0.4])).toBeCloseTo(0.3);
  });
});

/* ── Recognition ────────────────────────────────────────────────────────── */

describe("DtwRecognizer", () => {
  it("engine id is dtw-v1", () => {
    expect(new DtwRecognizer().engine).toBe("dtw-v1");
  });

  it("achieves ≥80% top-1 over fresh attempts (spec done-criterion)", async () => {
    const refs = threeSignReferences();
    const rec = new DtwRecognizer();
    await rec.load(refs);

    const axes: Record<string, 0 | 1> = { "isl.a": 0, "isl.b": 1, "isl.c": 0 };
    let correct = 0;
    let total = 0;
    for (let k = 0; k < refs.length; k++) {
      const id = refs[k]!.sign.id;
      for (let attempt = 0; attempt < 5; attempt++) {
        const rnd = mulberry32(9000 + k * 10 + attempt);
        const frames = makeClip(k, axes[id]!, 0.03, rnd);
        const res = await rec.recognize(attemptOf(frames));
        if (res.best === id) correct++;
        total++;
      }
    }
    expect(correct / total).toBeGreaterThanOrEqual(0.8);
  });

  it("returns best=null for a nonsense gesture (honest failure)", async () => {
    const rec = new DtwRecognizer();
    await rec.load(threeSignReferences());
    // Far from every fingerprint and path.
    const nonsense: NormFrame[] = Array.from({ length: ATTEMPT_FRAMES }, (_, f) => ({
      tMs: f * 16,
      present: [true, true],
      handsGlobal: [new Float32Array(63).fill(3), new Float32Array(63).fill(3)],
      handsLocal: [new Float32Array(63).fill(3), new Float32Array(63).fill(3)],
      palmNormal: [new Float32Array(3), new Float32Array(3)],
      pose: new Float32Array(12),
    }));
    const res = await rec.recognize(attemptOf(nonsense));
    expect(res.best).toBeNull();
  });

  it("only compares against loaded (active-unit) signs", async () => {
    const rec = new DtwRecognizer();
    await rec.load([threeSignReferences()[0]!]); // one sign loaded
    const res = await rec.recognize(attemptOf(makeClip(0, 0, 0.01, mulberry32(3))));
    expect(res.candidates.length).toBe(1);
    expect(res.candidates[0]!.signId).toBe("isl.a");
  });
});
