import type { NormFrame } from "./types";
import { ATTEMPT_FRAMES } from "@/config/thresholds";

/**
 * Resample a normalized clip to exactly N frames by linear interpolation
 * (Part 6 slice v0.2). PURE. A 20-frame and a 120-frame clip both come out at
 * N, so tempo differences never reach the recognizer as length differences.
 */

function lerpArray(a: Float32Array, b: Float32Array, t: number): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i]! + (b[i]! - a[i]!) * t;
  return out;
}

function lerpFrame(a: NormFrame, b: NormFrame, t: number): NormFrame {
  return {
    tMs: a.tMs + (b.tMs - a.tMs) * t,
    // Presence is boolean; take the nearer frame's flag.
    present: (t < 0.5 ? a.present : b.present).slice() as [boolean, boolean],
    handsGlobal: [
      lerpArray(a.handsGlobal[0], b.handsGlobal[0], t),
      lerpArray(a.handsGlobal[1], b.handsGlobal[1], t),
    ],
    handsLocal: [
      lerpArray(a.handsLocal[0], b.handsLocal[0], t),
      lerpArray(a.handsLocal[1], b.handsLocal[1], t),
    ],
    palmNormal: [
      lerpArray(a.palmNormal[0], b.palmNormal[0], t),
      lerpArray(a.palmNormal[1], b.palmNormal[1], t),
    ],
    pose: lerpArray(a.pose, b.pose, t),
  };
}

export function resample(frames: NormFrame[], n: number = ATTEMPT_FRAMES): NormFrame[] {
  if (frames.length === 0) {
    throw new Error("resample: cannot resample an empty clip");
  }
  if (frames.length === 1) {
    return Array.from({ length: n }, () => frames[0]!);
  }

  const out: NormFrame[] = [];
  const last = frames.length - 1;
  for (let i = 0; i < n; i++) {
    const pos = (i * last) / (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, last);
    const frac = pos - lo;
    out.push(frac === 0 ? frames[lo]! : lerpFrame(frames[lo]!, frames[hi]!, frac));
  }
  return out;
}
