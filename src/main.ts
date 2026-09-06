import './styles/index.css'
import 'lenis/dist/lenis.css'
import Lenis from 'lenis'
import { engine } from 'animejs'
import { SCROLL_LEN_VH } from './config/beats'
import { detectQuality } from './config/quality'
import { createDirector } from './scroll/director'
import { createApp, type App } from './three/app'
import { computeState, type SceneState } from './three/state'
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
      readonly ready: boolean
      app: App
    }
  }
}

history.scrollRestoration = 'manual'
// The director ticks anime.js; this must be off before the first timeline is created.
engine.useDefaultMainLoop = false

const params = new URLSearchParams(location.search)
const quality = detectQuality(params)
const html = document.documentElement
html.dataset.tier = quality.tier
html.style.setProperty('--scroll-len', String(SCROLL_LEN_VH[quality.tier]))

const canvas = mustGet<HTMLCanvasElement>('#gl')
const curtain = mustGet('#curtain')
const app = createApp(canvas, quality)
const curtainBar = curtain.querySelector<HTMLElement>('.curtain-bar i')
app.onProgress((p) => {
  if (curtainBar) styleWrite(curtainBar, '--p', p.toFixed(3))
})
const overlay = createOverlay(mustGet('#overlay'))
const hud = params.has('debug') ? createHud(app) : null

const lenis = new Lenis({
  autoRaf: false,
  smoothWheel: !quality.reducedMotion,
  syncTouch: false,
  anchors: true,
})
const director = createDirector(lenis)
const bench = params.has('bench') ? createBench(lenis, app) : null

let lastState: SceneState | undefined
let ready = false
const resize = () => {
  app.resize(window.innerWidth, window.innerHeight)
}
resize()
window.addEventListener('resize', () => {
  const t = director.t
  resize()
  lenis.resize()
  if (director.running) director.seek(t)
})

director.onFrame((f) => {
  const t0 = performance.now()
  const scrollVel = f.dt > 0 && lenis.limit > 0 ? f.velocity / lenis.limit / f.dt : 0
  const state = computeState(f.t, f.time, f.dt, scrollVel, quality)
  lastState = state
  app.update(state)
  overlay.update(state)
  hud?.update(state)
  bench?.frame(t0, performance.now() - t0)
})

void app.ready.then(() => {
  ready = true
  curtain.hidden = true
  styleWrite(curtain, 'opacity', '0')
  director.start()
  // Dev hooks: ?t=0.35 seeks, &freeze holds time, ?debug shows the HUD, ?bench=<s> sweeps,
  // ?tier=high|low, ?dpr=<n>, ?post=off.
  const tParam = params.get('t')
  if (params.has('freeze')) director.freeze(true)
  if (tParam !== null)
    requestAnimationFrame(() => {
      director.seek(Number(tParam))
    })
  if (bench) void bench.run(Number(params.get('bench')) || 8)
})

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
  get ready() {
    return ready
  },
  app,
}
