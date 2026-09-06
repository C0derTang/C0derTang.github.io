import type { Stage } from '../scene/stage'
import type { SceneState } from '../scene/types'

export function createHud(air: Stage, water: Stage, tier: string) {
  const el = document.createElement('pre')
  el.id = 'hud'
  el.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:9;margin:0;padding:8px 10px;font:11px/1.35 ui-monospace,monospace;' +
    'color:#e8f0ee;background:rgba(0,0,0,.55);border-radius:4px;pointer-events:none;max-height:90vh;overflow:hidden;white-space:pre'
  document.body.append(el)
  let frames = 0
  let fpsFrames = 0
  let fpsTime = performance.now()
  let fps = 0
  return {
    update(s: SceneState) {
      frames++
      fpsFrames++
      const now = performance.now()
      if (now - fpsTime > 500) {
        fps = (fpsFrames * 1000) / (now - fpsTime)
        fpsFrames = 0
        fpsTime = now
      }
      if (frames % 10 !== 0) return
      const lines = [
        `t ${s.t.toFixed(4)}  beat ${s.beat}  u ${s.u[s.beat].toFixed(3)}  fps ${fps.toFixed(0)}  tier ${tier}`,
        `cam cz ${s.cam.cz.toFixed(0)} cx ${s.cam.cx.toFixed(0)} cy ${s.cam.cy.toFixed(0)}  doors ${s.doors.toFixed(2)}  wl ${s.wl.toFixed(0)}`,
        `air ${s.air.visible ? 'on ' : 'off'} live ${air.liveCount()}   water ${s.water.visible ? 'on ' : 'off'} live ${water.liveCount()}   rain ${s.rain.alpha.toFixed(2)}${s.rain.clip ? ' clip' : ''} x${s.rain.speed.toFixed(2)} slant ${s.rain.slant.toFixed(2)}`,
        `pan ${s.pan.toFixed(2)}  yaw ${s.yaw.toFixed(0)}`,
        '',
      ]
      for (const L of air.layers) {
        const p = air.projection(L.id)
        if (!p) continue
        lines.push(
          `${L.id.padEnd(14)} ${p.hidden ? '  --  ' : `s ${p.s.toFixed(2).padStart(5)}`} zr ${p.zr.toFixed(2).padStart(5)} op ${p.opacity.toFixed(2)}`,
        )
      }
      el.textContent = lines.join('\n')
    },
  }
}
