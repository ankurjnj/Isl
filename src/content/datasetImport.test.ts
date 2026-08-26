import { describe, it, expect } from "vitest";
import { importKeypointFile, type KeypointFile, type KeypointFrame } from "./datasetImport";
import { ATTEMPT_FRAMES } from "@/config/thresholds";

/** MediaPipe-style pose with the shoulders/elbows normalization needs. */
function pose(): number[][] {
  const p: number[][] = Array.from({ length: 33 }, () => [0, 0, 0]);
  p[11] = [0.4, 0.5, 0];
  p[12] = [0.6, 0.5, 0];
  p[13] = [0.38, 0.65, 0];
  p[14] = [0.62, 0.65, 0];
  return p;
}

function hand(x: number, y: number): number[][] {
  return Array.from({ length: 21 }, (_, i) => [x + i * 0.004, y + i * 0.003, i * 0.001]);
}

function frames(n: number): KeypointFrame[] {
  return Array.from({ length: n }, (_, i) => ({
    hands: { left: null, right: hand(0.5 + i * 0.004, 0.42) },
    pose: pose(),
  }));
}

function file(overrides: Partial<KeypointFile> = {}): KeypointFile {
  return {
    version: 1,
    language: "isl",
    source: {
      origin: "INCLUDE",
      url: "https://zenodo.org/records/4010759",
      license: "CC BY-NC 4.0",
    },
    signs: [
      {
        id: "isl.milk",
        english: "milk",
        hindi: "दूध",
        region: "Delhi",
        handedness: "one_handed",
        signerId: "signer03",
        unit: "Right now",
        takes: [{ frames: frames(40) }, { frames: frames(55) }],
      },
    ],
    ...overrides,
  };
}

describe("importKeypointFile", () => {
  it("converts corpus keypoints into 64-frame exemplars", () => {
    const { signs } = importKeypointFile(file());
    expect(signs).toHaveLength(1);
    const s = signs[0]!;
    expect(s.exemplars).toHaveLength(2);
    for (const ex of s.exemplars) {
      expect(ex.frames).toHaveLength(ATTEMPT_FRAMES);
      expect(ex.quality.usable).toBe(true);
      expect(ex.signId).toBe("isl.milk");
    }
  });

  it("marks everything imported as unreviewed, with its source and licence", () => {
    const { signs } = importKeypointFile(file());
    const s = signs[0]!;
    expect(s.sign.provenance?.review).toBe("unreviewed");
    expect(s.sign.provenance?.origin).toBe("INCLUDE");
    expect(s.sign.provenance?.license).toBe("CC BY-NC 4.0");
    expect(s.exemplars[0]!.provenance?.review).toBe("unreviewed");
  });

  it("keeps the signer attributable and credits the corpus", () => {
    const { signs } = importKeypointFile(file());
    expect(signs[0]!.exemplars[0]!.signerId).toBe("signer03");
    expect(signs[0]!.sign.signer.credit).toContain("INCLUDE");
  });

  it("never invents feedback copy — a Deaf reviewer authors it", () => {
    const { signs } = importKeypointFile(file());
    const fb = signs[0]!.sign.feedback;
    expect(fb.handshape.en).toBe("");
    expect(fb.movement.hi).toBe("");
  });

  it("drops takes the tracker couldn't see, rather than importing bad exemplars", () => {
    const bad = file();
    bad.signs[0]!.takes = [
      { frames: frames(40) },
      { frames: frames(30).map((f) => ({ ...f, hands: { left: null, right: null } })) },
    ];
    const { signs, droppedTakes } = importKeypointFile(bad);
    expect(droppedTakes).toBe(1);
    expect(signs[0]!.exemplars).toHaveLength(1);
  });

  it("drops a sign entirely when no take survives", () => {
    const bad = file();
    bad.signs[0]!.takes = [
      { frames: frames(30).map((f) => ({ ...f, hands: { left: null, right: null } })) },
    ];
    const { signs } = importKeypointFile(bad);
    expect(signs).toHaveLength(0);
  });
});
