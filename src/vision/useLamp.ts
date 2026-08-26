import { useEffect } from "react";

/**
 * The lamp's job is physical: light the parent's hands well enough for
 * MediaPipe to see them in a dim room (Part 3, Direction; Part 4.4). On entry
 * we keep the screen awake and raise brightness where the platform allows;
 * on exit we restore it.
 *
 * There is no standard web "screen brightness" API, so this is best-effort:
 * a Wake Lock keeps the (bright --lamp) screen from dimming, which is the part
 * that actually helps tracking. A real native/PWA build would set brightness
 * directly here. Measure the landmark-confidence delta on a real device
 * (slice v0.4) before relying on the effect.
 */
export function useLamp(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const request = async () => {
      try {
        sentinel = (await navigator.wakeLock?.request?.("screen")) ?? null;
      } catch {
        /* wake lock unavailable or denied — the bright field still helps */
      }
    };
    void request();

    // Re-acquire if the tab was hidden and comes back.
    const onVisible = () => {
      if (document.visibilityState === "visible" && !released) void request();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
