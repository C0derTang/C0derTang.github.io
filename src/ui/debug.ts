import type { App } from '../three/app'
import type { SceneState } from '../three/state'

export function createHud(app: App) {
  const el = document.createElement('pre')
  el.id = 'hud'
  el.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:9;margin:0;padding:8px 10px;font:11px/1.35 ui-monospace,monospace;' +
    'color:#e8f0ee;background:rgba(0,0,0,.55);border-radius:4px;pointer-events:none;white-space:pre'
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
      const p = s.pose
      const st = app.stats()
      el.textContent = [
        `t ${s.t.toFixed(4)}  beat ${s.beat}  u ${s.u[s.beat].toFixed(3)}  fps ${fps.toFixed(0)}`,
        `cam ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}  yaw ${p.yaw.toFixed(0)}  fov ${p.fov.toFixed(0)}  doors ${s.doors.toFixed(2)}`,
        `${s.underwater ? 'under' : 'above'} depth ${s.depth.toFixed(2)}  fog ${s.fog.density.toFixed(3)}  focus ${s.focus.distance.toFixed(1)}`,
        `rain x${s.rain.speed.toFixed(2)} slant ${s.rain.slant.toFixed(2)}  calls ${st.calls}  tris ${(st.triangles / 1000).toFixed(0)}k`,
      ].join('\n')
    },
  }
}
