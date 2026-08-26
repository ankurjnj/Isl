/**
 * Articulated hand rendering — the "digital hand".
 *
 * Draws MediaPipe's 21 landmarks as a real hand (filled palm, tapered fingers,
 * depth shading) rather than dots and lines, so a parent can actually read the
 * handshape. This module is only the RENDERER: it draws whatever landmark data
 * it is handed. It never synthesises a sign — sign forms come from recorded
 * exemplars (Part 5.2 / Part 7 §1).
 */

export type Pt = { x: number; y: number; z: number };

export type HandPalette = {
  /** Nearest-to-camera tone. */
  near: string;
  /** Furthest tone; segments are shaded between the two by depth. */
  far: string;
  /** Fingertip / joint accent. */
  accent: string;
};

/** Landmark chains, each starting at the wrist. */
const FINGERS: number[][] = [
  [0, 1, 2, 3, 4], // thumb
  [0, 5, 6, 7, 8], // index
  [0, 9, 10, 11, 12], // middle
  [0, 13, 14, 15, 16], // ring
  [0, 17, 18, 19, 20], // pinky
];

/** Outline of the palm, in order. */
const PALM = [0, 1, 5, 9, 13, 17];

const TIPS = [4, 8, 12, 16, 20];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Blend two hex colours; t = 0 → a, t = 1 → b. */
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  const r = Math.round(r1 + (r2 - r1) * k);
  const g = Math.round(g1 + (g2 - g1) * k);
  const bl = Math.round(b1 + (b2 - b1) * k);
  return `rgb(${r},${g},${bl})`;
}

function stroke(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, width: number, colour: string) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/**
 * Draw one hand. `pts` must be 21 landmarks already mapped into canvas pixels.
 * Depth (z) shades the segments so a hand turned toward or away from the
 * viewer still reads correctly — orientation is one of the four things a
 * learner has to get right.
 */
export function drawHand(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  palette: HandPalette,
): void {
  if (pts.length < 21) return;

  const wrist = pts[0]!;
  const midKnuckle = pts[9]!;
  // Hand size in pixels drives every stroke width, so the drawing scales with
  // the canvas and with how far away the signer is.
  const scale = Math.hypot(midKnuckle.x - wrist.x, midKnuckle.y - wrist.y) || 40;

  // Depth range across this hand, for shading.
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const p of pts) {
    if (p.z < zMin) zMin = p.z;
    if (p.z > zMax) zMax = p.z;
  }
  const zSpan = zMax - zMin || 1;
  // MediaPipe z is negative toward the camera, so smaller z = nearer.
  const toneAt = (z: number) => mix(palette.near, palette.far, (z - zMin) / zSpan);

  ctx.save();
  ctx.lineJoin = "round";

  // 1. Palm as a filled, rounded polygon.
  const palmTone = toneAt(midKnuckle.z);
  ctx.fillStyle = palmTone;
  ctx.strokeStyle = palmTone;
  ctx.lineWidth = scale * 0.38;
  ctx.beginPath();
  PALM.forEach((i, k) => {
    const p = pts[i]!;
    if (k === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.fill();

  // 2. Fingers as tapered capsules, drawn far-to-near so nearer fingers overlap.
  const order = FINGERS.map((chain, i) => ({ chain, i, z: pts[chain[2]!]!.z }))
    .sort((a, b) => b.z - a.z);

  for (const { chain } of order) {
    for (let s = 1; s < chain.length; s++) {
      const a = pts[chain[s - 1]!]!;
      const b = pts[chain[s]!]!;
      const t = s / (chain.length - 1);
      // Taper from knuckle to tip.
      const width = scale * (0.34 - 0.15 * t);
      stroke(ctx, a, b, width, toneAt((a.z + b.z) / 2));
    }
  }

  // 3. Fingertips, so the shape reads at a glance.
  for (const i of TIPS) {
    const p = pts[i]!;
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(p.x, p.y, scale * 0.085, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
