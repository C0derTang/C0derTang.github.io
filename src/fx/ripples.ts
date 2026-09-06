import type { Quality } from '../config/quality'
import { PALETTE, rgba } from '../scene/palette'
import type { SceneState, StageSize } from '../scene/types'
import { lerp, mulberry32 } from '../util/math'
import { clipRects, type Canvas2D } from './canvas'
import type { Fx } from './types'

interface Ring {
  x: number
  y: number
  born: number
  size: number
}
const RING_MS = 700
const MAX = 140

/** Rain rings on the paddy water: spawned inside the projected water polygon, below the horizon. */
export function createRipples(canvas: Canvas2D, quality: Quality): Fx {
  const rnd = mulberry32(17)
  const rings: Ring[] = []
  let W = 1
  let H = 1
  let lastTime = -1
  let carry = 0
  const stipple: { x: number; y: number; phase: number }[] = []

  return {
    resize(size: StageSize) {
      W = size.w
      H = size.h
      stipple.length = 0
      for (let i = 0; i < 200 * quality.particleMul; i++)
        stipple.push({ x: rnd() * W, y: rnd(), phase: rnd() * 10 })
    },
    update(state: SceneState) {
      const { ctx } = canvas
      const r = state.ripples
      if (r.strength <= 0.001 || !r.polygon || !state.air.visible) {
        lastTime = -1
        rings.length = 0
        return
      }
      const time = state.time
      const dt = lastTime < 0 || state.reduced ? 0 : Math.min((time - lastTime) / 1000, 0.05)
      lastTime = time
      const xs = r.polygon.map((p) => p.x)
      const ys = r.polygon.map((p) => p.y)
      const x0 = Math.max(0, Math.min(...xs))
      const x1 = Math.min(W, Math.max(...xs))
      const y0 = Math.max(0, r.horizonY, Math.min(...ys))
      const y1 = Math.min(H, Math.max(...ys))
      if (x1 <= x0 || y1 <= y0) return

      carry += dt * 70 * quality.particleMul * r.strength
      while (carry >= 1 && rings.length < MAX) {
        carry -= 1
        const depth = rnd() ** 0.7
        rings.push({
          x: x0 + rnd() * (x1 - x0),
          y: lerp(y0, y1, depth),
          born: time,
          size: lerp(6, 28, depth),
        })
      }
      if (state.reduced && rings.length === 0) {
        for (let i = 0; i < 40; i++) {
          const depth = rnd() ** 0.7
          rings.push({
            x: x0 + rnd() * (x1 - x0),
            y: lerp(y0, y1, depth),
            born: time - rnd() * RING_MS,
            size: lerp(6, 28, depth),
          })
        }
      }

      ctx.save()
      if (r.clip) clipRects(ctx, r.clip)
      for (let i = rings.length - 1; i >= 0; i--) {
        const g = rings[i]
        if (!g) continue
        const u = (time - g.born) / RING_MS
        if (u >= 1) {
          rings.splice(i, 1)
          continue
        }
        const rx = g.size * (0.15 + 0.85 * u)
        const ry = rx * 0.28
        const a = (1 - u) * r.strength
        // thin ink ring fading out, with a paper-white gap pooling just inside it
        ctx.lineWidth = 1
        ctx.strokeStyle = rgba(PALETTE.ink, 0.35 * a)
        ctx.beginPath()
        ctx.ellipse(g.x, g.y, rx, ry, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.lineWidth = 0.8
        ctx.strokeStyle = rgba(PALETTE.paper, 0.4 * a)
        ctx.beginPath()
        ctx.ellipse(g.x, g.y, rx * 0.8, ry * 0.8, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      // far stipple: rain hitting distant water near the horizon, fine ink flecks
      ctx.fillStyle = rgba(PALETTE.inkFar, 0.25 * r.strength)
      const band = Math.min(40, (y1 - y0) * 0.15)
      for (const s of stipple) {
        if (s.x < x0 || s.x > x1) continue
        const a = Math.sin(time / 90 + s.phase)
        if (a < 0.6) continue
        ctx.fillRect(s.x, y0 + s.y * band, 1.5, 1)
      }
      ctx.restore()
    },
  }
}
