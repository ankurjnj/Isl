# Where the sign forms come from

Aangan ships with **no sign forms**, and it never generates one. A wrong sign
taught confidently to a parent who has nobody to correct them is the exact harm
this product exists to prevent (Part 5.2, Part 7 §1).

The spec allows exactly two origins for a sign form:

1. A Deaf ISL signer recording it in **Studio** (preferred), or
2. The **ISLRTC** dictionary or **indiansignlanguage.org**, verified by a Deaf
   signer.

Published ISL research corpora — recorded from Deaf adult signers and released
for reuse — fall under (2). They are the practical route when nobody can record
in person, and the app can import them directly.

> **Verify licences yourself before shipping.** The notes below are from public
> descriptions of each source. Several corpora are **research/non-commercial
> only**. Nothing here has been checked by a Deaf signer, so everything imported
> is flagged `unreviewed` in the app until someone does.

---

## A. Dictionaries — authoritative, human-facing

Best for **verifying** a form and for reference video you can link to.

| Source | What it is | Use it for |
|---|---|---|
| [ISLRTC](https://islrtc.nic.in/) — Govt. of India | The official ISL dictionary: 10,000 terms across everyday, legal, academic, medical and technical categories. **All videos are signed by Deaf signers only.** | The authority. Check any form against this. |
| [ISLRTC on YouTube](https://www.youtube.com/channel/UC3AcGIlqVI4nJWCwHgHFXtg) | The dictionary as video, plus a 30–40 hour self-learning ISL course. | Reference video URLs for `Sign.videoUrl`. |
| [indiansignlanguage.org](https://indiansignlanguage.org/) (FDMSE, RKMVERI Coimbatore) | 2,500+ signs documented across **42 cities in 12 states**; image + video + discussion per sign. Entries are numbered by variant (e.g. Mother-1, Mother-2, Mother-3). | Regional variants. This is where the `region` tag on each sign comes from. |
| [Search the dictionary](https://indiansignlanguage.org/search-dictionary/) | Word lookup for the above. | Finding the 20 words in `src/content/vocabulary.ts`. |
| [ISL Dictionary on data.gov.in](https://www.data.gov.in/catalog/indian-sign-language-dictionary) | The government open-data catalogue entry. | Check for a bulk/openly-licensed release. |
| [Sign Academy — ISL dictionary](https://signacademy.org/sign-dictionary/indian-sign-language-isl-dictionary/) · [Talking Hands](http://www.talkinghands.co.in/) | Curated ISL video collections. | Secondary cross-checks. |

**Regional variation is not a detail.** One region's variant is never "the" ISL
sign. Every sign in the app carries a region tag and the UI shows it.

## B. Corpora — machine-readable, importable

These publish **MediaPipe keypoint sequences**, which is exactly Aangan's own
representation — so they import without anyone inventing anything.

| Corpus | Contents | Licence note |
|---|---|---|
| [OpenHands](https://arxiv.org/pdf/2110.05877) (AI4Bharat) | 2,002 frequently-used ISL words · 40,033 isolated videos · **20 Deaf adult signers**. Keypoints via the MediaPipe pipeline (3D coords for 75 keypoints). | Check the paper/repo for terms. |
| INCLUDE | Word-level ISL, 2–3 second clips per sign, with pose keypoints. | Check terms. |
| [iSign](https://huggingface.co/datasets/Exploration-Lab/iSign) ([paper](https://arxiv.org/html/2407.05404v1)) | ISL benchmark incl. SignPose2Text and Text2Pose. MediaPipe keypoints. | **Free for research, not commercial.** |
| [ISLTranslate](https://arxiv.org/html/2307.05440) | 31k ISL–English pairs, pose-based. | Check terms. |
| [Roboflow ISL](https://universe.roboflow.com/isl-bw7ab/indian-sign-language-xdadp) | Object-detection ISL dataset. | Listed as CC BY 4.0. |
| [Ham2Pose](https://arxiv.org/pdf/2211.13613) | Animates HamNoSys notation into pose sequences. | Relevant if you later drive the hand from notation instead of recordings. |

---

## Importing a corpus into the app

**Studio → "Import dataset keypoints"** takes a JSON file in the format below and
runs it through the *same* pipeline as the live camera (hand-identity smoothing →
normalization → resample to 64 frames → tracking-quality gate), so an imported
reference is directly comparable to a parent's attempt. Takes the tracker can't
see are dropped rather than imported, because a bad exemplar poisons every later
comparison.

```jsonc
{
  "version": 1,
  "language": "isl",
  "source": {
    "origin": "INCLUDE",                 // shown in the credit line
    "url": "https://…",
    "license": "CC BY-NC 4.0"
  },
  "signs": [
    {
      "id": "isl.milk",
      "english": "milk",
      "hindi": "दूध",
      "region": "Delhi",                 // required — ISL varies by region
      "handedness": "one_handed",        // | "symmetric" | "asymmetric_two_handed"
      "signerId": "signer03",            // keeps takes attributable
      "signerName": "…",                 // optional, for the credit line
      "unit": "Right now",
      "takes": [
        {
          "frames": [
            {
              "tMs": 0,                              // optional, defaults to 30fps
              "hands": {
                "left": null,                        // or 21 × [x, y, z]
                "right": [[0.5, 0.42, 0.0]  /* …21 points… */]
              },
              "pose": [[0.4, 0.5, 0.0] /* …33 points; 11–14 required… */]
            }
          ]
        }
      ]
    }
  ]
}
```

Coordinates are MediaPipe's image-normalized space (0–1), 21 landmarks per hand
and 33 pose landmarks. Pose indices **11–14** (shoulders and elbows) are required:
normalization builds its reference frame from the shoulder line, which is what
makes distance from the camera stop mattering.

Converting a specific corpus to this shape is a small per-corpus script — each
publishes keypoints in its own layout. `src/content/datasetImport.ts` is the
target format; `src/content/datasetImport.test.ts` shows a minimal valid file.

## After importing

1. Everything lands as `provenance.review: "unreviewed"`, and Learn shows a note
   saying so. It is a guide, not the final word.
2. **A Deaf signer reviews each form** against ISLRTC, then flips it to
   `deaf_reviewed`.
3. **Feedback copy is still empty.** The one-sentence correction shown for each
   component is authored per sign by a Deaf reviewer (Part 5.3) — generic
   templates ("check your handshape") are useless and often wrong, and no
   importer writes them.
4. Credit the signers by name in the app where the corpus provides names.

Until step 2, don't demo it publicly as ISL instruction.
