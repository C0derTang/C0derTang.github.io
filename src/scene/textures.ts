import type { Quality } from '../config/quality'
import { mulberry32 } from '../util/math'

/**
 * Procedural material tiles generated once at boot on a canvas: alpha-only luminance (RGB pure
 * black = shade, white = highlight; alpha carries the material), drawn 3x3 wrapped so they tile
 * seamlessly, encoded off-thread with toBlob and referenced by blob URL from
 * `<image data-tex>` grids (see texRect in draw.ts). The fill underneath stays the colour source.
 */
export type TexId =
  | 'thatch'
  | 'thatchV'
  | 'wood'
  | 'woodV'
  | 'plaster'
  | 'tatamiH'
  | 'tatamiV'
  | 'stone'
  | 'water'
  | 'bark'
  | 'causticA'
  | 'causticB'

export type TexLevel = 'full' | 'small' | 'off'

type Draw = (c: CanvasRenderingContext2D, rnd: () => number, w: number, h: number) => void
interface Spec {
  w: number
  h: number
  seed: number
  draw: Draw
  /** rotate another tile 90 degrees instead of drawing */
  rotateOf?: TexId
  /** skipped on the small level */
  heavy?: boolean
}

/** Module-level switches read by texRect()/textured() so layers can be built before the tiles resolve. */
export const TEX = { level: 'full' as TexLevel, clip: true, single: false }
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

const thatch: Draw = (c, rnd, w, h) => {
  const strands = Array.from({ length: Math.round((w * h) / 145) }, () => ({
    x: rnd() * w,
    y: rnd() * h,
    len: 30 + rnd() * 40,
    lean: (rnd() - 0.5) * 0.2,
    bend: (rnd() - 0.5) * 8,
    dark: rnd() < 0.55,
  }))
  c.lineCap = 'round'
  wrap(c, w, h, () => {
    for (const k of strands) {
      c.strokeStyle = k.dark ? 'rgba(28,20,12,.32)' : 'rgba(222,200,158,.26)'
      c.lineWidth = k.dark ? 1.6 : 1.1
      c.beginPath()
      c.moveTo(k.x, k.y)
      c.quadraticCurveTo(
        k.x + (k.len * k.lean) / 2 + k.bend,
        k.y + k.len / 2,
        k.x + k.len * k.lean,
        k.y + k.len,
      )
      c.stroke()
    }
  })
}

