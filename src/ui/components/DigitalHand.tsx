import { useEffect, useRef } from "react";
import type { NormFrame } from "@/landmarks/types";
import { drawHand, type Pt, type HandPalette } from "@/vision/handArt";

/**
 * The digital hand — plays a recorded sign back as an articulated hand so a
 * parent can watch and copy it without a camera.
 *
 * It renders the SIGNER'S OWN recorded landmarks. It does not synthesise or
 * guess a sign form (Part 5.2 / Part 7 §1); with no data it draws nothing and
 * the caller shows an empty state.
 */

// normPose keeps [Lshoulder, Rshoulder, Lelbow, Relbow] at indices 0..3.
const POSE_LINKS: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 3],
];

// Viewport in shoulder-relative units.
const VX0 = -1.35;
const VX1 = 1.35;
const VY0 = -1.7;
const VY1 = 1.9;

const PALETTE: HandPalette = {
  near: "#F7CE96",
  far: "#A8641F",
  accent: "#FFF4E2",
};

export function DigitalHand(props: {
  frames: NormFrame[];
  playing?: boolean;
  slowMo?: boolean;
}) {
  const { frames, playing = true, slowMo = false } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Crisp on high-DPI phones.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 300;
    const cssH = canvas.clientHeight || 300;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    if (frames.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    let raf = 0;
    let i = 0;
    let last = performance.now();
    const stepMs = slowMo ? 90 : 33;

    const mapX = (x: number) => ((x - VX0) / (VX1 - VX0)) * cssW * dpr;
    const mapY = (y: number) => ((y - VY0) / (VY1 - VY0)) * cssH * dpr;

    const render = () => {
      const f = frames[i];
      if (f) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Faint shoulders/elbows for body context — the hand's LOCATION
        // relative to the body is half of what a sign means.
        ctx.strokeStyle = "rgba(168, 174, 205, 0.35)";
        ctx.lineWidth = 6 * dpr;
        ctx.lineCap = "round";
        for (const [a, b] of POSE_LINKS) {
          const ax = f.pose[a * 3];
          const ay = f.pose[a * 3 + 1];
          const bx = f.pose[b * 3];
          const by = f.pose[b * 3 + 1];
          if (ax === undefined || bx === undefined) continue;
          ctx.beginPath();
          ctx.moveTo(mapX(ax), mapY(ay!));
          ctx.lineTo(mapX(bx), mapY(by!));
          ctx.stroke();
        }

        for (const slot of [0, 1] as const) {
          if (!f.present[slot]) continue;
          const g = f.handsGlobal[slot];
          const pts: Pt[] = [];
          for (let k = 0; k < 21; k++) {
            pts.push({ x: mapX(g[k * 3]!), y: mapY(g[k * 3 + 1]!), z: g[k * 3 + 2]! });
          }
          drawHand(ctx, pts, PALETTE);
        }
      }

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

  return <canvas ref={canvasRef} className="digital-hand" />;
}
