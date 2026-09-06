import type { Quality } from '../config/quality'
import { PALETTE, rgba } from '../scene/palette'
import type { SceneState, StageSize } from '../scene/types'
import { mulberry32 } from '../util/math'
import type { Canvas2D } from './canvas'
import type { Fx } from './types'

interface Bubble {
  x: number
  y: number
  r: number
  v: number
  phase: number
  big: boolean
}
interface Speck {
  x: number
  y: number
  r: number
  vx: number
  vy: number
}
interface Impact {
  x: number
  y: number
  born: number
}
const IMPACT_MS = 600

/** Underwater canvas: rising bubbles, marine snow, rain impacts seen from below the surface. */
export function createBubbles(canvas: Canvas2D, quality: Quality): Fx {
  const rnd = mulberry32(27)
  const bubbles: Bubble[] = []
  const specks: Speck[] = []
  const impacts: Impact[] = []
  let W = 1
  let H = 1
  let lastTime = -1
  let carry = 0
  const vents = [0.22, 0.51, 0.78]

  const spawnBubble = (b: Bubble, fresh: boolean) => {
    const vent = vents[Math.floor(rnd() * vents.length)] ?? 0.5
    b.x = (rnd() < 0.7 ? vent : rnd()) * W + (rnd() - 0.5) * 40
    b.y = fresh ? rnd() * H : H * 0.9 + rnd() * 30
    b.big = rnd() < 0.08
    b.r = b.big ? 8 + rnd() * 4 : 1.5 + rnd() * 2.5
    b.v = 40 + rnd() * 50
    b.phase = rnd() * Math.PI * 2
  }

  return {
    resize(size: StageSize) {
      W = size.w
      H = size.h
      bubbles.length = 0
      const n = Math.round(34 * quality.particleMul)
      for (let i = 0; i < n; i++) {
        const b: Bubble = { x: 0, y: 0, r: 1, v: 1, phase: 0, big: false }
        spawnBubble(b, true)
        bubbles.push(b)
      }
      specks.length = 0
      for (let i = 0; i < 80 * quality.particleMul; i++)
        specks.push({
          x: rnd() * W,
          y: rnd() * H,
          r: 0.8 + rnd() * 0.8,
          vx: (rnd() - 0.5) * 6,
          vy: (rnd() - 0.5) * 8,
        })
    },
    update(state: SceneState) {
      const { ctx } = canvas
      canvas.clear()
      if (!state.water.visible) {
        lastTime = -1
        return
      }
      const time = state.time
      const dt = lastTime < 0 || state.reduced ? 0 : Math.min((time - lastTime) / 1000, 0.05)
      lastTime = time
      const reveal = state.water.fishReveal[0]

      // Marine snow: tiny ink specks at low alpha (fainter and greyer the larger/further they are).
      for (const s of specks) {
        ctx.fillStyle = rgba(s.r > 1.8 ? PALETTE.inkFar : PALETTE.ink, s.r > 1.8 ? 0.08 : 0.16)
        if (dt > 0) {
          s.x += s.vx * dt
          s.y += s.vy * dt
          if (s.x < 0) s.x += W
          if (s.x > W) s.x -= W
          if (s.y < 0) s.y += H
          if (s.y > H) s.y -= H
        }
        ctx.fillRect(s.x, s.y, s.r, s.r)
      }

      // Bubbles: an ink outline with a small paper-white highlight arc where the light catches it.
      for (const b of bubbles) {
        if (dt > 0) {
          b.y -= b.v * dt
          b.x += Math.sin(time / 600 + b.phase) * 6 * dt
          if (b.y < H * 0.18) spawnBubble(b, false)
        }
        ctx.lineWidth = 1
        ctx.strokeStyle = rgba(PALETTE.ink, 0.55 * reveal)
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.lineWidth = b.big ? 1.2 : 0.8
        ctx.strokeStyle = rgba(PALETTE.paper, 0.75 * reveal)
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.r * 0.65, Math.PI * 1.05, Math.PI * 1.55)
        ctx.stroke()
      }

      // Rain impacts on the surface, seen from below (ceiling band).
      carry += dt * 8 * quality.particleMul
      while (carry >= 1 && impacts.length < 40) {
        carry -= 1
        impacts.push({ x: rnd() * W, y: H * 0.02 + rnd() * H * 0.16, born: time })
      }
      ctx.lineWidth = 1
      for (let i = impacts.length - 1; i >= 0; i--) {
        const im = impacts[i]
        if (!im) continue
        const u = (time - im.born) / IMPACT_MS
        if (u >= 1) {
          impacts.splice(i, 1)
          continue
        }
        const r = 4 + 32 * u
        ctx.strokeStyle = rgba(PALETTE.ink, 0.4 * (1 - u))
        ctx.beginPath()
        ctx.ellipse(im.x, im.y, r, r / 3, 0, 0, Math.PI * 2)
        ctx.stroke()
        if (u < 0.5) {
          ctx.fillStyle = rgba(PALETTE.paper, 0.5 * (1 - u * 2))
          for (let k = 0; k < 3; k++) {
            ctx.beginPath()
            ctx.arc(im.x + (k - 1) * 6, im.y + 10 + u * 30 + k * 3, 1.6, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
    },
  }
}
