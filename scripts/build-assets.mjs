// Builds the shipped textures and the small HDRI from the CC0 sources in assets-src/ (see
// public/assets/ATTRIBUTION.md). Run with `pnpm assets` after changing a source or a setting
// below, and commit the output. Encoding runs in Playwright's Chromium (canvas -> WebP), so no
// image library is needed.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'assets-src/tex')
const OUT = join(root, 'public/assets')

/** Edge length in pixels per tier: colour and normal maps, then the packed AO/roughness map. */
const TIERS = { high: { map: 1024, orm: 512 }, low: { map: 512, orm: 256 } }
const QUALITY = { color: 0.82, normal: 0.88, orm: 0.8 }

/** Runs in the page: decode the sources, resample, pack and encode one set at one tier. */
async function encodeSet({ files, size, quality }) {
  const pixels = async (dataUrl, edge) => {
    const img = new Image()
    img.src = dataUrl
    await img.decode()
    const canvas = new OffscreenCanvas(edge, edge)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, edge, edge)
    return { canvas, ctx }
  }
  const webp = async (canvas, q) => {
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: q })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(binary)
  }
  const color = await pixels(files.color, size.map)
  const normal = await pixels(files.normal, size.map)
  // three.js reads ambient occlusion from red and roughness from green, so one map serves both.
  const ao = await pixels(files.ao, size.orm)
  const rough = await pixels(files.rough, size.orm)
  const packed = ao.ctx.getImageData(0, 0, size.orm, size.orm)
  const roughness = rough.ctx.getImageData(0, 0, size.orm, size.orm).data
  for (let i = 0; i < packed.data.length; i += 4) {
    packed.data[i + 1] = roughness[i + 1]
    packed.data[i + 2] = 0
    packed.data[i + 3] = 255
  }
  ao.ctx.putImageData(packed, 0, 0)
  return {
    color: await webp(color.canvas, quality.color),
    normal: await webp(normal.canvas, quality.normal),
    orm: await webp(ao.canvas, quality.orm),
  }
}

async function buildTextures() {
  const entries = await readdir(SRC, { withFileTypes: true })
  const sets = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  const browser = await chromium.launch()
  const page = await browser.newPage()
  let total = 0
  for (const set of sets) {
    const files = {}
    for (const map of ['color', 'normal', 'rough', 'ao']) {
      const data = await readFile(join(SRC, set, `${map}.jpg`))
      files[map] = `data:image/jpeg;base64,${data.toString('base64')}`
    }
    for (const [tier, size] of Object.entries(TIERS)) {
      const out = await page.evaluate(encodeSet, { files, size, quality: QUALITY })
      const dir = join(OUT, 'tex', tier, set)
      await mkdir(dir, { recursive: true })
      for (const [map, base64] of Object.entries(out)) {
        const bytes = Buffer.from(base64, 'base64')
        total += bytes.length
        await writeFile(join(dir, `${map}.webp`), bytes)
      }
    }
  }
  await browser.close()
  console.log(`textures: ${sets.length} sets, ${(total / 1e6).toFixed(2)} MB over both tiers`)
}

/** Radiance RGBE reader for the run-length encoded scanlines Poly Haven ships. */
function readHdr(buffer) {
  let pos = 0
  let width = 0
  let height = 0
  for (;;) {
    const end = buffer.indexOf(0x0a, pos)
    const line = buffer.toString('latin1', pos, end)
    pos = end + 1
    const size = /^-Y (\d+) \+X (\d+)$/.exec(line)
    if (size) {
      height = Number(size[1])
      width = Number(size[2])
      break
    }
  }
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    if (buffer[pos] !== 2 || buffer[pos + 1] !== 2) throw new Error('HDR is not run-length encoded')
    pos += 4
    for (let channel = 0; channel < 4; channel++) {
      let x = 0
      while (x < width) {
        let count = buffer[pos++]
        if (count > 128) {
          count -= 128
          const value = buffer[pos++]
          while (count-- > 0) data[(y * width + x++) * 4 + channel] = value
        } else while (count-- > 0) data[(y * width + x++) * 4 + channel] = buffer[pos++]
      }
    }
  }
  return { width, height, data }
}

/**
 * The low tier's environment: the 1K overcast sky box-filtered in linear light. The sky is
 * low-frequency and only lights and reflects (the background is fog), so 256 px is enough.
 */
async function buildHdri(name, source, factor) {
  const { width, height, data } = readHdr(await readFile(join(OUT, 'hdri', source)))
  const w = width / factor
  const h = height / factor
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sum = [0, 0, 0]
      for (let dy = 0; dy < factor; dy++)
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * width + x * factor + dx) * 4
          const scale = data[i + 3] === 0 ? 0 : 2 ** (data[i + 3] - 136)
          for (let c = 0; c < 3; c++) sum[c] += data[i + c] * scale
        }
      const rgb = sum.map((v) => v / (factor * factor))
      const max = Math.max(...rgb)
      const o = (y * w + x) * 4
      if (max < 1e-32) continue
      const exponent = Math.ceil(Math.log2(max) + 1e-9)
      const scale = 256 / 2 ** exponent
      for (let c = 0; c < 3; c++) out[o + c] = Math.min(255, Math.floor(rgb[c] * scale))
      out[o + 3] = exponent + 128
    }
  // Flat (not run-length encoded) scanlines are valid Radiance and keep the writer trivial.
  const header = Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`, 'latin1')
  await writeFile(join(OUT, 'hdri', name), Buffer.concat([header, out]))
  console.log(`hdri: ${name} ${w}x${h}, ${((header.length + out.length) / 1e3).toFixed(0)} kB`)
}

await buildTextures()
await buildHdri('kloofendal_overcast_256.hdr', 'kloofendal_overcast_1k.hdr', 4)
