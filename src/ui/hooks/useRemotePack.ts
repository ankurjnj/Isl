import { useEffect } from "react";
import { importPack, type ExemplarPack } from "@/store/pack";
import { useAppStore } from "@/ui/store/appStore";

/**
 * Fetch the published exemplar pack and import it if it's newer than the copy
 * already on this device.
 *
 * Read-only and best-effort: with no network (or nothing published yet) the app
 * simply keeps whatever it already has, because it is offline-first. This is
 * the only content connection the parent app has — there is no upload path here
 * (SPEC Part 7 s11).
 */

const PACK_URL = (import.meta.env.VITE_PACK_URL as string | undefined) ?? "/pack.json";
const STAMP_KEY = "aangan.pack.publishedAt";

export function useRemotePack(): void {
  const bumpContent = useAppStore((s) => s.bumpContent);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(PACK_URL, { cache: "no-cache" });
        if (!res.ok) return; // nothing published yet — not an error
        const pack = (await res.json()) as ExemplarPack;
        if (!alive || pack.version !== 1 || !Array.isArray(pack.signs)) return;

        // Skip the (expensive) import when this device already has this pack.
        const stamp = pack.publishedAt ?? "";
        if (stamp && localStorage.getItem(STAMP_KEY) === stamp) return;

        await importPack(pack);
        if (!alive) return;
        if (stamp) {
          try {
            localStorage.setItem(STAMP_KEY, stamp);
          } catch {
            /* storage disabled — we'll just re-import next open */
          }
        }
        bumpContent();
      } catch {
        /* offline, or no pack published: keep what we have */
      }
    })();
    return () => {
      alive = false;
    };
  }, [bumpContent]);
}
