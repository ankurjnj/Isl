import { useEffect, useRef } from "react";
import type { NormFrame } from "@/landmarks/types";

/**
 * Loops a recorded exemplar as a skeleton animation — used as the reference in
 * the Watch phase when a Deaf signer's reference VIDEO isn't attached yet. It
 * shows the signer's OWN recorded landmarks (never an invented form, Part 7 §1),
 * drawn from the normalized handsGlobal + pose.
 */

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
// normPose keeps [Lshoulder, Rshoulder, Lelbow, Relbow] at indices 0..3.
const POSE_CONNECTIONS: [number, number][] = [[0, 1], [0, 2], [1, 3]];

// Map shoulder-relative coords into the canvas.
const VX0 = -1.3;
const VX1 = 1.3;
const VY0 = -1.6;
const VY1 = 2.0;

export function SkeletonPlayer(props: {
  frames: NormFrame[];
  playing?: boolean;
  slowMo?: boolean;
}) {
  const { frames, playing = true, slowMo = false } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (frames.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let i = 0;
    let last = performance.now();
    const stepMs = slowMo ? 90 : 33;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      const f = frames[i];
      if (f) drawNorm(ctx, f, w, h);
      const now = performance.now();
      if (playing && now - last >= stepMs) {
        last = now;
        i = (i + 1) % frames.length;
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [frames, playing, slowMo]);

  return <canvas ref={canvasRef} width={300} height={300} className="skeleton-player" />;
}

function mapX(x: number, w: number): number {
  return ((x - VX0) / (VX1 - VX0)) * w;
}
function mapY(y: number, h: number): number {
  return ((y - VY0) / (VY1 - VY0)) * h;
}

function drawNorm(ctx: CanvasRenderingContext2D, f: NormFrame, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  // Pose in sage.
  ctx.strokeStyle = "#8FBF9F";
  ctx.fillStyle = "#8FBF9F";
  for (const [a, b] of POSE_CONNECTIONS) {
    const ax = f.pose[a * 3];
    const ay = f.pose[a * 3 + 1];
    const bx = f.pose[b * 3];
    const by = f.pose[b * 3 + 1];
    if (ax === undefined || bx === undefined) continue;
    seg(ctx, mapX(ax, w), mapY(ay!, h), mapX(bx, w), mapY(by!, h));
  }

  // Hands in haldi.
  ctx.strokeStyle = "#E9A23B";
  ctx.fillStyle = "#E9A23B";
  for (const slot of [0, 1] as const) {
    if (!f.present[slot]) continue;
    const g = f.handsGlobal[slot];
    for (const [a, b] of HAND_CONNECTIONS) {
      seg(ctx, mapX(g[a * 3]!, w), mapY(g[a * 3 + 1]!, h), mapX(g[b * 3]!, w), mapY(g[b * 3 + 1]!, h));
    }
    for (let k = 0; k < 21; k++) {
      ctx.beginPath();
      ctx.arc(mapX(g[k * 3]!, w), mapY(g[k * 3 + 1]!, h), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function seg(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
