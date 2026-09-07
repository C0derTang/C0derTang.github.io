import { engine } from 'animejs'
import type Lenis from 'lenis'
import { scrollToStory, storyToScroll } from '../config/beats'

export interface FrameInfo {
  t: number
  time: number
  dt: number
  velocity: number
  changed: boolean
}

export interface Director {
  onFrame(cb: (f: FrameInfo) => void): () => void
  start(): void
  stop(): void
  /** Jump to a scroll fraction immediately and run one tick (dev/test). */
  seek(t: number): void
  /** Hold `time` constant for deterministic screenshots (dev/test). */
  freeze(on: boolean): void
  readonly t: number
  readonly running: boolean
}

/**
 * The single requestAnimationFrame loop. Owns Lenis (autoRaf: false), the anime.js engine
 * (useDefaultMainLoop: false) and every scene subscriber. Subscribers only write.
 */
export function createDirector(lenis: Lenis): Director {
  engine.useDefaultMainLoop = false
  const cbs = new Set<(f: FrameInfo) => void>()
  let raf = 0
  let started = false
  let last = 0
  let lastT = -1
  let frozen: number | null = null
  let t = 0

  const update = (now: number) => {
    // A synchronous seek can run after a queued frame's timestamp was captured.
    now = Math.max(now, last)
    lenis.raf(now)
    t = lenis.limit > 0 ? scrollToStory(lenis.progress) : 0
    const dt = Math.min(now - last, 50) / 1000
    last = now
    const changed = Math.abs(t - lastT) > 1e-5
    lastT = t
    const info: FrameInfo = { t, time: frozen ?? now, dt, velocity: lenis.velocity, changed }
    for (const cb of cbs) cb(info)
    // anime's manual update ticks from wall-clock time regardless of engine.pause(), so a
    // frozen frame simply skips it (ambient loops resume from real time afterwards).
    if (frozen === null) engine.update()
  }

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick)
    update(now)
  }

  const start = () => {
    started = true
    if (raf || document.hidden) return
    last = performance.now()
    raf = requestAnimationFrame(tick)
  }
  const stop = () => {
    started = false
    cancelAnimationFrame(raf)
    raf = 0
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // A hidden tab pauses rendering without changing explicit start/stop intent.
      cancelAnimationFrame(raf)
      raf = 0
    } else if (started) start()
  })

  return {
    onFrame(cb) {
      cbs.add(cb)
      return () => cbs.delete(cb)
    },
    start,
    stop,
    seek(target) {
      lenis.scrollTo(storyToScroll(target) * lenis.limit, { immediate: true, force: true })
      lastT = -1
      // A synchronous seek updates the existing loop without scheduling another one.
      update(performance.now())
    },
    freeze(on) {
      // Deterministic frame: fixed time for fx, no anime ticks, CSS animations paused.
      frozen = on ? performance.now() : null
      document.documentElement.classList.toggle('frozen', on)
    },
    get t() {
      return t
    },
    get running() {
      return raf !== 0
    },
  }
}
