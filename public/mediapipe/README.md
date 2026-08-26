# MediaPipe assets (self-hosted)

These files are **not** committed (they're large binaries, ~10MB total, and
version-pinned to `@mediapipe/tasks-vision`). Fetch them once and drop them here
so the app runs fully offline after first load — no CDN at runtime (Part 2 §6,
Part 6 v1.0).

Expected layout (referenced by `src/vision/paths.ts`):

```
public/mediapipe/
├── wasm/                        # contents of node_modules/@mediapipe/tasks-vision/wasm
│   ├── vision_wasm_internal.wasm
│   ├── vision_wasm_internal.js
│   └── …
├── hand_landmarker.task
└── pose_landmarker_lite.task
```

## Fetch

```sh
# wasm — copy from the installed package (keeps versions in lockstep)
mkdir -p public/mediapipe/wasm
cp node_modules/@mediapipe/tasks-vision/wasm/* public/mediapipe/wasm/

# models
cd public/mediapipe
curl -LO https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
curl -LO https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
```

These sizes do **not** count against the 6MB first-load app budget — the app
shell is what must stay under 6MB. The models load on first camera use and are
then cached by the service worker (v1.0).
