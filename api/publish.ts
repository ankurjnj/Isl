import { AwsClient } from "aws4fetch";

/**
 * Publish an exemplar pack to Cloudflare R2.
 *
 * Runs on Vercel's edge runtime. The R2 credentials exist ONLY here — the admin
 * dashboard never sees them, it just POSTs the pack with an admin token.
 *
 * Note what does not pass through this endpoint: no learner video, ever. The
 * parent app has no upload path at all (SPEC Part 7 s11); this is the content
 * pipeline, a separate surface, and it carries keypoints only — the admin's
 * source videos are processed in their browser and never leave it.
 *
 * Required environment variables (Vercel project settings):
 *   ADMIN_TOKEN             shared secret the dashboard sends
 *   R2_ACCOUNT_ID           Cloudflare account id
 *   R2_ACCESS_KEY_ID        R2 API token key id
 *   R2_SECRET_ACCESS_KEY    R2 API token secret
 *   R2_BUCKET               bucket name
 */

export const config = { runtime: "edge" };

/** Packs are keypoints, not video — a few MB at most. Refuse anything wild. */
const MAX_BYTES = 25 * 1024 * 1024;
const OBJECT_KEY = "pack.json";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Length-independent comparison, so the token can't be probed byte by byte. */
function tokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const env = process.env;
  const adminToken = env.ADMIN_TOKEN;
  const accountId = env.R2_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  const bucket = env.R2_BUCKET;

  if (!adminToken || !accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return json(500, { error: "Server is not configured. See api/publish.ts for the env vars it needs." });
  }

  const supplied = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!supplied || !tokensMatch(supplied, adminToken)) {
    return json(401, { error: "Bad admin token." });
  }

  const body = await req.text();
  if (body.length > MAX_BYTES) {
    return json(413, { error: `Pack is ${(body.length / 1e6).toFixed(1)} MB; the limit is 25 MB.` });
  }

  // Stamp the publish time so clients can tell whether their copy is current.
  let pack: { version?: number; signs?: unknown[]; publishedAt?: string };
  try {
    pack = JSON.parse(body);
  } catch {
    return json(400, { error: "Body is not valid JSON." });
  }
  if (pack.version !== 1 || !Array.isArray(pack.signs)) {
    return json(400, { error: "Not an exemplar pack (expected version 1 with a signs array)." });
  }
  const publishedAt = new Date().toISOString();
  pack.publishedAt = publishedAt;
  const payload = JSON.stringify(pack);

  const aws = new AwsClient({ accessKeyId, secretAccessKey, region: "auto", service: "s3" });
  const url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${OBJECT_KEY}`;

  const put = await aws.fetch(url, {
    method: "PUT",
    body: payload,
    headers: {
      "content-type": "application/json",
      // Short cache: a parent should pick up a new pack quickly, and R2 egress
      // is free so re-fetching costs nothing.
      "cache-control": "public, max-age=300",
    },
  });

  if (!put.ok) {
    return json(502, { error: `R2 rejected the upload (${put.status}).` });
  }

  return json(200, {
    ok: true,
    publishedAt,
    signs: pack.signs.length,
    bytes: payload.length,
  });
}
