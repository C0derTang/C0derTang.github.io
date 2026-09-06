import type Lenis from 'lenis'
import type { App } from '../three/app'

/**
 * Frame-time benchmark: `?bench=<seconds>` sweeps the scroll to the end and back with a linear
 * Lenis scrollTo, records rAF intervals, the JS time of the director callback, long tasks and
 * the peak draw calls / triangles, then writes `window.__bench`. Meaningful on a real GPU
 * (headed Chrome); headless SwiftShader numbers only show relative cost.
 */
export interface BenchReport {
  done: boolean
  frames: number
  p50: number
  p95: number
  p99: number
  max: number
  dropped: number
  longTasks: number
  jsP50: number
  jsP95: number
  callsMax: number
  trianglesMax: number
}

declare global {
  interface Window {
    __bench?: BenchReport
  }
}

const pct = (arr: number[], p: number): number => {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0
}

export function createBench(lenis: Lenis, app: App) {
  const intervals: number[] = []
  const js: number[] = []
  let last = -1
  let recording = false
  let longTasks = 0
  let callsMax = 0
  let trianglesMax = 0
  if ('PerformanceObserver' in window) {
    try {
      new PerformanceObserver((list) => {
        if (recording) longTasks += list.getEntries().length
      }).observe({ entryTypes: ['longtask'] })
    } catch {
      /* unsupported */
    }
  }
  const frame = (now: number, jsMs: number) => {
    if (!recording) return
    if (last >= 0) intervals.push(now - last)
    last = now
    js.push(jsMs)
    const st = app.stats()
    callsMax = Math.max(callsMax, st.calls)
    trianglesMax = Math.max(trianglesMax, st.triangles)
  }
  const sweep = (to: number, seconds: number): Promise<void> =>
    new Promise((resolve) => {
      lenis.scrollTo(to, {
        duration: seconds,
        easing: (x: number) => x,
        force: true,
        lock: true,
        onComplete: () => resolve(),
      })
    })
  const run = async (seconds: number): Promise<BenchReport> => {
    window.__bench = {
      done: false,
      frames: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      max: 0,
      dropped: 0,
      longTasks: 0,
      jsP50: 0,
      jsP95: 0,
      callsMax: 0,
      trianglesMax: 0,
    }
    await new Promise((r) => setTimeout(r, 800))
    recording = true
    last = -1
    await sweep(lenis.limit, seconds)
    await sweep(0, seconds)
    recording = false
    const report: BenchReport = {
      done: true,
      frames: intervals.length,
      p50: pct(intervals, 0.5),
      p95: pct(intervals, 0.95),
      p99: pct(intervals, 0.99),
      max: intervals.length ? Math.max(...intervals) : 0,
      dropped: intervals.filter((x) => x > 25).length,
      longTasks,
      jsP50: pct(js, 0.5),
      jsP95: pct(js, 0.95),
      callsMax,
      trianglesMax,
    }
    window.__bench = report
    console.warn('[bench]', JSON.stringify(report))
    return report
  }
  return { frame, run }
}
