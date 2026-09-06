import type { Quality } from '../config/quality'
import { mulberry32 } from '../util/math'

/**
 * Procedural tiles generated once at boot on a canvas: alpha-only luminance (RGB pure black =
 * shade, white = highlight; alpha carries the texture), drawn 3x3 wrapped so they tile
 * seamlessly, encoded as data URLs and referenced from `<image data-tex>` grids (see texRect in
 * draw.ts). `paper` is the surface of the whole page (fixed grain element), `wash` the
 * granulation clipped inside large washes, `causticA/B` the animated dapple on the mud.
 */
export type TexId = 'causticA' | 'causticB' | 'paper' | 'wash'

export type TexLevel = 'full' | 'small' | 'off'

type Draw = (c: CanvasRenderingContext2D, rnd: () => number, w: number, h: number) => void
interface Spec {
  w: number
  h: number
  seed: number
  draw: Draw
  /** skipped on the small level */
  heavy?: boolean
}

/** Module-level switches read by texRect()/textured() so layers can be built before the tiles resolve. */
export const TEX = {
  level: 'full' as TexLevel,
  clip: true,
  single: false,
  skip: [] as string[],
  res: 0,
}
/**
 * Above this part scale texture images are hidden: they are blurry anyway while the layer is
 * dissolving, and Skia's upscale of a tile into a huge destination rect stalled raster workers
 * for ~200 ms (a wall at 11x turns a 256 px tile into a 5000 x 10000 px intermediate).
 */
export const TEX_MAX_SCALE = 2.5

export interface Textures {
  readonly ready: Promise<void>
  readonly generateMs: number
  url(id: TexId): string | undefined
  /** Set href on every <image data-tex> under root (blob URLs, one decode per tile). */
  apply(root: ParentNode): void
}

const wrap = (c: CanvasRenderingContext2D, w: number, h: number, fn: () => void): void => {
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++) {
      c.save()
      c.translate(i * w, j * h)
      fn()
      c.restore()
    }
}

/** Periodic value noise at quarter resolution, upscaled; luminance +-amp at alpha. */
const noiseTile =
  (octaves: number, amp: number, alpha: number): Draw =>
  (c, rnd, w, h) => {
    const m = Math.max(16, Math.floor(w / 4))
    const mh = Math.max(16, Math.floor(h / 4))
    const L = 8
    const grid = Float32Array.from({ length: L * L }, () => rnd())
    const at = (i: number, j: number) => grid[(((j % L) + L) % L) * L + (((i % L) + L) % L)] ?? 0
    const value = (u: number, vv: number) => {
      const i = Math.floor(u)
      const j = Math.floor(vv)
      const fu = u - i
      const fv = vv - j
      const su = fu * fu * (3 - 2 * fu)
      const sv = fv * fv * (3 - 2 * fv)
      const top = at(i, j) + (at(i + 1, j) - at(i, j)) * su
      const bot = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * su
      return top + (bot - top) * sv
    }
    const small = document.createElement('canvas')
    small.width = m
    small.height = mh
    const sc = small.getContext('2d')
    if (!sc) return
    const img = sc.createImageData(m, mh)
    const d = img.data
    for (let y = 0; y < mh; y++)
      for (let x = 0; x < m; x++) {
        let v = 0
        let a = 1
        let norm = 0
        for (let o = 0; o < octaves; o++) {
          const fq = L * 2 ** o
          v += a * value((x / m) * fq, (y / mh) * fq)
          norm += a
          a *= 0.5
        }
        v = v / norm - 0.5
        const k = (y * m + x) * 4
        const lum = v > 0 ? 255 : 0
        d[k] = lum
        d[k + 1] = lum
        d[k + 2] = lum
        d[k + 3] = Math.round(Math.min(1, Math.abs(v) * 2 * amp) * alpha * 255)
      }
    sc.putImageData(img, 0, 0)
    c.imageSmoothingEnabled = true
    c.drawImage(small, 0, 0, w, h)
  }

const caustic: Draw = (c, rnd, w, h) => {
  const step = 44
  const pts: { x: number; y: number }[] = []
  for (let j = 0; j * step * 0.87 < h; j++)
    for (let i = 0; i * step < w; i++)
      pts.push({
        x: i * step + (j % 2) * step * 0.5 + (rnd() - 0.5) * 16,
        y: j * step * 0.87 + (rnd() - 0.5) * 16,
      })
  const edges: [number, number][] = []
  for (let a = 0; a < pts.length; a++) {
    const p = pts[a]
    if (!p) continue
    for (let b = a + 1; b < pts.length; b++) {
      const q = pts[b]
      if (!q) continue
      const dx = q.x - p.x
      const dy = q.y - p.y
      if (dx * dx + dy * dy < step * step * 1.3) edges.push([a, b])
    }
  }
  c.lineCap = 'round'
  wrap(c, w, h, () => {
    for (const [lw, alpha] of [
      [6, 0.05],
      [3, 0.12],
      [1.5, 0.35],
    ] as const) {
      c.strokeStyle = `rgba(217,240,230,${alpha})`
      c.lineWidth = lw
      c.beginPath()
      for (const [a, b] of edges) {
        const p = pts[a]
        const q = pts[b]
        if (!p || !q) continue
        const mx = (p.x + q.x) / 2 + (rnd() - 0.5) * 10
        const my = (p.y + q.y) / 2 + (rnd() - 0.5) * 10
        c.moveTo(p.x, p.y)
        c.quadraticCurveTo(mx, my, q.x, q.y)
      }
      c.stroke()
    }
  })
}

