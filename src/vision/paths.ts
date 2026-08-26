/**
 * Locations of the MediaPipe wasm + model files. Self-hosted so the app works
 * fully offline after first load (Part 2 §6, Part 6 v1.0) — nothing is fetched
 * from a CDN at runtime. Place the files under public/mediapipe/ (see
 * public/mediapipe/README.md); Vite serves public/ at the web root.
 */
export const WASM_ROOT = "/mediapipe/wasm";
export const HAND_MODEL = "/mediapipe/hand_landmarker.task";
export const POSE_MODEL = "/mediapipe/pose_landmarker_lite.task";
