import type { Quality } from '../config/quality'
import { rgba } from '../scene/palette'
import type { SceneState, StageSize } from '../scene/types'
import { clamp01, mulberry32, smoothstep } from '../util/math'
import type { Canvas2D } from './canvas'
import type { Fx } from './types'

interface Mote {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  phase: number
}

/** Dust motes drifting in the lamp light while the room is on screen (t .2-.6), brightest near the glow. */
export function createMotes(canvas: Canvas2D, quality: Quality): Fx {
  const rnd = mulberry32(37)
  const motes: Mote[] = []
  let W = 1
  let H = 1
  let lastTime = -1
  return {
    resize(size: StageSize) {
      W = size.w
      H = size.h
      motes.length = 0
      for (let i = 0; i < 50 * quality.particleMul; i++)
        motes.push({
          x: rnd() * W,
          y: rnd() * H,
          r: 0.8 + rnd() * 0.8,
          vx: (rnd() - 0.5) * 8,
          vy: (rnd() - 0.5) * 6,
          phase: rnd() * 6.28,
        })
    },
    update(state: SceneState) {
      const on = smoothstep(0.2, 0.26, state.t) * (1 - smoothstep(0.54, 0.6, state.t))
      if (on <= 0.001 || !state.air.visible) {
        lastTime = -1
        return
      }
      const time = state.time
      const dt = lastTime < 0 || state.reduced ? 0 : Math.min((time - lastTime) / 1000, 0.05)
      lastTime = time
      const { ctx } = canvas
      const gx = state.grade.glowX * W
      const gy = state.grade.glowY * H
      const reach = 0.6 * Math.max(W, H)
      for (const m of motes) {
        if (dt > 0) {
          m.x += (m.vx + Math.sin(time / 900 + m.phase) * 4) * dt
          m.y += (m.vy + Math.cos(time / 1100 + m.phase) * 3) * dt
          if (m.x < 0) m.x += W
          if (m.x > W) m.x -= W
          if (m.y < 0) m.y += H
          if (m.y > H) m.y -= H
        }
        const d = Math.hypot(m.x - gx, m.y - gy)
        const a = 0.25 * on * (1 - clamp01((d - reach * 0.35) / (reach * 0.25)))
        if (a <= 0.01) continue
        ctx.fillStyle = rgba('#f2b45a', a)
        ctx.beginPath()
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2)
        ctx.fill()
      }
    },
  }
}
