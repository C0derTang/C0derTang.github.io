import { defineConfig } from 'vite'

export default defineConfig({
  base: '/', // user site: served at the domain root
  build: {
    target: 'baseline-widely-available',
    sourcemap: false,
    reportCompressedSize: true,
    // three.js is one big module; the budget is measured in gzip bytes, not chunks
    chunkSizeWarningLimit: 900,
  },
  css: { devSourcemap: true },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
})
