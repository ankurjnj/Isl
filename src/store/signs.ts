import { db } from "./db";
import type { Sign, Exemplar, SignReference } from "@/content/schema";

/**
 * Reading and writing the vocabulary. PURE (Dexie only).
 *
 * A Sign is only "practiceable" once it has at least one usable exemplar. The
 * shipped vocabulary is empty until a Deaf signer records into Studio
 * (Part 5.2, Part 7 §1); these helpers never invent one.
 */

export async function getSign(id: string): Promise<Sign | undefined> {
  return db.signs.get(id);
}

export async function allSigns(): Promise<Sign[]> {
  return db.signs.toArray();
}

export async function signsInUnit(unit: string): Promise<Sign[]> {
  return db.signs.where("unit").equals(unit).toArray();
}

export async function exemplarsFor(signId: string): Promise<Exemplar[]> {
  return db.exemplars.where("signId").equals(signId).toArray();
}

/** Only usable exemplars — bad exemplars poison every comparison (Part 6 v0.3). */
export async function usableExemplarsFor(signId: string): Promise<Exemplar[]> {
  const all = await exemplarsFor(signId);
  return all.filter((e) => e.quality.usable);
}

/** A sign is practiceable iff it has ≥1 usable exemplar. */
export async function isPracticeable(signId: string): Promise<boolean> {
  return (await usableExemplarsFor(signId)).length > 0;
}

/** Build the reference set the recognizer loads for a unit. */
export async function referencesForUnit(unit: string): Promise<SignReference[]> {
  const signs = await signsInUnit(unit);
  const refs: SignReference[] = [];
  for (const sign of signs) {
    const exemplars = await usableExemplarsFor(sign.id);
    if (exemplars.length > 0) refs.push({ sign, exemplars });
  }
  return refs;
}

/** References for every practiceable sign — used by Test & Converse, which
 *  isn't scoped to a single unit. */
export async function allReferences(): Promise<SignReference[]> {
  const signs = await allSigns();
  const refs: SignReference[] = [];
  for (const sign of signs) {
    const exemplars = await usableExemplarsFor(sign.id);
    if (exemplars.length > 0) refs.push({ sign, exemplars });
  }
  return refs;
}

export async function putSign(sign: Sign): Promise<void> {
  await db.signs.put(sign);
}

export async function putExemplar(ex: Exemplar): Promise<void> {
  await db.exemplars.put(ex);
}
