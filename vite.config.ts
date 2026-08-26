/// <reference types="node" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // Camera (getUserMedia) requires a secure context. localhost counts as secure.
    host: true,
    port: 5173,
  },
  build: {
    target: "es2021",
    rollupOptions: {
      // Two entries, so the parent app's bundle contains no admin/upload code.
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        admin: fileURLToPath(new URL("./admin.html", import.meta.url)),
      },
    },
    // Keep first-load budget honest (Part 2, principle 6: under 6MB).
    // MediaPipe wasm is fetched at runtime, never bundled.
    chunkSizeWarningLimit: 700,
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
