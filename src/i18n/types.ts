/** Supported UI languages. Hindi is first-class, not a localisation afterthought. */
export type Lang = "en" | "hi";

/**
 * The full user-facing string catalogue. Every string the learner can see is
 * here (Part 6 slice v0.7). Feedback copy that is authored PER SIGN by a Deaf
 * reviewer lives on the Sign, not here (Part 5.3) — this catalogue holds only
 * the interface's own voice.
 */
export type Strings = {
  langName: string; // this language's own name, for the toggle

  onboard: {
    s1Title: string;
    s1Body: string;
    s2Title: string;
    s2Body: string;
    s2FindTeachers: string;
    s3Title: string;
    langLabel: string;
    handLabel: string;
    leftHanded: string;
    rightHanded: string;
    cameraTitle: string;
    cameraBody: string;
    cameraCta: string;
    skip: string;
    next: string;
    begin: string;
  };

  home: {
    rightNow: string;
    signsInGroup: (n: number) => string;
    homeSigns: string;
    practiseAgain: string;
    start: string;
    empty: string;
  };

  learn: {
    watch: string;
    alongWithMe: string;
    onYourOwn: string;
    slowMotion: string;
    otherAngle: string;
    continue: string;
    signNow: string;
    seeingYou: string;
    cannotSeeYou: string;
    signedBy: (name: string, region: string) => string;
  };

  feedback: {
    gotItHeadline: string; // interface voice; per-sign copy overrides where present
    nextSign: string;
    watchAgain: string;
    tryAgain: string;
    tooDark: string;
    unsure: string;
    notRecognized: string;
  };

  child: {
    title: string;
    hint: string;
  };

  studio: {
    title: string;
    english: string;
    hindi: string;
    region: string;
    handedness: string;
    record: string;
    keep: string;
    discard: string;
    takeUnusable: string;
    exportPack: string;
    importPack: string;
    saved: string;
  };

  errors: {
    noCamera: string;
    permissionDenied: string;
    wasmFailure: string;
    unsupported: string;
  };

  privacy: string; // the persistent, honest on-device statement
};