const wood: Draw = (c, rnd, w, h) => {
  const lines = Array.from({ length: 58 }, (_, i) => ({
    y: rnd() * h,
    amp: 1 + rnd() * 2,
    freq: 0.01 + rnd() * 0.02,
    phase: rnd() * 6.28,
    light: i >= 50,
  }))
  const knots = Array.from({ length: 3 }, () => ({ x: rnd() * w, y: rnd() * h, r: 6 + rnd() * 8 }))
  wrap(c, w, h, () => {
    for (const l of lines) {
      c.strokeStyle = l.light ? 'rgba(240,220,190,.15)' : 'rgba(20,12,8,.3)'
      c.lineWidth = l.light ? 1 : 1 + rnd() * 1
      c.beginPath()
      for (let x = 0; x <= w; x += 8) {
        const y = l.y + Math.sin(x * l.freq + l.phase) * l.amp
        if (x === 0) c.moveTo(x, y)
        else c.lineTo(x, y)
      }
      c.stroke()
    }
    for (const k of knots) {
      for (let r = k.r; r > 1; r -= 2.5) {
        c.strokeStyle = 'rgba(20,12,8,.2)'
        c.lineWidth = 1
        c.beginPath()
        c.ellipse(k.x, k.y, r * 1.6, r, 0, 0, Math.PI * 2)
        c.stroke()
      }
    }
  })
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

const plaster: Draw = (c, rnd, w, h) => {
  noiseTile(3, 1.2, 0.35)(c, rnd, w, h)
  const blotches = Array.from({ length: 30 }, () => ({
    x: rnd() * w,
    y: rnd() * h,
    r: 8 + rnd() * 22,
  }))
  const cracks = Array.from({ length: 4 }, () => ({
    x: rnd() * w,
    y: rnd() * h,
    n: 4 + Math.floor(rnd() * 5),
  }))
  wrap(c, w, h, () => {
    for (const b of blotches) {
      const g = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r)
      g.addColorStop(0, 'rgba(0,0,0,.06)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      c.fillStyle = g
      c.beginPath()
      c.arc(b.x, b.y, b.r, 0, Math.PI * 2)
      c.fill()
    }
    c.strokeStyle = 'rgba(0,0,0,.18)'
    c.lineWidth = 0.8
    for (const k of cracks) {
      c.beginPath()
      c.moveTo(k.x, k.y)
      let x = k.x
      let y = k.y
      for (let i = 0; i < k.n; i++) {
        x += (rnd() - 0.4) * 14
        y += rnd() * 12
        c.lineTo(x, y)
      }
      c.stroke()
    }
  })
}

const tatami: Draw = (c, rnd, w, h) => {
  for (let y = 0; y < h; y += 2) {
    const row = y / 2
    const light = row % 2 === 1
    c.fillStyle = light ? 'rgba(255,250,220,.18)' : 'rgba(60,50,30,.25)'
    const off = (row % 4 < 2 ? 0 : 3) + (rnd() < 0.15 ? 1 : 0)
    for (let x = -7 + off; x < w; x += 7) c.fillRect(x, y, 6, 1.2)
  }
}

const stone: Draw = (c, rnd, w, h) => {
  noiseTile(4, 1.1, 0.4)(c, rnd, w, h)
  const spots = Array.from({ length: 12 }, () => ({
    x: rnd() * w,
    y: rnd() * h,
    r: 5 + rnd() * 10,
  }))
  wrap(c, w, h, () => {
    for (const s of spots) {
      const g = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r)
      g.addColorStop(0, 'rgba(0,0,0,.12)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      c.fillStyle = g
      c.beginPath()
      c.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      c.fill()
    }
  })
}

const water: Draw = (c, rnd, w, h) => {
  const streaks = Array.from({ length: 200 }, () => ({
    x: rnd() * w,
    y: rnd() * h,
    len: 20 + rnd() * 60,
    light: rnd() < 0.5,
  }))
  wrap(c, w, h, () => {
    for (const s of streaks) {
      c.fillStyle = s.light ? 'rgba(255,255,255,.12)' : 'rgba(0,20,30,.12)'
      c.fillRect(s.x, s.y, s.len, 1)
    }
  })
}

const bark: Draw = (c, rnd, w, h) => {
  const streaks = Array.from({ length: 60 }, () => ({
    x: rnd() * w,
    y: rnd() * h,
    len: 40 + rnd() * 80,
    light: rnd() < 0.35,
  }))
  wrap(c, w, h, () => {
    for (const s of streaks) {
      c.strokeStyle = s.light ? 'rgba(240,220,190,.16)' : 'rgba(20,12,8,.3)'
      c.lineWidth = s.light ? 0.8 : 1.2
      c.beginPath()
      c.moveTo(s.x, s.y)
      for (let y = 8; y <= s.len; y += 8) c.lineTo(s.x + (rnd() - 0.5) * 2, s.y + y)
      c.stroke()
    }
  })
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

const SPECS: Readonly<Record<TexId, Spec>> = {
  thatch: { w: 256, h: 512, seed: 101, draw: thatch },
  thatchV: { w: 512, h: 256, seed: 101, draw: thatch, rotateOf: 'thatch' },
  wood: { w: 256, h: 256, seed: 102, draw: wood },
  woodV: { w: 256, h: 256, seed: 102, draw: wood, rotateOf: 'wood' },
  plaster: { w: 256, h: 256, seed: 103, draw: plaster, heavy: true },
  tatamiH: { w: 128, h: 64, seed: 104, draw: tatami },
  tatamiV: { w: 64, h: 128, seed: 104, draw: tatami, rotateOf: 'tatamiH' },
  stone: { w: 128, h: 128, seed: 105, draw: stone },
  water: { w: 256, h: 256, seed: 106, draw: water, heavy: true },
  bark: { w: 64, h: 256, seed: 107, draw: bark },
  causticA: { w: 512, h: 256, seed: 108, draw: caustic },
  causticB: { w: 512, h: 256, seed: 109, draw: caustic },
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
  const res = level === 'small' ? 0.5 : 1
  if (level !== 'off') {
    for (const id of Object.keys(SPECS) as TexId[]) {
      const spec = SPECS[id]
      if (level === 'small' && spec.heavy) continue
      const cv = document.createElement('canvas')
      cv.width = Math.max(8, Math.round(spec.w * res))
      cv.height = Math.max(8, Math.round(spec.h * res))
      const c = cv.getContext('2d', { alpha: true })
      if (!c) break
      if (spec.rotateOf) {
        const src = canvases.get(spec.rotateOf)
        if (!src) continue
        c.translate(cv.width, 0)
        c.rotate(Math.PI / 2)
        c.drawImage(src, 0, 0)
      } else {
        c.scale(res, res)
        spec.draw(c, mulberry32(spec.seed), spec.w, spec.h)
      }
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
