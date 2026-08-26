import { exportPack } from "@/store/pack";

export type PublishResult = { publishedAt: string; signs: number; bytes: number };

/**
 * Publish everything currently in the library to R2, via the edge function
 * that holds the credentials. The browser never sees an R2 key.
 */
export async function publishPack(token: string): Promise<PublishResult> {
  const pack = await exportPack();
  if (pack.signs.length === 0) {
    throw new Error("Nothing to publish yet — add a sign first.");
  }
  const res = await fetch("/api/publish", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(pack),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & Partial<PublishResult>;
  if (!res.ok) throw new Error(body.error ?? `Publish failed (${res.status}).`);
  return {
    publishedAt: body.publishedAt ?? new Date().toISOString(),
    signs: body.signs ?? pack.signs.length,
    bytes: body.bytes ?? 0,
  };
}
