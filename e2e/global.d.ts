// Test-side view of the page's debug surface (kept import-free so the e2e tsconfig resolves it).
interface ScenePose {
  x: number
  y: number
  z: number
  tx: number
  ty: number
  tz: number
  fov: number
  yaw: number
}
interface SceneDebugState {
  t: number
  beat: string
  pose: ScenePose
  doors: number
  underwater: boolean
  depth: number
}
interface BenchDebugReport {
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
    __scene?: {
      seek(t: number): void
      freeze(on: boolean): void
      readonly state: SceneDebugState | undefined
      readonly ready: boolean
    }
    __bench?: BenchDebugReport
  }
}
export {}
