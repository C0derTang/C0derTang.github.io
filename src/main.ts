import 'lenis/dist/lenis.css'
import Lenis from 'lenis'
import { engine } from 'animejs'
import { createSoundscape, type SoundStatus } from './audio/soundscape'
import { SCROLL_LEN_VH, SCROLL_SEGMENTS, storyProgressRate } from './config/beats'
import { detectQuality } from './config/quality'
import { createDirector } from './scroll/director'
import { createApp, type App } from './three/app'
import { computeState, type SceneState } from './three/state'
import { createBench } from './ui/bench'
import { createHud } from './ui/debug'
import { createOverlay } from './ui/overlay'
import { createSoundControl, type SoundControl } from './ui/sound'
import { attrWrite, mustGet, styleWrite } from './util/dom'

declare global {
  interface Window {
    __scene?: {
      seek(t: number): void
      freeze(on: boolean): void
      readonly state: SceneState | undefined
      readonly ready: boolean
      readonly audio: SoundStatus | null
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
for (const segment of SCROLL_SEGMENTS) {
  const spacer = mustGet(`.beat[data-beat="${segment.id}"]`)
  styleWrite(spacer, '--len', String(segment.scroll[1] - segment.scroll[0]))
}

const canvas = mustGet<HTMLCanvasElement>('#gl')
const curtain = mustGet('#curtain')
const root = mustGet('#overlay')

async function boot(): Promise<void> {
  const app = createApp(canvas, quality)
  const curtainBar = mustGet('.curtain-bar', curtain)
  const curtainFill = mustGet('.curtain-bar i', curtain)
  const loadStatus = mustGet('[data-ui="load-status"]', curtain)
  const loadCount = mustGet('[data-ui="load-count"]', curtain)
  let lastPercent = -1
  app.onProgress((p) => {
    const percent = Math.round(p * 100)
    styleWrite(curtainFill, '--p', p.toFixed(3))
    if (percent !== lastPercent) {
      attrWrite(curtainBar, 'aria-valuenow', String(percent))
      loadCount.textContent = `${percent}%`
      lastPercent = percent
    }
    if (p === 1) loadStatus.textContent = 'Preparing the first view'
  })
  const overlay = createOverlay(root)
  const hud = params.has('debug') ? createHud(app) : null
  let soundControl: SoundControl | undefined
  let sound = createSoundscape((enabled) => soundControl?.setState(enabled))

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
    const scrollVel =
      f.dt > 0 && lenis.limit > 0 ? (f.velocity / lenis.limit / f.dt) * storyProgressRate(f.t) : 0
    const state = computeState(f.t, f.time, f.dt, scrollVel, quality)
    lastState = state
    app.update(state)
    sound?.update(state)
    overlay.update(state)
    hud?.update(state)
    bench?.frame(t0, performance.now() - t0)
  })

  window.__scene = {
    seek: (t) => director.seek(t),
    freeze: (on) => {
      director.freeze(on)
      sound?.setPaused(on)
    },
    get state() {
      return lastState
    },
    get ready() {
      return ready
    },
    get audio() {
      return sound?.status ?? null
    },
    app,
  }

  try {
    const [, soundReady] = await Promise.all([app.ready, sound?.ready ?? false])
    if (!soundReady) {
      sound?.dispose()
      sound = null
    }
  } catch (error) {
    director.stop()
    lenis.destroy()
    sound?.dispose()
    throw error
  }
  // Restore scroll geometry, then paint the actual opening pose behind the curtain.
  html.classList.add('scene-ready')
  if (sound) {
    const readySound = sound
    soundControl = createSoundControl(
      () => readySound.setEnabled(!readySound.enabled),
      (volume) => readySound.setVolume(volume),
    )
  }
  lenis.resize()
  if (params.has('freeze')) {
    director.freeze(true)
    sound?.setPaused(true)
  }
  const startT = Number(params.get('t') ?? 0)
  director.seek(Number.isFinite(startT) ? Math.min(1, Math.max(0, startT)) : 0)
  director.start()
  ready = true
  curtain.classList.add('is-ready')
  curtain.setAttribute('aria-hidden', 'true')
  if (quality.reducedMotion) curtain.hidden = true
  else {
    const hideCurtain = () => {
      curtain.hidden = true
    }
    curtain.addEventListener('transitionend', (event) => {
      if (event.target === curtain && event.propertyName === 'opacity') hideCurtain()
    })
    // Also release the curtain if the browser suppresses transition events in a background tab.
    window.setTimeout(hideCurtain, 700)
  }
  if (bench) void bench.run(Number(params.get('bench')) || 8)
}

void boot().catch((error: unknown) => {
  console.warn('The landscape is unavailable; showing the readable story.', error)
  html.classList.add('no-scene')
  curtain.hidden = true
  mustGet('#scene-note').hidden = false
  for (const slot of root.querySelectorAll<HTMLElement>('.slot')) slot.inert = false
})
