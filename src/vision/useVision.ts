import { useCallback, useEffect, useRef, useState } from "react";
import type { RawFrame } from "@/landmarks/types";
import { createLandmarkers, detect, closeLandmarkers, type Landmarkers } from "./landmarker";
import { startCamera, stopCamera, CameraStartError, type CameraError } from "./camera";
import { drawSkeleton } from "./draw";

export type VisionStatus = "idle" | "loading" | "running" | "error";
export type VisionErrorKind = CameraError | "wasm_failure";

export type VisionHandle = {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  status: VisionStatus;
  error: VisionErrorKind | null;
  fps: number;
  latency: { hand: number; pose: number };
  retry: () => void;
};

/**
 * Camera + MediaPipe RAF loop (Part 6 slice v0.1). Draws the skeleton overlay
 * and calls `onFrame` with each RawFrame (already mirror-fixed) so a consumer
 * can feed a Segmenter / recognizer. Timestamps increase monotonically, as
 * MediaPipe requires.
 */
export function useVision(opts: {
  enabled: boolean;
  draw?: boolean;
  onFrame?: (frame: RawFrame) => void;
}): VisionHandle {
  const { enabled, draw = true, onFrame } = opts;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const [status, setStatus] = useState<VisionStatus>("idle");
  const [error, setError] = useState<VisionErrorKind | null>(null);
  const [fps, setFps] = useState(0);
  const latencyRef = useRef({ hand: 0, pose: 0 });
  const [latency, setLatency] = useState({ hand: 0, pose: 0 });
  const [nonce, setNonce] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setStatus("idle");
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let stream: MediaStream | null = null;
    let landmarkers: Landmarkers | null = null;
    let raf = 0;
    let cancelled = false;
    let lastTs = 0;
    let frames = 0;
    let fpsClock = performance.now();

    (async () => {
      setStatus("loading");
      const video = videoRef.current;
      if (!video) return;
      try {
        landmarkers = await createLandmarkers();
      } catch {
        if (!cancelled) {
          setError("wasm_failure");
          setStatus("error");
        }
        return;
      }
      try {
        stream = await startCamera(video);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof CameraStartError ? err.kind : "unsupported");
          setStatus("error");
        }
        return;
      }
      if (cancelled) return;
      setStatus("running");

      const tick = () => {
        if (cancelled || !landmarkers || !video) return;
        // Monotonic, strictly-increasing timestamps.
        let ts = Math.round(performance.now());
        if (ts <= lastTs) ts = lastTs + 1;
        lastTs = ts;

        if (video.readyState >= 2) {
          const frame = detect(landmarkers, video, ts);
          onFrameRef.current?.(frame);

          if (draw && canvasRef.current) {
            const c = canvasRef.current;
            if (c.width !== video.videoWidth) c.width = video.videoWidth;
            if (c.height !== video.videoHeight) c.height = video.videoHeight;
            const ctx = c.getContext("2d");
            if (ctx) drawSkeleton(ctx, frame, c.width, c.height);
          }

          frames++;
          const now = performance.now();
          if (now - fpsClock >= 500) {
            setFps(Math.round((frames * 1000) / (now - fpsClock)));
            setLatency({ ...landmarkers.latency });
            latencyRef.current = landmarkers.latency;
            frames = 0;
            fpsClock = now;
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stopCamera(stream);
      if (landmarkers) closeLandmarkers(landmarkers);
    };
  }, [enabled, draw, nonce]);

  return { videoRef, canvasRef, status, error, fps, latency, retry };
}
