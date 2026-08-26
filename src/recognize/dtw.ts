import { DTW_BAND } from "@/config/thresholds";

/**
 * Dynamic Time Warping with a Sakoe-Chiba band (Part 6 slice v0.4). PURE.
 *
 * The band (±DTW_BAND frames) prevents pathological warps and runs ~3× faster.
 * Matching and grading are one computation here: the returned alignment `path`
 * is what the component scorer uses to pair frames, so people aren't penalised
 * for signing at a different tempo.
 */

export type DtwResult = {
  /** Accumulated cost divided by path length — a per-step average distance. */
  distance: number;
  /** Aligned index pairs [i, j], from start to end. */
  path: [number, number][];
};

const INF = Number.POSITIVE_INFINITY;

function l2(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let k = 0; k < a.length; k++) {
    const d = a[k]! - b[k]!;
    s += d * d;
  }
  return Math.sqrt(s);
}

/**
 * DTW between two equal-width feature sequences. With a band, cells outside
 * |i - j| <= band are unreachable (INF).
 */
export function dtw(a: Float32Array[], b: Float32Array[], band = DTW_BAND): DtwResult {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return { distance: INF, path: [] };

  const cost = new Float64Array((n + 1) * (m + 1)).fill(INF);
  const idx = (i: number, j: number) => i * (m + 1) + j;
  cost[idx(0, 0)] = 0;

  for (let i = 1; i <= n; i++) {
    // Clamp the inner loop to the band around the diagonal.
    const jLo = Math.max(1, i - band);
    const jHi = Math.min(m, i + band);
    for (let j = jLo; j <= jHi; j++) {
      const d = l2(a[i - 1]!, b[j - 1]!);
      const best = Math.min(cost[idx(i - 1, j)]!, cost[idx(i, j - 1)]!, cost[idx(i - 1, j - 1)]!);
      cost[idx(i, j)] = d + best;
    }
  }

  // Backtrace for the alignment path.
  const path: [number, number][] = [];
  let i = n;
  let j = m;
  const total = cost[idx(n, m)]!;
  if (!Number.isFinite(total)) return { distance: INF, path: [] };
  while (i > 0 && j > 0) {
    path.push([i - 1, j - 1]);
    const diag = cost[idx(i - 1, j - 1)]!;
    const up = cost[idx(i - 1, j)]!;
    const left = cost[idx(i, j - 1)]!;
    const m3 = Math.min(diag, up, left);
    if (m3 === diag) {
      i--;
      j--;
    } else if (m3 === up) {
      i--;
    } else {
      j--;
    }
  }
  path.reverse();

  return { distance: total / path.length, path };
}
