import type { RawFrame, Landmark } from "./types";

/**
 * Hand-identity smoothing (Part 6 slice v0.2, "ISL-critical"). PURE.
 *
 * MediaPipe's per-frame handedness label swaps when hands cross and occlude,
 * which is constant in ISL caregiving signs. Instead of trusting the label, we
 * assign each detection to the nearest previous-frame wrist, so a hand keeps
 * its slot across a crossing. Without this every downstream two-handed
 * comparison is garbage.
 */

type Slot = 0 | 1;

const wristOf = (hand: Landmark[] | null): Landmark | null =>
  hand && hand.length > 0 ? (hand[0] ?? null) : null;

const dist2 = (a: Landmark, b: Landmark): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
};

export function smoothHandIdentity(frames: RawFrame[]): RawFrame[] {
  // Last known wrist per slot; persists across a briefly-missing hand.
  const prev: [Landmark | null, Landmark | null] = [null, null];
  const out: RawFrame[] = [];

  for (const frame of frames) {
    // Keep each detection's ORIGIN slot; it is our best guess only when there
    // is no motion history to override it with.
    const detections: { hand: Landmark[]; wrist: Landmark; origin: Slot }[] = [];
    ([frame.hands.left, frame.hands.right] as const).forEach((h, i) => {
      const w = wristOf(h);
      if (h && w) detections.push({ hand: h, wrist: w, origin: i as Slot });
    });

    const assigned: [Landmark[] | null, Landmark[] | null] = [null, null];

    if (detections.length === 2) {
      const [d0, d1] = detections as [(typeof detections)[number], (typeof detections)[number]];
      if (prev[0] && prev[1]) {
        // Full history: pick the assignment (identity vs swap) that is nearest.
        const identity = dist2(d0.wrist, prev[0]) + dist2(d1.wrist, prev[1]);
        const swapped = dist2(d0.wrist, prev[1]) + dist2(d1.wrist, prev[0]);
        const swap = swapped < identity;
        assigned[0] = swap ? d1.hand : d0.hand;
        assigned[1] = swap ? d0.hand : d1.hand;
      } else {
        // No history: trust the incoming slots.
        assigned[d0.origin] = d0.hand;
        assigned[d1.origin] = d1.hand;
      }
    } else if (detections.length === 1) {
      const d = detections[0]!;
      // With history, follow the nearest previous wrist; otherwise keep origin.
      const slot = prev[0] || prev[1] ? nearestSlot(d.wrist, prev) : d.origin;
      assigned[slot] = d.hand;
    }

    // Update history only for slots that received a detection.
    for (const slot of [0, 1] as Slot[]) {
      const w = wristOf(assigned[slot]);
      if (w) prev[slot] = w;
    }

    out.push({
      tMs: frame.tMs,
      pose: frame.pose,
      hands: { left: assigned[0], right: assigned[1] },
    });
  }

  return out;
}

function nearestSlot(w: Landmark, prev: [Landmark | null, Landmark | null]): Slot {
  const p0 = prev[0];
  const p1 = prev[1];
  if (p0 && p1) return dist2(w, p0) <= dist2(w, p1) ? 0 : 1;
  if (p0) return 0;
  if (p1) return 1;
  return 0; // first-ever detection defaults to the left slot
}
