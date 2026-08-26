# Build progress

Slices from Part 6 of the spec. Each ends in a running app; the tree is never
left broken.

| Slice | What | Status |
| ----- | ---- | ------ |
| Scaffold | Project, architecture, design tokens, i18n, pure-module lint boundaries, no-audio rule | ✅ done |
| v0.1 | Camera + skeleton (MediaPipe hand + pose, RAF loop, FPS/latency, mirror fix) | ✅ code-complete¹ |
| v0.2 | Normalization + segmentation + two-handed identity smoothing, with tests | ✅ done (20 tests) |
| v0.3 | Studio mode (record exemplars, quality gate, export/import pack with consent) | ✅ code-complete¹ |
| v0.4 | DTW recognition (`SignRecognizer`, Sakoe-Chiba band, reject/ambiguous), tests | ✅ done (7 tests) |
| v0.5 | Component scoring (four scores, min-weighted overall, weakest-component feedback), tests | ✅ done (8 tests) |
| v0.6 | Three-phase lesson + home + progress store + review queue | ✅ code-complete¹ |
| v0.7 | Hindi throughout + the lamp + reduced-motion + 200% zoom | ✅ done |
| v0.8 | With your child | ✅ code-complete¹ |
| v1.0 | Harden + demo (onboarding, error states, offline, focus) | ✅ done |

¹ **code-complete** = written to spec, typechecks/lints/builds, and unit-tested
where the logic is pure. The live camera + MediaPipe path and the on-device
empirical calibrations still need a real mid-range Android — they cannot be
exercised in this headless build. See the caveat below.

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

## Before a public demo (must run on a real device)

1. Drop the MediaPipe wasm + models into `public/mediapipe/` (see its README).
2. Subset + self-host the two Devanagari fonts under 180KB
   (`src/ui/styles/fonts/README.md`).
3. Confirm ≥20fps sustained on a mid-range Android (v0.1).
4. Calibrate the placeholder thresholds in `src/config/thresholds.ts`:
   - `REJECT_THRESHOLD` / `AMBIGUOUS_MARGIN` — 20 correct vs 20 wrong, set in
     the valley (v0.4).
   - component `*_SCALE` + `COMPONENT_PASS` / `OVERALL_PASS` against the flawed
     fixtures (v0.5).
5. Measure the lamp landmark-confidence delta (surface on vs off) in a dark
   room; if the lamp doesn't help, say so — the design signature depends on it.
6. Book the Deaf ISL signer recording session so real exemplars exist. Do not
   demo a hearing person's approximations as reference content.
