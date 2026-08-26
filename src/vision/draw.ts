import type { RawFrame } from "@/landmarks/types";

/**
 * Canvas skeleton overlay (Part 6 slice v0.1): both hands plus shoulders and
 * elbows. Coordinates are image-normalized (0..1); the canvas is mirrored by
 * the same CSS transform as the video, so we draw in raw image space and the
 * mirror lines up.
 */

// MediaPipe hand topology.
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index
  [5, 9], [9, 10], [10, 11], [11, 12], // middle
  [9, 13], [13, 14], [14, 15], [15, 16], // ring
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20], // pinky + palm
];

// Pose: shoulders (11-12) and upper arms (11-13, 12-14).
const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [12, 14],
];

// Design tokens (kept in sync with tokens.css).
const HALDI = "#E9A23B";
const SAGE = "#8FBF9F";

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: RawFrame,
  w: number,
  h: number,
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  for (const hand of [frame.hands.left, frame.hands.right]) {
    if (!hand) continue;
    ctx.strokeStyle = HALDI;
    ctx.fillStyle = HALDI;
    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = hand[a];
      const pb = hand[b];
      if (!pa || !pb) continue;
      line(ctx, pa.x * w, pa.y * h, pb.x * w, pb.y * h);
    }
    for (const p of hand) dot(ctx, p.x * w, p.y * h, 3);
  }

  if (frame.pose) {
    ctx.strokeStyle = SAGE;
    ctx.fillStyle = SAGE;
    for (const [a, b] of POSE_CONNECTIONS) {
      const pa = frame.pose[a];
      const pb = frame.pose[b];
      if (!pa || !pb) continue;
      line(ctx, pa.x * w, pa.y * h, pb.x * w, pb.y * h);
    }
    for (const i of [11, 12, 13, 14]) {
      const p = frame.pose[i];
      if (p) dot(ctx, p.x * w, p.y * h, 4);
    }
  }
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
