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
