import { describe, it, expect } from "vitest";
import { serializeFrame, deserializeFrame } from "./pack";
import type { NormFrame } from "@/landmarks/types";

/**
 * Frame serialization round-trip. NormFrame holds Float32Arrays that don't
 * survive JSON; the pack must rebuild them exactly, or a re-imported exemplar
 * would silently differ from the one that was recorded. (DB-level round-trip is
 * exercised in the app; this covers the fragile part without IndexedDB.)
 */
function sampleFrame(): NormFrame {
  const fill = (n: number, k: number) => Float32Array.from({ length: n }, (_, i) => i * 0.01 + k);
  return {
    tMs: 123,
    present: [true, false],
    handsGlobal: [fill(63, 0.1), fill(63, 0.2)],
    handsLocal: [fill(63, 0.3), fill(63, 0.4)],
    palmNormal: [fill(3, 0.5), fill(3, 0.6)],
    pose: fill(12, 0.7),
  };
}

describe("pack frame serialization", () => {
  it("survives a JSON round-trip byte-for-byte", () => {
    const f = sampleFrame();
    const json = JSON.stringify(serializeFrame(f));
    const back = deserializeFrame(JSON.parse(json));

    expect(back.tMs).toBe(f.tMs);
    expect(back.present).toEqual(f.present);
    expect(Array.from(back.handsGlobal[0])).toEqual(Array.from(f.handsGlobal[0]));
    expect(Array.from(back.handsLocal[1])).toEqual(Array.from(f.handsLocal[1]));
    expect(Array.from(back.palmNormal[0])).toEqual(Array.from(f.palmNormal[0]));
    expect(Array.from(back.pose)).toEqual(Array.from(f.pose));
    expect(back.handsGlobal[0]).toBeInstanceOf(Float32Array);
  });
});
