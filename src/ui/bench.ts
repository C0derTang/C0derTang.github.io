import type Lenis from 'lenis'
import type { Stage } from '../scene/stage'

/**
 * `?bench=<seconds>`: a linear scroll sweep to the end and back (the way out is what blanked
 * layers before), recording frame intervals, JS time per frame and long tasks. Raster is
 * asynchronous, so per-layer cost is measured by exclusion with `?skip=<ids>` instead.
 */
export interface BenchReport {
  done: boolean
  frames: number
  p50: number
  p95: number
  p99: number
  max: number
  /** frames over 25 ms (a missed 60 Hz frame with margin) */
  dropped: number
  /** frames over 50 ms */
  stalls: number
  /** scroll progress at each stall */
  stallsAt: number[]
  longTasks: number
  jsP50: number
  jsP95: number
  partsMax: number
  liveMax: number
  textureMs: number
}

declare global {
  interface Window {
    __bench?: BenchReport
  }
}

const pct = (xs: readonly number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0
}

export function createBench(lenis: Lenis, air: Stage, water: Stage, textureMs: number) {
  const intervals: number[] = []
  const js: number[] = []
  let last = -1
  let recording = false
  let longTasks = 0
  let partsMax = 0
  let liveMax = 0
  const report: BenchReport = {
    done: false,
    frames: 0,
    p50: 0,
    p95: 0,
    p99: 0,
    max: 0,
    dropped: 0,
    stalls: 0,
    stallsAt: [],
    longTasks: 0,
    jsP50: 0,
    jsP95: 0,
    partsMax: 0,
    liveMax: 0,
    textureMs,
  }
  window.__bench = report
  if ('PerformanceObserver' in window) {
    try {
      new PerformanceObserver((list) => {
        if (recording) longTasks += list.getEntries().length
      }).observe({ type: 'longtask' })
    } catch {
      /* longtask unsupported: leave the count at 0 */
    }
  }

  /** Called by main.ts at the end of every director frame with the frame's JS time. */
  const stallsAt: number[] = []
  const frame = (now: number, jsMs: number): void => {
    if (!recording) return
    if (last >= 0) {
      const dt = now - last
      intervals.push(dt)
      if (dt > 50) stallsAt.push(Math.round(lenis.progress * 1000) / 1000)
    }
    last = now
    js.push(jsMs)
    partsMax = Math.max(partsMax, air.partCount() + water.partCount())
    liveMax = Math.max(liveMax, air.liveCount() + water.liveCount())
  }

  const sweep = (to: number, seconds: number): Promise<void> =>
    new Promise((resolve) => {
      lenis.scrollTo(to, {
        duration: seconds,
        easing: (x) => x,
        lock: true,
        force: true,
        onComplete: () => {
          resolve()
        },
      })
    })

  const run = async (seconds: number): Promise<BenchReport> => {
    await new Promise((r) => setTimeout(r, 600)) // fonts, texture blobs, first paints
    recording = true
    last = -1
    await sweep(lenis.limit, seconds)
    await sweep(0, seconds)
    recording = false
    Object.assign(report, {
      done: true,
      frames: intervals.length,
      p50: pct(intervals, 0.5),
      p95: pct(intervals, 0.95),
      p99: pct(intervals, 0.99),
      max: intervals.length ? Math.max(...intervals) : 0,
      dropped: intervals.filter((x) => x > 25).length,
      stalls: intervals.filter((x) => x > 50).length,
      stallsAt,
      longTasks,
      jsP50: pct(js, 0.5),
      jsP95: pct(js, 0.95),
      partsMax,
      liveMax,
    })
    console.warn('[bench]', JSON.stringify(report))
    return report
  }

  return { frame, run }
}
