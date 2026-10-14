import Lenis from 'lenis'
import { engine } from 'animejs'
import { createSoundscape, type SoundStatus } from './audio/soundscape'
import { SCROLL_LEN_VH, SCROLL_SEGMENTS, storyProgressRate, storyToScroll } from './config/beats'
import { deepLinkProject, deepLinkT } from './config/projects'
import type { Quality } from './config/quality'
import { createDirector } from './scroll/director'
import { createApp, type App } from './three/app'
import type { FocusState } from './three/focus'
import { computeState, type SceneState } from './three/state'
import { createBench } from './ui/bench'
import { createHud } from './ui/debug'
import { createFocusUi } from './ui/focus'
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
      /** true once the assets deferred past the curtain are in as well */
      readonly settled: boolean
      readonly audio: SoundStatus | null
      app: App
      /** the opened banner or trophy (tests) */
      focus: { open(id: string): void; close(): void; readonly state: FocusState }
    }
  }
}

/**
 * Everything heavy lives behind this module: the entry (`main.ts`) picks the quality tier, asks
 * for the curtain's assets and only then imports this chunk, so the downloads overlap.
 */
export async function boot(params: URLSearchParams, quality: Quality): Promise<void> {
  history.scrollRestoration = 'manual'
  // The director ticks anime.js; this must be off before the first timeline is created.
  engine.useDefaultMainLoop = false

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

  // A frozen or seeked start must be complete at any t, so it also waits for the deferred assets.
  // A fragment that names a project or a beat (#cph2h, #paddy) is such a start.
  const hashStart = deepLinkT(location.hash)
  const eager =
    params.has('freeze') || params.has('t') || params.has('bench') || (hashStart ?? 0) > 0
  const app = createApp(canvas, quality, eager)
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
  const sound = createSoundscape((enabled) => soundControl?.setState(enabled))

  const lenis = new Lenis({
    autoRaf: false,
    smoothWheel: !quality.reducedMotion,
    syncTouch: false,
    anchors: true,
  })
  const director = createDirector(lenis)

  // The walk holds still under the résumé sheet (ui/resume.ts, modal) and under an opened
  // banner or trophy (ui/focus.ts); it moves again when neither holds it.
  const locks = new Set<'resume' | 'focus'>()
  const lock = (who: 'resume' | 'focus', on: boolean): void => {
    if (on) locks.add(who)
    else locks.delete(who)
    if (locks.size > 0) lenis.stop()
    else lenis.start()
  }
  if (document.querySelector<HTMLDialogElement>('#resume')?.open) lock('resume', true)
  window.addEventListener('resume:toggle', (event) => {
    lock('resume', event.detail.open)
  })
  const focusUi = createFocusUi(app.focus, {
    lock: (on) => {
      lock('focus', on)
    },
    settled: app.settled,
    // A few px of slack: the browser rounds the scroll position Lenis then adopts as its target.
    headedFor: (t) => Math.abs(lenis.targetScroll - storyToScroll(t) * lenis.limit) <= 4,
  })
  window.addEventListener('hashchange', () => {
    // The sheet owns the fragment while it is open (#resume); its go-to button closes it first.
    if (document.querySelector<HTMLDialogElement>('#resume')?.open) return
    const t = deepLinkT(location.hash)
    if (t === undefined) return
    focusUi.close()
    lenis.scrollTo(storyToScroll(t) * lenis.limit, {
      immediate: quality.reducedMotion,
      force: true,
    })
    // A project's fragment also opens its banner once the scroll is in front of it.
    const project = deepLinkProject(location.hash)
    if (project) focusUi.arrive(project, t)
  })
  const bench = params.has('bench') ? createBench(lenis, app) : null

  let lastState: SceneState | undefined
  let ready = false
  let settled = false
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
    focusUi.update(state)
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
    get settled() {
      return settled
    },
    get audio() {
      return sound?.status ?? null
    },
    app,
    focus: {
      open: (id) => {
        focusUi.open(id)
      },
      close: () => {
        focusUi.close()
      },
      get state() {
        return app.focus.state
      },
    },
  }

  try {
    await app.ready
  } catch (error) {
    director.stop()
    lenis.destroy()
    sound?.dispose()
    throw error
  }
  // Restore scroll geometry, then paint the actual opening pose behind the curtain.
  html.classList.add('scene-ready')
  if (sound) {
    soundControl = createSoundControl(
      () => sound.setEnabled(!sound.enabled),
      (volume) => sound.setVolume(volume),
    )
  }
  void app.settled.then(() => {
    settled = true
    // Desktop prepares the loops once the scene is complete; phones wait for the sound button.
    if (sound && quality.tier === 'high' && !eager) window.setTimeout(() => void sound.load(), 1500)
  })
  lenis.resize()
  if (params.has('freeze')) {
    director.freeze(true)
    sound?.setPaused(true)
  }
  const startT = Number(params.get('t') ?? deepLinkT(location.hash) ?? 0)
  director.seek(Number.isFinite(startT) ? Math.min(1, Math.max(0, startT)) : 0)
  director.start()
  ready = true
  // A project's fragment starts in front of its banner (unless ?t= chose the place) and opens it.
  const startProject = params.has('t') ? undefined : deepLinkProject(location.hash)
  if (startProject) focusUi.arrive(startProject, startT)
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
