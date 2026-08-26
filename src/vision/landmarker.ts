import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type HandLandmarkerResult,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type { RawFrame, Landmark } from "@/landmarks/types";
import { WASM_ROOT, HAND_MODEL, POSE_MODEL } from "./paths";

/**
 * MediaPipe setup and per-frame detection (Part 6 slice v0.1). This is the ONE
 * place the mirror-handedness fix lives (see below).
 */

export type Landmarkers = {
  hand: HandLandmarker;
  pose: PoseLandmarker;
  latency: { hand: number; pose: number };
};

export async function createLandmarkers(): Promise<Landmarkers> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
  const [hand, pose] = await Promise.all([
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL },
      numHands: 2,
      runningMode: "VIDEO",
    }),
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL },
      numPoses: 1,
      runningMode: "VIDEO",
    }),
  ]);
  return { hand, pose, latency: { hand: 0, pose: 0 } };
}

function toLandmarks(pts: { x: number; y: number; z: number; visibility?: number }[]): Landmark[] {
  return pts.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility }));
}

/**
 * Detect one frame. `tMs` MUST increase monotonically or MediaPipe throws.
 *
 * Mirror-handedness fix (Part 6 v0.1): MediaPipe reports handedness from the
 * IMAGE's perspective. Our preview is a mirrored selfie, so MediaPipe's "Left"
 * is the user's RIGHT hand. We swap here, once, so everything downstream can
 * treat hands.left / hands.right as the user's own hands.
 */
export function detect(l: Landmarkers, video: HTMLVideoElement, tMs: number): RawFrame {
  const t0 = performance.now();
  const handRes: HandLandmarkerResult = l.hand.detectForVideo(video, tMs);
  const t1 = performance.now();
  const poseRes: PoseLandmarkerResult = l.pose.detectForVideo(video, tMs);
  const t2 = performance.now();
  l.latency.hand = t1 - t0;
  l.latency.pose = t2 - t1;

  let userLeft: Landmark[] | null = null;
  let userRight: Landmark[] | null = null;
  const handednesses = handRes.handednesses ?? [];
  handRes.landmarks.forEach((pts, i) => {
    const label = handednesses[i]?.[0]?.categoryName; // "Left" | "Right" (image frame)
    const lm = toLandmarks(pts);
    // Swap: image-"Left" is the user's right hand, and vice versa.
    if (label === "Left") userRight = lm;
    else if (label === "Right") userLeft = lm;
    else if (!userRight) userRight = lm;
    else userLeft = lm;
  });

  const pose = poseRes.landmarks?.[0] ? toLandmarks(poseRes.landmarks[0]!) : null;

  return { tMs, hands: { left: userLeft, right: userRight }, pose };
}

export function closeLandmarkers(l: Landmarkers): void {
  l.hand.close();
  l.pose.close();
}
