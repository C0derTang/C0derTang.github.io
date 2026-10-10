import { defineConfig, type Plugin } from 'vite'

/**
 * The entry imports the scene chunk dynamically so asset requests go out first; this hint lets
 * the browser fetch that chunk straight from the HTML instead of a round trip later.
 */
const preloadScene = (): Plugin => ({
  name: 'preload-scene-chunk',
  transformIndexHtml: {
    order: 'post',
    handler(_html, ctx) {
      const chunks = Object.values(ctx.bundle ?? {})
      const scene = chunks.find((c) => c.type === 'chunk' && c.isDynamicEntry && c.name === 'boot')
      if (!scene) return []
      return [
        {
          tag: 'link',
          attrs: { rel: 'modulepreload', crossorigin: true, href: `/${scene.fileName}` },
          injectTo: 'head',
        },
      ]
    },
  },
})

export default defineConfig({
  plugins: [preloadScene()],
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
