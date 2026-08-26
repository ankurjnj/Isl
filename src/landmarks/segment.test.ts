import { describe, it, expect } from "vitest";
import { Segmenter } from "./segment";
import { normFrameAt } from "./testkit";
import type { NormFrame } from "./types";

const DT = 33; // ~30 fps

/** Build a run where the wrist moves `step` shoulder-widths per frame for
 *  `moveN` frames, then holds still for `holdN` frames. */
function run(step: number, moveN: number, holdN: number, y = 0.4): NormFrame[] {
  const frames: NormFrame[] = [];
  let x = 0.2;
  let t = 0;
  // A few idle frames first.
  for (let i = 0; i < 4; i++) frames.push(normFrameAt((t += DT), [x, y, 0]));
  for (let i = 0; i < moveN; i++) {
    x += step;
    frames.push(normFrameAt((t += DT), [x, y, 0]));
  }
  for (let i = 0; i < holdN; i++) frames.push(normFrameAt((t += DT), [x, y, 0]));
  return frames;
}

function feed(seg: Segmenter, frames: NormFrame[]) {
  const states = frames.map((f) => seg.push(f));
  return states;
}

describe("Segmenter — auto", () => {
  it("auto-starts on a fast move above hip and settles to DONE", () => {
    const seg = new Segmenter();
    // 0.05 sw/frame over 33ms ≈ 1.5 sw/s, well over the 0.8 start velocity.
    const states = feed(seg, run(0.05, 8, 25));
    expect(states).toContain("RECORDING");
    expect(seg.state).toBe("DONE");
    expect(seg.getClip().length).toBeGreaterThan(8);
  });

  it("does NOT auto-start for a slow deliberate signer", () => {
    const seg = new Segmenter();
    // 0.004 sw/frame ≈ 0.12 sw/s, below the 0.8 start velocity.
    const states = feed(seg, run(0.004, 20, 5));
    expect(states.every((s) => s === "IDLE")).toBe(true);
    expect(seg.state).toBe("IDLE");
  });

  it("does not auto-start when hands are below hip level", () => {
    const seg = new Segmenter();
    const states = feed(seg, run(0.05, 8, 5, /* y below hip */ 1.8));
    expect(states.every((s) => s === "IDLE")).toBe(true);
  });
});

describe("Segmenter — manual", () => {
  it("manual start records a slow signer that auto would ignore", () => {
    const seg = new Segmenter();
    const frames = run(0.004, 20, 2);
    seg.manualStart(frames[0]!);
    const states = feed(seg, frames.slice(1));
    expect(seg.state === "RECORDING" || states.includes("RECORDING")).toBe(true);
    seg.manualStop();
    expect(seg.state).toBe("DONE");
    expect(seg.getClip().length).toBeGreaterThan(0);
  });
});

describe("Segmenter — hard cap", () => {
  it("commits after the 4s hard cap even if motion never settles", () => {
    const seg = new Segmenter();
    // Keep moving fast forever; without the cap this would never settle.
    const frames: NormFrame[] = [];
    let x = 0.2;
    let t = 0;
    for (let i = 0; i < 200; i++) {
      x += 0.05;
      frames.push(normFrameAt((t += DT), [x % 2, 0.4, 0]));
    }
    feed(seg, frames);
    expect(seg.state).toBe("DONE");
  });
});
