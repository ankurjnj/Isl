#!/usr/bin/env python3
"""
Turn ISL reference videos into an Aangan keypoint pack.

WHY: Aangan never invents a sign form. Forms may only come from a Deaf signer
recording in Studio, or from a verified dictionary — ISLRTC / indiansignlanguage.org
(SPEC Part 5.2, Part 7 s1). This script is the bridge for the second route: point it
at reference videos of a Deaf signer and it emits the JSON that Studio's
"Import dataset keypoints" button reads. No sign form is synthesised anywhere:
every landmark comes out of the video you supply.

USAGE
    pip install "mediapipe==0.10.14" opencv-python
    python tools/video_to_keypoints.py videos/ -o isl-pack.json \
        --region "Delhi" --signer-id islrtc --signer-name "ISLRTC" \
        --origin ISLRTC --url https://islrtc.nic.in/ --license "see source terms"

    # then: open the app -> Add signs -> Import dataset keypoints -> pick isl-pack.json

Name each video after its English word: milk.mp4, hurt.mp4, mother.mov ...
Several takes of one word: milk.mp4, milk-2.mp4, milk_3.mp4 (all map to "milk").
Words outside the built-in list still work; pass --allow-unknown to include them
with an empty Hindi gloss you can fill in later.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# The 20 words from src/content/vocabulary.ts — English -> (id, Hindi, unit).
VOCAB: dict[str, tuple[str, str, str]] = {
    "eat":      ("isl.eat",      "खाना",    "Right now"),
    "milk":     ("isl.milk",     "दूध",     "Right now"),
    "water":    ("isl.water",    "पानी",    "Right now"),
    "more":     ("isl.more",     "और",      "Right now"),
    "finished": ("isl.finished", "हो गया",  "Right now"),
    "sleep":    ("isl.sleep",    "सोना",    "Your body"),
    "bath":     ("isl.bath",     "नहाना",   "Your body"),
    "toilet":   ("isl.toilet",   "शौचालय",  "Your body"),
    "hurt":     ("isl.hurt",     "दर्द",     "Your body"),
    "help":     ("isl.help",     "मदद",     "Your body"),
    "mother":   ("isl.mother",   "माँ",     "Us"),
    "father":   ("isl.father",   "पिता",    "Us"),
    "love":     ("isl.love",     "प्यार",    "Us"),
    "good":     ("isl.good",     "अच्छा",    "Us"),
    "play":     ("isl.play",     "खेलना",   "Us"),
    "yes":      ("isl.yes",      "हाँ",     "Answers"),
    "no":       ("isl.no",       "नहीं",     "Answers"),
    "come":     ("isl.come",     "आओ",      "Answers"),
    "wait":     ("isl.wait",     "रुको",    "Answers"),
    "careful":  ("isl.careful",  "सावधान",  "Answers"),
}

VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".avi", ".webm", ".mkv"}


def word_of(path: Path) -> str:
    """milk-2.mp4 / milk_3.MP4 / Milk.mov  ->  'milk'."""
    stem = path.stem.strip().lower()
    return re.split(r"[-_ ]", stem)[0]


def round_pts(landmarks, n: int) -> list[list[float]]:
    """MediaPipe landmark list -> [[x, y, z], ...], rounded to keep JSON small."""
    return [[round(l.x, 5), round(l.y, 5), round(l.z, 5)] for l in landmarks[:n]]


def extract(video: Path, holistic, cv2, stride: int) -> list[dict]:
    """One video -> frames of MediaPipe keypoints in the app's format."""
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise RuntimeError(f"could not open {video}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frames: list[dict] = []
    idx = 0
    while True:
        ok, image = cap.read()
        if not ok:
            break
        if idx % stride == 0:
            # MediaPipe wants RGB.
            result = holistic.process(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
            # Holistic derives each hand from the POSE model's wrists, so
            # left_hand_landmarks really is the signer's own left hand. That
            # matches what the app stores, so no handedness swap is needed here
            # (unlike raw Hands, whose label is image-relative).
            frames.append({
                "tMs": round(idx * 1000.0 / fps),
                "hands": {
                    "left": round_pts(result.left_hand_landmarks.landmark, 21)
                    if result.left_hand_landmarks else None,
                    "right": round_pts(result.right_hand_landmarks.landmark, 21)
                    if result.right_hand_landmarks else None,
                },
                # 33 pose landmarks; 11-14 (shoulders, elbows) are what
                # normalization builds its reference frame from.
                "pose": round_pts(result.pose_landmarks.landmark, 33)
                if result.pose_landmarks else None,
            })
        idx += 1
    cap.release()
    return frames


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", type=Path, help="folder of videos, or a single video file")
    ap.add_argument("-o", "--out", type=Path, default=Path("isl-pack.json"))
    ap.add_argument("--region", required=True,
                    help='ISL varies by region and every sign is tagged, e.g. "Delhi"')
    ap.add_argument("--signer-id", required=True, help="keeps takes attributable")
    ap.add_argument("--signer-name", default=None, help="shown in the credit line")
    ap.add_argument("--origin", required=True, help='e.g. "ISLRTC", "INCLUDE"')
    ap.add_argument("--url", default=None)
    ap.add_argument("--license", default=None, help="the source's terms — record them")
    ap.add_argument("--handedness", default="one_handed",
                    choices=["one_handed", "symmetric", "asymmetric_two_handed"])
    ap.add_argument("--stride", type=int, default=1,
                    help="keep every Nth frame (2 halves the file; clips are resampled to 64 anyway)")
    ap.add_argument("--allow-unknown", action="store_true",
                    help="include words outside the built-in 20, with an empty Hindi gloss")
    args = ap.parse_args()

    try:
        import cv2  # type: ignore
        import mediapipe as mp  # type: ignore
    except ImportError:
        print('Missing deps. Run:  pip install "mediapipe==0.10.14" opencv-python',
              file=sys.stderr)
        return 2

    videos = ([args.input] if args.input.is_file()
              else sorted(p for p in args.input.rglob("*")
                          if p.suffix.lower() in VIDEO_SUFFIXES))
    if not videos:
        print(f"No videos found in {args.input}", file=sys.stderr)
        return 1

    # Group takes by word, so several clips of one sign become several exemplars.
    by_word: dict[str, list[Path]] = {}
    for v in videos:
        by_word.setdefault(word_of(v), []).append(v)

    signs = []
    skipped: list[str] = []

    with mp.solutions.holistic.Holistic(
        static_image_mode=False,
        model_complexity=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ) as holistic:
        for word, paths in sorted(by_word.items()):
            known = VOCAB.get(word)
            if known is None and not args.allow_unknown:
                skipped.append(word)
                continue
            sign_id, hindi, unit = known if known else (f"isl.{word}", "", "Right now")

            takes = []
            for p in paths:
                print(f"  {word:<9} <- {p.name}", flush=True)
                frames = extract(p, holistic, cv2, max(1, args.stride))
                if frames:
                    takes.append({"frames": frames})
            if takes:
                signs.append({
                    "id": sign_id,
                    "english": word,
                    "hindi": hindi,
                    "region": args.region,
                    "handedness": args.handedness,
                    "signerId": args.signer_id,
                    "signerName": args.signer_name or args.signer_id,
                    "unit": unit,
                    "takes": takes,
                })

    pack = {
        "version": 1,
        "language": "isl",
        "source": {
            "origin": args.origin,
            **({"url": args.url} if args.url else {}),
            **({"license": args.license} if args.license else {}),
        },
        "signs": signs,
    }
    args.out.write_text(json.dumps(pack, ensure_ascii=False), encoding="utf-8")

    total_takes = sum(len(s["takes"]) for s in signs)
    size_mb = args.out.stat().st_size / 1e6
    print(f"\nWrote {args.out}  ({len(signs)} signs, {total_takes} takes, {size_mb:.1f} MB)")
    if skipped:
        print(f"Skipped (not in the 20-word list, use --allow-unknown): {', '.join(sorted(skipped))}")
    print("\nNext: open the app -> Add signs -> Import dataset keypoints -> pick this file.")
    print("Everything imports as UNREVIEWED until a Deaf signer confirms each form.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
