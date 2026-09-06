declare global {
  interface Window {
    __scene?: {
      seek(t: number): void
      freeze(on: boolean): void
    }
    __bench?: {
      done: boolean
      p50: number
      p95: number
      p99: number
      max: number
      dropped: number
      stalls: number
      stallsAt: number[]
      longTasks: number
      jsP95: number
      partsMax: number
      liveMax: number
      visibleMax: number
      textureMs: number
    }
  }
}

export {}
