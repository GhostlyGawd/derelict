import { defineConfig } from 'vite';

import { precache } from './src/sw/precache.mjs';

export default defineConfig({
  base: '/',
  // Phase 8: the service worker is written from the finished build's own
  // file list (8.3.6).
  plugins: [precache()],
  build: {
    target: 'es2020',
    // The bundle gets its own directory, apart from the generated assets in
    // /assets. Its file names carry a content hash, so it alone can be served
    // immutable; the generated assets keep their names from build to build,
    // and an immutable header on them pinned a returning visitor to whatever
    // texture they first saw.
    assetsDir: 'bundle',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      // Phase 9: the house is a second page, built from the same core.
      input: { main: 'index.html', house: 'house/index.html' },
      output: {
        // Function form rather than the object shorthand: Vite 8 bundles with
        // rolldown, which only accepts a function here. Rollup takes either,
        // so this builds identically on Vite 5 and 6.
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
