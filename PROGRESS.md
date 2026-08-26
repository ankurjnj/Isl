# Build progress

Slices from Part 6 of the spec. Each ends in a running app; the tree is never
left broken.

| Slice | What | Status |
| ----- | ---- | ------ |
| Scaffold | Project, architecture, design tokens, i18n, pure-module lint boundaries, no-audio rule | ✅ done |
| v0.1 | Camera + skeleton (MediaPipe hand + pose, RAF loop, FPS/latency, mirror fix) | ⏳ |
| v0.2 | Normalization + segmentation + two-handed identity smoothing, with tests | ⏳ |
| v0.3 | Studio mode (record exemplars, quality gate, export/import pack with consent) | ⏳ |
| v0.4 | DTW recognition (`SignRecognizer`, Sakoe-Chiba band, reject/ambiguous), tests | ⏳ |
| v0.5 | Component scoring (four scores, min-weighted overall, weakest-component feedback), tests | ⏳ |
| v0.6 | Three-phase lesson + home + progress store + review queue | ⏳ |
| v0.7 | Hindi throughout + the lamp + reduced-motion + 200% zoom | ⏳ |
| v0.8 | With your child | ⏳ |
| v1.0 | Harden + demo (onboarding, error states, offline, focus) | ⏳ |

## Notes / decisions

- **Environment caveat:** this repo is being built headless — MediaPipe camera
  and on-device landmark capture cannot be exercised here. Vision-dependent
  slices are written to spec and unit-tested where the logic is pure, but the
  live camera path and the empirical calibrations (REJECT_THRESHOLD,
  COMPONENT_PASS, the lamp landmark-confidence delta) must be run on a real
  mid-range Android before any public demo. Placeholders are marked in
  `src/config/thresholds.ts`.
- **Empty vocabulary is intentional** (Part 5.2, Part 7 §1). No exemplars ship;
  Studio mode is the only way to add signs, and it requires a Deaf signer.
