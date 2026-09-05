declare global {
  interface Window {
    __scene?: {
      seek(t: number): void
      freeze(on: boolean): void
    }
  }
}

export {}
