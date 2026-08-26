import type { Strings } from "./types";

/** English strings. Interface voice: plain, never apologetic, always with the fix. */
export const en: Strings = {
  langName: "English",

  onboard: {
    s1Title: "Learn to sign with your child",
    s1Body:
      "Practise at home, at any hour, with your camera. Your video never leaves this phone.",
    s2Title: "What this is — and isn’t",
    s2Body:
      "This app checks whether your handshape and movement are close. It cannot tell you if you are fluent. Deaf teachers and Deaf communities do that — here is how to find them near you.",
    s2FindTeachers: "Find Deaf teachers near you",
    s3Title: "Set up",
    langLabel: "Language",
    handLabel: "Who’s signing",
    leftHanded: "Left-handed",
    rightHanded: "Right-handed",
    cameraTitle: "Camera",
    cameraBody:
      "The camera is used only on this phone, to see your hands. Nothing is recorded and nothing is sent anywhere.",
    cameraCta: "Turn on camera",
    skip: "Skip",
    next: "Next",
    begin: "Begin",
  },

  home: {
    rightNow: "Right now",
    signsInGroup: (n) => `${n} signs in this group`,
    homeSigns: "Your home signs",
    practiseAgain: "Practise again",
    start: "Start — 5 minutes",
    empty: "No signs yet. Add signs in Studio to begin.",
  },

  learn: {
    watch: "Watch",
    alongWithMe: "Along with me",
    onYourOwn: "On your own",
    slowMotion: "Slow motion",
    otherAngle: "Other angle",
    continue: "Continue",
    signNow: "Sign now",
    seeingYou: "seeing you",
    cannotSeeYou: "can’t see your hands",
    signedBy: (name, region) => `${name} · ${region}`,
  },

  feedback: {
    gotItHeadline: "That’s it. Your child will understand that.",
    nextSign: "Next sign",
    watchAgain: "Watch again",
    tryAgain: "Try again",
    tooDark:
      "Too dark to see your hands. Move nearer to a light, or hold the phone further away.",
    unsure: "I couldn’t read that one clearly — that’s on me, not you. Try once more?",
    notRecognized: "I don’t recognise that sign. Watch once more and try again?",
  },

  child: {
    title: "With your child",
    hint: "Put the phone flat between you. Both of you sign. Nothing is graded.",
  },

  studio: {
    title: "Studio",
    english: "English",
    hindi: "Hindi (हिंदी)",
    region: "Region",
    handedness: "Handedness",
    record: "Record take",
    keep: "Keep",
    discard: "Discard",
    takeUnusable: "Couldn’t see the hands well enough to keep this take.",
    exportPack: "Export pack",
    importPack: "Import pack",
    saved: "Saved",
  },

  errors: {
    noCamera: "No camera found on this device. Aangan needs a camera to see your hands.",
    permissionDenied:
      "The camera is turned off for this app. Turn it on in your browser’s site settings, then reload.",
    wasmFailure:
      "The hand-tracking engine didn’t load. Check your connection and reload — after the first load it works offline.",
    unsupported:
      "This browser can’t run the hand tracking. Try a recent Chrome on Android or a desktop browser.",
  },

  privacy: "On this phone only. Your video never leaves the device.",
};
