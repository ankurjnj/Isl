import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Build for the hosted preview: one self-contained HTML file with every asset
 * inlined. The viewer's content policy blocks arbitrary external requests, so
 * a normal multi-chunk build would load nothing.
 */
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { outDir: 'dist-artifact', assetsInlineLimit: 100_000_000, cssCodeSplit: false },
});
