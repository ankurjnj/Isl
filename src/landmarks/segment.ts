import type { NormFrame } from "./types";
import { LEFT, RIGHT } from "./types";
import {
  SEG_START_VELOCITY,
  SEG_SETTLE_VELOCITY,
  SEG_SETTLE_MS,
  SEG_COMMIT_MS,
  SEG_MAX_MS,
  SEG_HIP_Y,
} from "@/config/thresholds";

/**
 * Sign segmentation state machine (Part 6 slice v0.2). PURE.
 *
 *   IDLE → ARMED → RECORDING → SETTLING → DONE
 *
 * A manual record button ALWAYS exists in the UI on top of this: auto-
 * segmentation fails on slow, deliberate signers, which is exactly this user.
 * Feed this NORMALIZED frames — velocities are then in shoulder-widths/sec and
 * distance from the camera stops mattering.
 */

export type SegState = "IDLE" | "ARMED" | "RECORDING" | "SETTLING" | "DONE";

const wristSpeed = (a: NormFrame, b: NormFrame): number => {
  const dtSec = Math.max((b.tMs - a.tMs) / 1000, 1e-3);
  let best = 0;
  for (const slot of [LEFT, RIGHT] as const) {
    if (!a.present[slot] || !b.present[slot]) continue;
    const ax = a.handsGlobal[slot];
    const bx = b.handsGlobal[slot];
    const d = Math.hypot(bx[0]! - ax[0]!, bx[1]! - ax[1]!, bx[2]! - ax[2]!);
    best = Math.max(best, d / dtSec);
  }
  return best;
};

const handAboveHip = (f: NormFrame): boolean => {
  for (const slot of [LEFT, RIGHT] as const) {
    if (f.present[slot] && f.handsGlobal[slot][1]! < SEG_HIP_Y) return true;
  }
  return false;
};

export class Segmenter {
  state: SegState = "IDLE";
  private clip: NormFrame[] = [];
  private prev: NormFrame | null = null;
  private startMs = 0;
  private belowSince: number | null = null; // when speed first dropped below settle
  private settleStartMs: number | null = null;
  private manual = false;

  reset(): void {
    this.state = "IDLE";
    this.clip = [];
    this.prev = null;
    this.startMs = 0;
    this.belowSince = null;
    this.settleStartMs = null;
    this.manual = false;
  }

  /** Force recording to start now (the manual record button). */
  manualStart(f: NormFrame): void {
    if (this.state === "IDLE" || this.state === "ARMED") {
      this.beginRecording(f);
      this.manual = true;
    }
  }

  /** Force recording to finish now (manual stop). */
  manualStop(): void {
    if (this.state === "RECORDING" || this.state === "SETTLING") {
      this.state = "DONE";
    }
  }

  private beginRecording(f: NormFrame): void {
    this.state = "RECORDING";
    this.clip = [f];
    this.startMs = f.tMs;
    this.belowSince = null;
    this.settleStartMs = null;
  }

  /** Advance the machine one frame. Returns the current state. */
  push(f: NormFrame): SegState {
    const speed = this.prev ? wristSpeed(this.prev, f) : 0;
    this.prev = f;

    switch (this.state) {
      case "IDLE":
        if (!this.manual && speed > SEG_START_VELOCITY && handAboveHip(f)) {
          this.state = "ARMED";
          this.clip = [f];
        }
        break;

      case "ARMED":
        // Confirm the motion is real; a one-frame blip falls back to IDLE.
        if (speed >= SEG_SETTLE_VELOCITY) {
          this.beginRecording(this.clip[0] ?? f);
          this.clip.push(f);
        } else {
          this.state = "IDLE";
          this.clip = [];
        }
        break;

      case "RECORDING": {
        this.clip.push(f);
        if (speed < SEG_SETTLE_VELOCITY) {
          if (this.belowSince === null) this.belowSince = f.tMs;
          if (f.tMs - this.belowSince >= SEG_SETTLE_MS) {
            this.state = "SETTLING";
            this.settleStartMs = f.tMs;
          }
        } else {
          this.belowSince = null;
        }
        if (f.tMs - this.startMs >= SEG_MAX_MS) this.state = "DONE";
        break;
      }

      case "SETTLING":
        this.clip.push(f);
        if (speed > SEG_START_VELOCITY) {
          // Motion resumed — this was a mid-sign pause, keep recording.
          this.state = "RECORDING";
          this.belowSince = null;
          this.settleStartMs = null;
        } else if (
          this.settleStartMs !== null &&
          f.tMs - this.settleStartMs >= SEG_COMMIT_MS
        ) {
          this.state = "DONE";
        }
        if (f.tMs - this.startMs >= SEG_MAX_MS) this.state = "DONE";
        break;

      case "DONE":
        break;
    }

    return this.state;
  }

  /** The captured clip. Meaningful once state === "DONE". */
  getClip(): NormFrame[] {
    return this.clip;
  }
}
