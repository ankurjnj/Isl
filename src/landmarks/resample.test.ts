import { describe, it, expect } from "vitest";
import { resample } from "./resample";
import { normFrameAt } from "./testkit";

describe("resample", () => {
  it("resamples a 20-frame clip to exactly 64", () => {
    const clip = Array.from({ length: 20 }, (_, i) => normFrameAt(i * 30, [i / 20, 0, 0]));
    expect(resample(clip).length).toBe(64);
  });

  it("resamples a 120-frame clip to exactly 64", () => {
    const clip = Array.from({ length: 120 }, (_, i) => normFrameAt(i * 8, [i / 120, 0, 0]));
    expect(resample(clip).length).toBe(64);
  });

  it("preserves endpoints and stays monotonic along a linear path", () => {
    const clip = Array.from({ length: 10 }, (_, i) => normFrameAt(i * 10, [i, 0, 0]));
    const out = resample(clip);
    expect(out[0]!.handsGlobal[1][0]).toBeCloseTo(0, 5);
    expect(out[63]!.handsGlobal[1][0]).toBeCloseTo(9, 5);
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.handsGlobal[1][0]!).toBeGreaterThanOrEqual(out[i - 1]!.handsGlobal[1][0]!);
    }
  });

  it("repeats a single frame and never NaNs", () => {
    const out = resample([normFrameAt(0, [1, 2, 3])]);
    expect(out.length).toBe(64);
    expect(out.every((f) => f.handsGlobal[1].every((x) => Number.isFinite(x)))).toBe(true);
  });

  it("throws on an empty clip", () => {
    expect(() => resample([])).toThrow();
  });
});
