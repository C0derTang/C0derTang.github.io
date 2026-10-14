// Builds the banner art from the owner-supplied sources in assets-src/art/ (see
// public/assets/ATTRIBUTION.md). Run with `pnpm assets:art` after changing a source or a setting
// below, and commit the output. Each image becomes ink-coloured line art with an alpha channel
// (grey, two blurs, sharpened difference, soft threshold, faded edges), encoded as WebP in
// Playwright's Chromium, so no image library is needed.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'assets-src/art')
const OUT = join(root, 'public/assets/art')

const WIDTH = 512
const MAX_BYTES = 40 * 1024
/** Blur radii below were tuned at a 400 px output; scale them to the shipped width. */
const TUNED_WIDTH = 400
const INK = [0x1a, 0x1c, 0x1e]

/**
 * name; blur sigma; sharpen amount; threshold; softness; crop [x, y, w, h] as source fractions;
 * fade: width of the border fade as a fraction of the image.
 * levels: alpha steps (WebP codes alpha losslessly, so fewer steps make a smaller file).
 * ellipse: fade the ink out in an ellipse (a photo with a frame) as well as at the border.
 */
const JOBS = [
  {
    name: 'waifu',
    sigma: 2.0,
    sharp: 12,
    eps: 0.5,
    phi: 12,
    crop: [0.08, 0.1, 0.84, 0.9],
    fade: 0.16,
    ellipse: false,
    levels: 24,
  },
  {
    name: 'robot',
    sigma: 1.9,
    sharp: 7,
    eps: 0.36,
    phi: 12,
    crop: [0.03, 0, 0.97, 1],
    fade: 0.07,
    ellipse: true,
    levels: 8,
  },
]

/** Runs in the page: decode, filter and encode one image. */
async function ink({
  src,
  width,
  sigma,
  sharp,
  eps,
  phi,
  crop,
  fade,
  ellipse,
  color,
  levels,
  quality,
}) {
  const img = new Image()
  img.src = src
  await img.decode()
  const sx = crop[0] * img.width
  const sy = crop[1] * img.height
  const sw = crop[2] * img.width
  const sh = crop[3] * img.height
  const W = width
  const H = Math.round((W * sh) / sw)
  const gray = (blur) => {
    const c = new OffscreenCanvas(W, H)
    const x = c.getContext('2d', { willReadFrequently: true })
    x.fillStyle = '#fff'
    x.fillRect(0, 0, W, H)
    x.filter = `grayscale(1) blur(${blur}px)`
    x.imageSmoothingQuality = 'high'
    x.drawImage(img, sx, sy, sw, sh, 0, 0, W, H)
    return x.getImageData(0, 0, W, H).data
  }
  const g1 = gray(sigma)
  const g2 = gray(sigma * 1.6)
  const canvas = new OffscreenCanvas(W, H)
  const ctx = canvas.getContext('2d')
  const out = ctx.createImageData(W, H)
  for (let i = 0; i < W * H; i++) {
    const a = (g1[i * 4] ?? 255) / 255
    const b = (g2[i * 4] ?? 255) / 255
    const s = (1 + sharp) * a - sharp * b
    const t = s >= eps ? 1 : 1 + Math.tanh(phi * (s - eps))
    // fade the ink out toward the edges so the source frame never shows
    const u = (i % W) / W
    const v = Math.floor(i / W) / H
    let edge = Math.min(1, Math.min(u, 1 - u, v, 1 - v) / fade)
    if (ellipse) {
      const r = Math.hypot((u - 0.5) / 0.56, (v - 0.53) / 0.56)
      edge *= Math.max(0, Math.min(1, (1 - r) / 0.16))
    }
    out.data[i * 4] = color[0]
    out.data[i * 4 + 1] = color[1]
    out.data[i * 4 + 2] = color[2]
    // WebP stores alpha losslessly, so quantise it to keep the file small
    out.data[i * 4 + 3] = Math.round(Math.round(levels * (1 - t) * edge) * (255 / levels))
  }
  ctx.putImageData(out, 0, 0)
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality })
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

const browser = await chromium.launch()
const page = await browser.newPage()
await mkdir(OUT, { recursive: true })
for (const { name, sigma, ...job } of JOBS) {
  const data = await readFile(join(SRC, `${name}.png`))
  const args = {
    ...job,
    sigma: (sigma * WIDTH) / TUNED_WIDTH,
    src: `data:image/png;base64,${data.toString('base64')}`,
    width: WIDTH,
    color: INK,
  }
  // Highest quality that stays under the byte budget.
  let bytes = null
  for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4]) {
    bytes = Buffer.from(await page.evaluate(ink, { ...args, quality }), 'base64')
    if (bytes.length <= MAX_BYTES) break
  }
  if (!bytes || bytes.length > MAX_BYTES) throw new Error(`${name}.webp is over ${MAX_BYTES} bytes`)
  await writeFile(join(OUT, `${name}.webp`), bytes)
  console.log(`${name}.webp ${bytes.length} bytes`)
}
await browser.close()
