import {
  EquirectangularReflectionMapping,
  LoadingManager,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'

/**
 * Every asset goes through one LoadingManager so the curtain can show progress and the first
 * frame renders only once everything is resident (determinism for screenshots).
 */
export interface Loader {
  texture(url: string, opts?: { srgb?: boolean; repeat?: number }): Texture
  hdri(url: string): Promise<Texture>
  readonly ready: Promise<void>
  onProgress(cb: (loaded: number, total: number) => void): void
}

export function createLoader(): Loader {
  const manager = new LoadingManager()
  const texLoader = new TextureLoader(manager)
  const rgbe = new HDRLoader(manager)
  let progress: ((loaded: number, total: number) => void) | null = null
  manager.onProgress = (_url, loaded, total) => progress?.(loaded, total)
  let started = false
  const ready = new Promise<void>((resolve) => {
    manager.onLoad = () => resolve()
    // Nothing queued: resolve on the next tick so callers can await uniformly.
    queueMicrotask(() => {
      if (!started) resolve()
    })
  })
  return {
    texture(url, opts = {}) {
      started = true
      const tex = texLoader.load(url)
      if (opts.srgb) tex.colorSpace = SRGBColorSpace
      if (opts.repeat !== undefined) {
        tex.wrapS = RepeatWrapping
        tex.wrapT = RepeatWrapping
        tex.repeat.set(opts.repeat, opts.repeat)
      }
      tex.anisotropy = 8
      return tex
    },
    hdri(url) {
      started = true
      return rgbe.loadAsync(url).then((tex) => {
        tex.mapping = EquirectangularReflectionMapping
        return tex
      })
    },
    ready,
    onProgress(cb) {
      progress = cb
    },
  }
}
