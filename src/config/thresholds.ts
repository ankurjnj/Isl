/**
 * Every tunable threshold in the product lives here (Part 7 §9).
 *
 * Each constant records HOW and WHEN it was calibrated. Values marked
 * PLACEHOLDER have not yet been calibrated against real exemplars — they carry
 * the spec's suggested starting value and MUST be re-derived per the procedure
 * in their comment before any public demo (see slice v0.4 / v0.5).
 */

/* ── Frame geometry ─────────────────────────────────────────────────────── */

/** Every attempt and exemplar is resampled to exactly this many frames. */
export const ATTEMPT_FRAMES = 64;

/* ── Segmentation (landmarks/segment.ts, Part 6 slice v0.2) ─────────────── */

/** Enter RECORDING when wrist speed exceeds this (shoulder-widths / sec). */
export const SEG_START_VELOCITY = 0.8;
/** Begin SETTLING when wrist speed drops below this. */
export const SEG_SETTLE_VELOCITY = 0.15;
/** Hold below settle velocity this long before SETTLING (ms). */
export const SEG_SETTLE_MS = 400;
/** Commit (DONE) this long after settle begins (ms). */
export const SEG_COMMIT_MS = 200;
/** Hard cap on a single sign (ms). */
export const SEG_MAX_MS = 4000;
/**
 * Auto-start also requires a hand "above hip level" so resting hands don't
 * trigger. In shoulder-relative coords (origin at the shoulder line, y down),
 * the hips sit roughly this many shoulder-widths below the origin; a wrist with
 * y below this is above hip level.
 */
export const SEG_HIP_Y = 1.3;

/* ── Tracking quality (gate on quality.usable, Part 7 §7) ────────────────── */

/** Below this mean landmark confidence, a take is not usable. */
export const QUALITY_MIN_CONFIDENCE = 0.5;
/** Above this dropped-frame ratio, a take is not usable. */
export const QUALITY_MAX_DROPPED_RATIO = 0.25;

/* ── DTW recognition (recognize/, Part 6 slice v0.4) ─────────────────────── */

/** Sakoe-Chiba band half-width in frames — prevents pathological warps. */
export const DTW_BAND = 12;

/** Feature-block weights: [handsGlobal, handsLocal, presence]. */
export const FEATURE_WEIGHTS = {
  global: 1.0,
  local: 1.0,
  presence: 0.5,
} as const;

/**
 * best = null above this per-sign median DTW distance.
 *
 * PLACEHOLDER (spec's starting point). Calibrate empirically (slice v0.4):
 * 20 correct attempts + 20 deliberately wrong, plot both distance
 * distributions, set the threshold in the valley between them. Record the
 * numbers and the date here when done.
 *
 * Calibrated: —  (not yet; using placeholder)
 */
export const REJECT_THRESHOLD = 0.9;

/** ambiguous when (d2 - d1) / d1 < this. */
export const AMBIGUOUS_MARGIN = 0.15;

/* ── Component scoring (score/, Part 6 slice v0.5) ───────────────────────── */

/** Number of aligned keyframes sampled for handshape / orientation. */
export const KEYFRAMES = 5;

/** overall = MIN_WEIGHT * min(scores) + (1 - MIN_WEIGHT) * mean(scores). */
export const OVERALL_MIN_WEIGHT = 0.4;

/**
 * A component at or above this 0–1 score "passes"; the weakest FAILING one is
 * surfaced. PLACEHOLDER — tune against the 30 flawed-attempt fixture set so the
 * correct component is flagged ≥75% of the time (slice v0.5 done-criterion).
 *
 * Calibrated: —  (not yet; using placeholder)
 */
export const COMPONENT_PASS = 0.7;

/** Overall score at or above this → "got it". PLACEHOLDER, calibrate with the above. */
export const OVERALL_PASS = 0.7;

/**
 * Raw-distance → 0–1 score scales, one per component. A component's score is
 * clamp(1 - distance / scale). PLACEHOLDERS — the shapes are right (cosine
 * distance, shoulder-widths, path units, radians) but the exact values must be
 * tuned against the 30-flawed-attempt fixture set on real exemplars (slice
 * v0.5). Calibrated: — (not yet).
 */
export const HANDSHAPE_COS_SCALE = 0.6; // cosine distance (0..2)
export const LOCATION_SW_SCALE = 0.5; // shoulder-widths
export const MOVEMENT_SCALE = 0.5; // path-normalized DTW units
export const ORIENTATION_RAD_SCALE = Math.PI / 2; // radians (90° → score 0)

/* ── Review queue (store/, Part 6 slice v0.6) ────────────────────────────── */

/** A sign unpractised for this many days re-enters the review queue. */
export const REVIEW_STALE_DAYS = 3;
