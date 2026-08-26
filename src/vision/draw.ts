import type { RawFrame } from "@/landmarks/types";
import { drawHand, type Pt, type HandPalette } from "./handArt";

/**
 * Live camera overlay. Draws the same articulated hand as the Learn screen, so
 * what a parent copies and what they see themselves doing look alike.
 * Coordinates are image-normalized (0..1); the canvas carries the same CSS
 * mirror transform as the video, so we draw in raw image space.
 */

// Pose: shoulders (11-12) and upper arms (11-13, 12-14).
const POSE_LINKS: [number, number][] = [
  [11, 12],
  [11, 13],
  [12, 14],
];

const PALETTE: HandPalette = {
  near: "#FFD79A",
  far: "#C9862A",
  accent: "#FFF4E2",
};

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: RawFrame,
  w: number,
  h: number,
): void {
  ctx.clearRect(0, 0, w, h);

  // Body context first, behind the hands.
  if (frame.pose) {
    ctx.strokeStyle = "rgba(143, 191, 159, 0.75)";
    ctx.lineWidth = Math.max(4, w * 0.008);
    ctx.lineCap = "round";
    for (const [a, b] of POSE_LINKS) {
      const pa = frame.pose[a];
      const pb = frame.pose[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x * w, pa.y * h);
      ctx.lineTo(pb.x * w, pb.y * h);
      ctx.stroke();
    }
  }

  for (const hand of [frame.hands.left, frame.hands.right]) {
    if (!hand || hand.length < 21) continue;
    const pts: Pt[] = hand.map((p) => ({ x: p.x * w, y: p.y * h, z: p.z }));
    drawHand(ctx, pts, PALETTE);
  }
}
