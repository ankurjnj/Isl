import { useCallback, useRef, useState } from "react";
import type { RawFrame, Attempt } from "@/landmarks/types";
import { normalizeFrame } from "@/landmarks/normalize";
import { Segmenter } from "@/landmarks/segment";
import { buildAttempt } from "@/landmarks/attempt";
import { trackingQuality } from "@/landmarks/quality";

export type RecorderPhase = "idle" | "countdown" | "recording" | "preview";

/**
 * Drives one take: a countdown, capture, then a preview to keep or discard
 * (Part 6 slice v0.3). Auto-stops on the Segmenter's settle, but a manual Stop
 * always works — auto-segmentation fails on slow deliberate signers.
 *
 * Raw frames are buffered in a ref so per-frame capture doesn't re-render; the
 * live tracking level updates on a throttle for the meter.
 */
export function useRecorder() {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [countdown, setCountdown] = useState(0);
  const [preview, setPreview] = useState<Attempt | null>(null);
  const [liveLevel, setLiveLevel] = useState(0);

  const buffer = useRef<RawFrame[]>([]);
  const seg = useRef(new Segmenter());
  const started = useRef(false);
  const lastMeter = useRef(0);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const finish = useCallback(() => {
    const raw = buffer.current;
    setPhase("preview");
    setPreview(raw.length ? buildAttempt(raw) : null);
  }, []);

  const start = useCallback(() => {
    setPreview(null);
    buffer.current = [];
    seg.current.reset();
    started.current = false;
    setPhase("countdown");
    let n = 3;
    setCountdown(n);
    countdownTimer.current = setInterval(() => {
      n -= 1;
      setCountdown(n);
      if (n <= 0) {
        if (countdownTimer.current) clearInterval(countdownTimer.current);
        setPhase("recording");
      }
    }, 700);
  }, []);

  const stop = useCallback(() => {
    if (phase === "recording") {
      seg.current.manualStop();
      finish();
    }
  }, [phase, finish]);

  const onFrame = useCallback(
    (raw: RawFrame) => {
      if (phase !== "recording") return;
      buffer.current.push(raw);
      const nf = normalizeFrame(raw);
      if (!started.current) {
        seg.current.manualStart(nf);
        started.current = true;
      }
      const state = seg.current.push(nf);

      // Throttle the live meter update (~10 Hz).
      if (raw.tMs - lastMeter.current > 100) {
        lastMeter.current = raw.tMs;
        const recent = buffer.current.slice(-12);
        const q = trackingQuality(recent);
        setLiveLevel(q.usable ? Math.min(1, q.meanHandConfidence) : q.bothHandsSeenRatio * 0.5);
      }

      if (state === "DONE") finish();
    },
    [phase, finish],
  );

  const clearPreview = useCallback(() => {
    setPreview(null);
    setPhase("idle");
  }, []);

  return {
    phase,
    countdown,
    preview,
    liveLevel,
    start,
    stop,
    onFrame,
    clearPreview,
  };
}