/** Cold-pressed paper for the fixed grain element: mottling, fibres at three angles, fine grain. */
const paper: Draw = (c, rnd, w, h) => {
  noiseTile(2, 0.9, 0.22)(c, rnd, w, h)
  const angles = [0.15, 1.1, 2.4]
  const fibres = Array.from({ length: Math.round((w * h) / 700) }, () => ({
    x: rnd() * w,
    y: rnd() * h,
    len: 6 + rnd() * 22,
    a: (angles[Math.floor(rnd() * 3)] ?? 0) + (rnd() - 0.5) * 0.3,
    dark: rnd() < 0.7,
  }))
  const grain = Array.from({ length: Math.round((w * h) / 110) }, () => ({
    x: rnd() * w,
    y: rnd() * h,
    dark: rnd() < 0.5,
  }))
  c.lineCap = 'round'
  c.lineWidth = 0.8
  wrap(c, w, h, () => {
    for (const k of fibres) {
      c.strokeStyle = k.dark ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.09)'
      c.beginPath()
      c.moveTo(k.x, k.y)
      c.lineTo(k.x + Math.cos(k.a) * k.len, k.y + Math.sin(k.a) * k.len)
      c.stroke()
    }
  })
  for (const g of grain) {
    c.fillStyle = g.dark ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.08)'
    c.fillRect(g.x, g.y, 1, 1)
  }
}

/** Watercolour granulation clipped inside large washes: coarse blotches plus pigment specks. */
const washTile: Draw = (c, rnd, w, h) => {
  noiseTile(3, 1.3, 0.5)(c, rnd, w, h)
  const specks = Array.from({ length: 450 }, () => ({
    x: rnd() * w,
    y: rnd() * h,
    r: 0.6 + rnd() * 1.4,
    dark: rnd() < 0.6,
  }))
  wrap(c, w, h, () => {
    for (const s of specks) {
      c.fillStyle = s.dark ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.12)'
      c.beginPath()
      c.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      c.fill()
    }
  })
}

const SPECS: Readonly<Record<TexId, Spec>> = {
  causticA: { w: 512, h: 256, seed: 108, draw: caustic },
  causticB: { w: 512, h: 256, seed: 109, draw: caustic },
  paper: { w: 512, h: 512, seed: 110, draw: paper },
  wash: { w: 256, h: 256, seed: 111, draw: washTile, heavy: true },
}

export function createTextures(quality: Quality, override?: string | null): Textures {
  const level: TexLevel =
    override === 'off' || override === 'small' || override === 'full'
      ? override
      : quality.tier === 'low'
        ? 'small'
        : 'full'
  TEX.level = level
  const urls = new Map<TexId, string>()
  const canvases = new Map<TexId, HTMLCanvasElement>()
  const pending: Promise<void>[] = []
  const t0 = performance.now()
  const res = TEX.res || (level === 'small' ? 0.5 : 1)
  if (level !== 'off') {
    for (const id of Object.keys(SPECS) as TexId[]) {
      const spec = SPECS[id]
      if (level === 'small' && spec.heavy) continue
      if (TEX.skip.includes(id)) continue
      const cv = document.createElement('canvas')
      cv.width = Math.max(8, Math.round(spec.w * res))
      cv.height = Math.max(8, Math.round(spec.h * res))
      const c = cv.getContext('2d', { alpha: true })
      if (!c) break
      c.scale(res, res)
      spec.draw(c, mulberry32(spec.seed), spec.w, spec.h)
      canvases.set(id, cv)
      // Inline data URLs: decoded once into the memory cache and never re-fetched; blob URLs
      // caused occasional 200 ms layout stalls (image re-resolution) in the scroll loop.
      urls.set(id, cv.toDataURL('image/png'))
    }
  }
  const generateMs = performance.now() - t0
  const apply = (root: ParentNode): void => {
    for (const img of root.querySelectorAll<SVGImageElement>('image[data-tex]')) {
      const u = urls.get(img.dataset.tex as TexId)
      if (u && img.getAttribute('href') !== u) img.setAttribute('href', u)
    }
  }
  return {
    ready: Promise.all(pending).then(() => undefined),
    generateMs,
    url: (id) => urls.get(id),
    apply,
  }
}
