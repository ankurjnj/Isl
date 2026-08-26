import { db } from "./db";
import type { Exemplar, Sign } from "@/content/schema";
import type { NormFrame, TrackingQuality, Handedness } from "@/landmarks/types";

/**
 * Exemplar pack import/export (Part 6 slice v0.3). PURE.
 *
 * signerId and consent are recorded from the first line of code — retrofitting
 * consent onto data you already hold is how projects end up with a corpus they
 * can't legally use (Part 6 v0.3). The pack carries them on every take.
 *
 * NormFrame holds Float32Arrays, which don't survive JSON; frames are
 * serialized to plain number[] and rebuilt on import, so a pack round-trips
 * cleanly across a browser or a machine.
 */

export type PackConsent = {
  granted: true;
  scope: "prototype" | "training";
  date: string;
};

type SerFrame = {
  tMs: number;
  present: [boolean, boolean];
  handsGlobal: [number[], number[]];
  handsLocal: [number[], number[]];
  palmNormal: [number[], number[]];
  pose: number[];
};

export type PackTake = {
  takeId: string;
  frames: SerFrame[];
  quality: TrackingQuality;
  signerId: string;
  consent: PackConsent;
};

export type ExemplarPack = {
  version: 1;
  language: "isl" | "asl";
  signs: {
    id: string;
    english: string;
    hindi: string;
    region: string;
    handedness: Handedness;
    takes: PackTake[];
  }[];
};

const arr = (f: Float32Array): number[] => Array.from(f);
const f32 = (a: number[]): Float32Array => Float32Array.from(a);

export function serializeFrame(f: NormFrame): SerFrame {
  return {
    tMs: f.tMs,
    present: f.present,
    handsGlobal: [arr(f.handsGlobal[0]), arr(f.handsGlobal[1])],
    handsLocal: [arr(f.handsLocal[0]), arr(f.handsLocal[1])],
    palmNormal: [arr(f.palmNormal[0]), arr(f.palmNormal[1])],
    pose: arr(f.pose),
  };
}

export function deserializeFrame(s: SerFrame): NormFrame {
  return {
    tMs: s.tMs,
    present: s.present,
    handsGlobal: [f32(s.handsGlobal[0]), f32(s.handsGlobal[1])],
    handsLocal: [f32(s.handsLocal[0]), f32(s.handsLocal[1])],
    palmNormal: [f32(s.palmNormal[0]), f32(s.palmNormal[1])],
    pose: f32(s.pose),
  };
}

/** Build a portable pack from everything currently in the store. */
export async function exportPack(language: "isl" | "asl" = "isl"): Promise<ExemplarPack> {
  const signs = await db.signs.toArray();
  const out: ExemplarPack = { version: 1, language, signs: [] };
  for (const sign of signs) {
    const exemplars = await db.exemplars.where("signId").equals(sign.id).toArray();
    if (exemplars.length === 0) continue;
    out.signs.push({
      id: sign.id,
      english: sign.english,
      hindi: sign.hindi,
      region: sign.region,
      handedness: sign.handedness,
      takes: exemplars.map((e) => ({
        takeId: e.id,
        frames: e.frames.map(serializeFrame),
        quality: e.quality,
        signerId: e.signerId,
        consent: e.consent,
      })),
    });
  }
  return out;
}

/** Minimal Sign built from pack metadata, when one doesn't already exist.
 *  Authored feedback is left empty — it is written per sign by a Deaf reviewer
 *  (Part 5.3), never invented here. */
function signFromPack(p: ExemplarPack["signs"][number], language: "isl" | "asl"): Sign {
  const empty = { en: "", hi: "" };
  return {
    id: p.id,
    language,
    english: p.english,
    hindi: p.hindi,
    region: p.region,
    handedness: p.handedness,
    videoUrl: "",
    exemplars: [],
    tolerances: { handshape: 0.7, location: 0.7, movement: 0.7, orientation: 0.7 },
    feedback: { handshape: empty, location: empty, movement: empty, orientation: empty },
    signer: { name: "", credit: "" },
    unit: "Right now",
  };
}

/** Import a pack into the store. Existing signs are preserved; takes are added. */
export async function importPack(pack: ExemplarPack): Promise<{ signs: number; takes: number }> {
  let takes = 0;
  for (const p of pack.signs) {
    const existing = await db.signs.get(p.id);
    if (!existing) await db.signs.put(signFromPack(p, pack.language));
    for (const take of p.takes) {
      const exemplar: Exemplar = {
        id: take.takeId,
        signId: p.id,
        frames: take.frames.map(deserializeFrame),
        quality: take.quality,
        signerId: take.signerId,
        consent: take.consent,
      };
      await db.exemplars.put(exemplar);
      takes++;
    }
  }
  return { signs: pack.signs.length, takes };
}
