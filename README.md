# Aangan

An Indian Sign Language app for hearing parents of deaf children under five.

> Working name: **Aangan** (आँगन) — the courtyard at the centre of a home,
> where the family gathers. The name lives in one place, `src/config/brand.ts`;
> rename freely.

This is a proof of concept built from `SPEC.pdf`. It teaches a parent to sign
the words they need **tonight** — milk, hurt, I love you — beside a sleeping
child, in five-minute fragments, one-handed, in a dim room.

The whole app is **two choices**, Duolingo-style:

- **Learn** — watch the digital hand play the sign back. No camera.
- **Test & Converse** — turn on the camera. *Converse* just lights up the hands
  as they move (nothing graded); *Test* checks one sign and gives a single,
  honest result.

Recording new signs lives behind one quiet **Add signs** link (Studio), for the
Deaf signer who owns the content.

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

## Getting real sign content

The app ships with an empty vocabulary and never invents a sign form. To fill
it without recording in person, **[CONTENT_SOURCES.md](CONTENT_SOURCES.md)**
lists the real ISL sources — the ISLRTC official dictionary, the FDMSE
regional-variant dictionary, and open research corpora (OpenHands / INCLUDE /
iSign) that publish MediaPipe keypoints from Deaf adult signers.

The quickest route: download reference videos of the 20 words from ISLRTC,
convert them with `tools/video_to_keypoints.py`, and load the resulting JSON via
**Studio → "Import dataset keypoints"**. Everything imported is marked
*unreviewed* — and labelled as such in Learn — until a Deaf signer confirms it.

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

> The MediaPipe wasm + models are committed under `public/mediapipe/`, so the
> camera / hand-tracking works out of the box on the deploy (no extra step). The
> app opens to the two-choice menu; **Converse** works immediately with the
> camera, while **Learn** and **Test** show content once signs have been
> recorded in **Add signs** (Studio).

## Build order

The spec builds in slices, each ending in a running app (Part 6). See
`SPEC.pdf` / `PROGRESS.md` for the slice plan and current status.

## The people this is for, and the people who own the content

The product is for hearing parents. The **content authority is Deaf** — Deaf
ISL signers record every reference, define what counts as correct, review every
line of feedback copy, and are credited by name on each sign card. No sign form
in this repo is invented; ISL varies by region and every sign carries its
region tag.
