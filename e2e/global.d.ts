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
  fog: { color: string; density: number }
  sun: { color: string; intensity: number }
  sky: number
  environment: number
  grade: { tint: string; strength: number; vignette: number; saturation: number }
  rain: { alpha: number; speed: number; slant: number; windX: number; windZ: number }
}
interface SceneAudioDebugStatus {
  enabled: boolean
  volume: number
  contextState: string
  active: boolean
  paused: boolean
  sourceCount: number
  contextCount: number
  mix: { gains: Record<string, number>; master: number; lowpassHz: number } | null
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
      readonly audio: SceneAudioDebugStatus | null
    }
    __bench?: BenchDebugReport
  }
}
export {}
