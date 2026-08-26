import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/ui/App";
import "@/ui/styles/global.css";
import "@/ui/components/components.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline after first load (Part 6 v1.0). Production only — a stale SW in dev
// only gets in the way.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support just won't be available; the app still runs */
    });
  });
}
