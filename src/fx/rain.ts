import type { Quality } from '../config/quality'
import { PALETTE, rgba } from '../scene/palette'
import type { SceneState, StageSize } from '../scene/types'
import { mulberry32 } from '../util/math'
import { clipRects, type Canvas2D } from './canvas'
import type { Fx } from './types'

interface Band {
  density: number // per 1000x1000 px
  len: number // fraction of viewport height
  width: number
  alpha: number
  speed: number // px/s
}

const BANDS: readonly Band[] = [
  { density: 60, len: 0.02, width: 1, alpha: 0.1, speed: 900 },
  { density: 90, len: 0.035, width: 1.5, alpha: 0.18, speed: 1400 },
  { density: 50, len: 0.06, width: 2, alpha: 0.28, speed: 2200 },
]

interface Drop {
  x: number
  y: number
  v: number // speed multiplier
}
interface Ring {
  x: number
  y: number
  born: number
}

const RING_MS = 450
const MAX_RINGS = 60

/**
 * Canvas rain: three depth bands of batched streaks with a slow gust, drops confined to the
 * state's clip rects (windows and the shoji gap while inside), splash rings on the ground line,
 * and a drip line along the eave. Time-based; a frozen `time` gives a static frame.
 */
export function createRain(canvas: Canvas2D, quality: Quality): Fx {
  const rnd = mulberry32(7)
  const bands: Drop[][] = BANDS.map(() => [])
  const drips: Drop[] = []
  const paper: Drop[] = []
  const rings: Ring[] = []
  let W = 1
  let H = 1
  let lastTime = -1
  let lastEaveKey = ''

  const populate = () => {
    const area = (W * H) / 1e6
    BANDS.forEach((b, i) => {
      const n = Math.round(b.density * area * quality.particleMul)
      const list = bands[i] ?? []
      list.length = 0
      for (let k = 0; k < n; k++)
        list.push({ x: rnd() * W * 1.2 - W * 0.1, y: rnd() * H, v: 0.85 + rnd() * 0.3 })
      bands[i] = list
    })
  }

  return {
    resize(size: StageSize) {
      W = size.w
      H = size.h
      populate()
    },
    update(state: SceneState) {
      const { ctx } = canvas
      const alpha = state.rain.alpha
      if (alpha <= 0.001 || !state.air.visible) return
      const time = state.time
      const dt = lastTime < 0 || state.reduced ? 0 : Math.min((time - lastTime) / 1000, 0.05)
      lastTime = time

      // gust: slow angle/speed drift
      const gust = Math.sin(time / 7300) * 0.5 + Math.sin(time / 2900) * 0.5
      const angle = ((12 + 4 * gust) * Math.PI) / 180
      const dx = Math.sin(angle)
      const dy = Math.cos(angle)
      const speedMul = 1 + 0.15 * gust

      ctx.save()
      if (state.rain.clip) clipRects(ctx, state.rain.clip)
      ctx.lineCap = 'round'

      BANDS.forEach((b, i) => {
        const list = bands[i]
        if (!list) return
        const len = b.len * H
        ctx.strokeStyle = rgba(PALETTE.rainStreak, b.alpha * alpha)
        ctx.lineWidth = b.width
        ctx.beginPath()
        const groundY = i === 2 ? state.rain.groundY : null
        for (const d of list) {
          if (dt > 0) {
            const s = b.speed * d.v * speedMul * dt
            d.x += dx * s
            d.y += dy * s
            if (groundY !== null && d.y >= groundY && d.y - dy * s < groundY) {
              if (rings.length < MAX_RINGS && rnd() < 0.35)
                rings.push({ x: d.x, y: groundY, born: time })
              d.y = -len
              d.x = rnd() * W * 1.2 - W * 0.1
            } else if (d.y > H + len) {
              d.y = -len
              d.x = rnd() * W * 1.2 - W * 0.1
            }
          }
          ctx.moveTo(d.x, d.y)
          ctx.lineTo(d.x - dx * len, d.y - dy * len)
        }
        ctx.stroke()
      })

      // Eave drip line (amadare): drops fall straight from the eave to the ground line.
      const eave = state.rain.eave
      if (eave && state.rain.groundY !== null) {
        const key = `${Math.round(eave.x0)}:${Math.round(eave.x1)}`
        if (key !== lastEaveKey) {
          lastEaveKey = key
          drips.length = 0
          const n = Math.max(2, Math.round(((eave.x1 - eave.x0) / 26) * quality.particleMul))
          for (let k = 0; k < n; k++)
            drips.push({
              x: eave.x0 + (k + 0.5) * ((eave.x1 - eave.x0) / n),
              y: eave.y + rnd() * (state.rain.groundY - eave.y),
              v: 0.9 + rnd() * 0.2,
            })
        }
        ctx.strokeStyle = rgba(PALETTE.rainStreak, 0.45 * alpha)
        ctx.lineWidth = 2.5
        ctx.beginPath()
        for (const d of drips) {
          if (dt > 0) {
            d.y += 700 * d.v * dt
            if (d.y >= state.rain.groundY) {
              if (rings.length < MAX_RINGS)
                rings.push({ x: d.x, y: state.rain.groundY, born: time })
              d.y = eave.y
            }
          }
          ctx.moveTo(d.x, d.y)
          ctx.lineTo(d.x, d.y - 14)
        }
        ctx.stroke()
      }

      // Rain running down the outside of the shoji paper: slow, wide, faint shadows.
      const paperClip = state.rain.paperClip
      if (paperClip?.length) {
        if (paper.length === 0)
          for (let k = 0; k < 25 * quality.particleMul; k++)
            paper.push({ x: rnd(), y: rnd() * H, v: 0.8 + rnd() * 0.4 })
        ctx.save()
        clipRects(ctx, paperClip)
        ctx.strokeStyle = 'rgba(60,50,40,.06)'
        ctx.lineWidth = 6
        ctx.lineCap = 'round'
        ctx.beginPath()
        const span = paperClip.reduce((a, r) => a + Math.max(0, r.w), 0)
        for (const d of paper) {
          if (dt > 0) {
            d.y += 500 * d.v * dt
            if (d.y > H + 40) {
              d.y = -40
              d.x = rnd()
            }
          }
          // map the 0..1 x onto the union of the paper rects
          let px = d.x * span
          let sx = 0
          for (const r of paperClip) {
            if (px <= r.w) {
              sx = r.x + px
              break
            }
            px -= r.w
            sx = r.x + r.w
          }
          ctx.moveTo(sx + 2, d.y)
          ctx.lineTo(sx - 2, d.y - 0.08 * H)
        }
        ctx.stroke()
        ctx.restore()
      }

      // Splash rings.
      ctx.lineWidth = 1.2
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i]
        if (!r) continue
        const u = (time - r.born) / RING_MS
        if (u >= 1) {
          rings.splice(i, 1)
          continue
        }
        const rx = 2 + 12 * u
        ctx.strokeStyle = rgba(PALETTE.splash, 0.35 * (1 - u) * alpha)
        ctx.beginPath()
        ctx.ellipse(r.x, r.y, rx, rx * 0.33, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.restore()
    },
  }
}
