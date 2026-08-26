# Aangan

An Indian Sign Language app for hearing parents of deaf children under five.

> Working name: **Aangan** (आँगन) — the courtyard at the centre of a home,
> where the family gathers. The name lives in one place, `src/config/brand.ts`;
> rename freely.

This is a proof of concept built from `SPEC.pdf`. It teaches a parent to sign
the words they need **tonight** — milk, hurt, I love you — beside a sleeping
child, in five-minute fragments, one-handed, in a dim room.

## What makes it different

- **Silent by design.** Zero audio anywhere. The child is deaf; the parent
  practises next to a sleeping child. Enforced by a lint rule.
- **Never confidently wrong.** When the recognizer is unsure, it says so. A
  wrong grade teaches a wrong sign to a parent who has no one to correct them.
- **No guilt mechanics.** No streaks, no hearts, no red. Progress is only ever
  "what your child can now understand".
- **On-device only.** Video never leaves the phone. There is no upload path,
  not even a disabled one.
- **Empty by default.** The app ships with no vocabulary. Real sign forms come
  only from a Deaf ISL signer recording in Studio mode. This is correct
  behaviour, not a bug.

## Architecture

```
src/
├── vision/     # MediaPipe, camera, RAF loop        [React/DOM OK]
├── landmarks/  # normalize, features, segment        [PURE]
├── recognize/  # SignRecognizer, DTW                 [PURE]
├── score/      # components, combine, feedback        [PURE]
├── content/    # schema, vocabulary plan              [PURE]
├── store/      # Dexie, progress                      [PURE]
├── i18n/       # en, hi                               [PURE]
├── config/     # brand, thresholds                    [PURE]
└── ui/         # screens, components                  [React]
```

The pure layers carry **zero React and zero DOM imports** — enforced by ESLint
(`.eslintrc.cjs`). This is what makes the eventual React Native port cheap.
Every tunable threshold is a named constant in `src/config/thresholds.ts`.

## Scripts

```sh
npm install
npm run dev        # http://localhost:5173  (camera needs localhost or HTTPS)
npm test           # vitest — pure-module unit tests
npm run typecheck
npm run lint       # includes the no-audio + pure-boundary guardrails
npm run build
```

## Deploy (Vercel)

The app is a static SPA — `vite build` emits `dist/`, which Vercel serves
directly. `vercel.json` is committed and sets it up:

- **Framework** Vite, **build** `npm run build`, **output** `dist`.
- A catch-all rewrite to `/index.html` (static files still win, so `/assets`,
  `/sw.js`, `/manifest.webmanifest`, and `/mediapipe/*` serve normally).
- `Permissions-Policy: camera=(self)` so the camera works (Vercel is HTTPS,
  which `getUserMedia` requires), plus the service-worker scope header and
  long-lived caching for hashed assets.

Deploy: import the repo at vercel.com (zero config needed — it reads
`vercel.json`), or `npm i -g vercel && vercel`. It builds and deploys as-is.

> The deployed app runs immediately, opening to onboarding → Home's empty state
> → Studio. The **camera / recognition features need the MediaPipe wasm +
> models** in `public/mediapipe/` (see that folder's README) — commit those (or
> add them in a build step) for a camera-working demo. They're intentionally
> not in git.

## Build order

The spec builds in slices, each ending in a running app (Part 6). See
`SPEC.pdf` / `PROGRESS.md` for the slice plan and current status.

## The people this is for, and the people who own the content

The product is for hearing parents. The **content authority is Deaf** — Deaf
ISL signers record every reference, define what counts as correct, review every
line of feedback copy, and are credited by name on each sign card. No sign form
in this repo is invented; ISL varies by region and every sign carries its
region tag.
