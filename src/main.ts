import './styles/index.css'
import 'lenis/dist/lenis.css'
import Lenis from 'lenis'
import { engine } from 'animejs'
import { DESIGN, SCROLL_LEN_VH } from './config/beats'
import { detectQuality } from './config/quality'
import { createFx } from './fx'
import { createGradeStack, installGrainTile } from './fx/grade'
import { buildAirLayers } from './scene/air'
import { createStage, type Stage } from './scene/stage'
import { computeState } from './scene/state'
import type { SceneState, StageSize } from './scene/types'
import { TEX, createTextures } from './scene/textures'
import { buildWaterLayers } from './scene/water'
import { mountWaterline } from './scene/waterline'
import { createDirector } from './scroll/director'
import { createBench } from './ui/bench'
import { createHud } from './ui/debug'
import { createOverlay } from './ui/overlay'
import { mustGet, styleWrite } from './util/dom'

declare global {
  interface Window {
    __scene?: {
      seek(t: number): void
      freeze(on: boolean): void
      readonly state: SceneState | undefined
      air: Stage
      water: Stage
      size: StageSize
    }
  }
}

history.scrollRestoration = 'manual'
// The director ticks anime.js; this must be off before the first animate() call (layer build),
// otherwise anime starts its own rAF loop and ambient loops run outside the director.
engine.useDefaultMainLoop = false

const params = new URLSearchParams(location.search)
const quality = detectQuality(params)
const html = document.documentElement
html.dataset.tier = quality.tier
html.style.setProperty('--scroll-len', String(SCROLL_LEN_VH[quality.tier]))
installGrainTile()

const stageAir = mustGet('#stage-air')
const stageWater = mustGet('#stage-water')
const waterline = mustGet('.waterline')
const airWorld = mustGet('#stage-air .world')
const waterWorld = mustGet('#stage-water .world')

// Material tiles are generated before the layers are built (texRect reads the level).
const textures = createTextures(quality, params.get('tex'))
if (params.get('texclip') === 'off') TEX.clip = false
if (params.get('texgrid') === 'single') TEX.single = true

const size: StageSize = { w: 1, h: 1, unit: 1, ox: 0, oy: 0, vx: 0, vy: 0, dpr: 1 }
function measure(w: number, h: number): void {
  size.w = w
  size.h = h
  size.unit = Math.max(w / DESIGN.w, h / DESIGN.h)
  size.ox = (w - DESIGN.w * size.unit) / 2
  size.oy = (h - DESIGN.h * size.unit) / 2
  size.vx = size.ox + DESIGN.vp.x * size.unit
  size.vy = size.oy + DESIGN.vp.y * size.unit
  size.dpr = Math.min(window.devicePixelRatio || 1, quality.dprCap)
  for (const st of [stageAir, stageWater]) {
    st.style.setProperty('--vx', `${size.vx.toFixed(2)}px`)
    st.style.setProperty('--vy', `${size.vy.toFixed(2)}px`)
  }
}
measure(stageAir.clientWidth, stageAir.clientHeight)

const air = createStage(airWorld, buildAirLayers(quality), size)
const water = createStage(waterWorld, buildWaterLayers(quality), size)
// The bubble canvas rides inside the water world so it counter-translates with it during the dive.
const bubblesCanvas = mustGet<HTMLCanvasElement>('#stage-water .fx-bubbles')
waterWorld.append(bubblesCanvas)
const fx = createFx(quality, mustGet<HTMLCanvasElement>('#stage-air .fx-rain'), bubblesCanvas)
fx.resize(size)
mountWaterline(waterline)
textures.apply(document)
void textures.ready.then(() => {
  textures.apply(document)
})
const overlay = createOverlay(mustGet('#overlay'))
const gradeStack = createGradeStack()
const hud = params.has('debug') ? createHud(air, water, quality.tier) : null

const lenis = new Lenis({
  autoRaf: false,
  smoothWheel: !quality.reducedMotion,
  syncTouch: false,
  anchors: true,
})
const director = createDirector(lenis)

const bench = params.has('bench') ? createBench(lenis, air, water, textures.generateMs) : null

let lastState: SceneState | undefined
director.onFrame((f) => {
  const t0 = performance.now()
  const state = computeState(f.t, f.time, f.dt, size, quality)
  lastState = state
  air.render(state, state.cam)
  air.setPortalClip(state.portal)
  water.render(state, state.waterCam)

  styleWrite(stageAir, 'visibility', state.air.visible ? 'visible' : 'hidden')
  styleWrite(stageAir, '--sun-x', `${state.sunX.toFixed(1)}%`)
  styleWrite(stageWater, 'visibility', state.water.visible ? 'visible' : 'hidden')
  styleWrite(
    waterline,
    'visibility',
    state.water.visible && state.wl > -0.15 * size.h ? 'visible' : 'hidden',
  )
  const wl = state.wl.toFixed(2)
  styleWrite(stageWater, 'transform', `translate3d(0,${wl}px,0)`)
  styleWrite(waterWorld, 'transform', `translate3d(0,${(-state.wl + state.sinkTy).toFixed(2)}px,0)`)
  styleWrite(waterline, 'transform', `translate3d(0,${wl}px,0)`)

  fx.update(state)
  overlay.update(state)
  gradeStack.apply(state.grade)
  hud?.update(state)
  bench?.frame(t0, performance.now() - t0)
})

const ro = new ResizeObserver((entries) => {
  const e = entries[0]
  if (!e) return
  const tBefore = director.t
  measure(e.contentRect.width, e.contentRect.height)
  air.resize(size)
  water.resize(size)
  fx.resize(size)
  lenis.resize()
  if (director.running) director.seek(tBefore)
})
ro.observe(stageAir)
director.start()

// Dev hooks: ?t=0.35 seeks, &freeze holds time, ?debug shows the HUD, ?bench=<s> sweeps,
// ?only=<ids> / ?skip=<ids> toggle layers for cost-by-exclusion, ?tier=high|low forces a tier,
// ?preview=<layerId> shows one layer at scale 1 with its viewBox edge for bleed checks.
const only = params.get('only')?.split(',')
const skip = params.get('skip')?.split(',')
if (only || skip) {
  for (const L of [...air.layers, ...water.layers]) {
    const off = (only !== undefined && !only.includes(L.id)) || (skip?.includes(L.id) ?? false)
    if (off) {
      L.el.style.display = 'none'
      L.range = [2, 3]
    }
  }
}
if (bench) void bench.run(Number(params.get('bench')) || 10)
const preview = params.get('preview')
if (preview) {
  for (const L of [...air.layers, ...water.layers]) {
    L.el.style.display = L.id === preview ? '' : 'none'
    if (L.id === preview) {
      L.range = [0, 1]
      L.fade = undefined
      L.restCz = 0
      L.depth = 0
      for (const part of L.parts) {
        part.depth = 0
        part.restCz = 0
        part.range = undefined
      }
      const svgEl = L.el.querySelector('svg[data-part]')
      svgEl?.insertAdjacentHTML(
        'beforeend',
        '<rect x="0" y="0" width="1600" height="1200" fill="none" stroke="#f0f" stroke-width="4"/>',
      )
    }
  }
}
const tParam = params.get('t')
if (params.has('freeze')) director.freeze(true)
if (tParam !== null) {
  requestAnimationFrame(() => {
    director.seek(Number(tParam))
  })
}
window.__scene = {
  seek: (t) => {
    director.seek(t)
  },
  freeze: (on) => {
    director.freeze(on)
  },
  get state() {
    return lastState
  },
  air,
  water,
  size,
}
