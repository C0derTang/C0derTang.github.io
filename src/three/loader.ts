import {
  EquirectangularReflectionMapping,
  ImageBitmapLoader,
  LoadingManager,
  RepeatWrapping,
  Source,
  SRGBColorSpace,
  Texture,
} from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'

export interface TextureOpts {
  srgb?: boolean
  repeat?: number
  /**
   * Not needed for the opening view: fetched after the curtain's assets and shown as this flat
   * colour until it arrives.
   */
  deferred?: string
}

/**
 * Assets load in two stages. The first holds the curtain: its LoadingManager drives the progress
 * bar and `ready`. Textures marked `deferred` belong to places the walk reaches later; they
 * start once the first stage is resident and `settled` resolves when they are in too. Each URL
 * is fetched and decoded once: every texture asking for it shares one image, so material
 * variants (own repeat or offset) cost no extra memory. Images decode off the main thread
 * (ImageBitmap), so the first frame only uploads them.
 */
export interface Loader {
  texture(url: string, opts?: TextureOpts): Texture
  hdri(url: string): Promise<Texture>
  readonly ready: Promise<void>
  readonly settled: Promise<void>
  onProgress(cb: (loaded: number, total: number) => void): void
  /** called for each deferred texture once its image is in, so the renderer can upload it */
  onDeferred(cb: (texture: Texture) => void): void
}

interface Entry {
  textures: Texture[]
  source: Source<unknown> | null
}

function flatImage(color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 1, 1)
  }
  return canvas
}

function bitmapLoader(manager: LoadingManager): ImageBitmapLoader {
  const loader = new ImageBitmapLoader(manager)
  // WebGL ignores a texture's flipY for bitmaps, so flip at decode to keep the usual UV origin.
  loader.setOptions({ imageOrientation: 'flipY' })
  return loader
}

/** Resolves when everything queued on the manager has loaded (or immediately if nothing was). */
function drained(manager: LoadingManager, started: () => boolean): Promise<void> {
  return new Promise<void>((resolve) => {
    manager.onLoad = () => resolve()
    // Nothing queued: resolve on the next tick so callers can await uniformly.
    queueMicrotask(() => {
      if (!started()) resolve()
    })
  })
}

export function createLoader(anisotropy: number): Loader {
  const manager = new LoadingManager()
  const images = bitmapLoader(manager)
  const rgbe = new HDRLoader(manager)
  const laterManager = new LoadingManager()
  const laterImages = bitmapLoader(laterManager)
  const entries = new Map<string, Entry>()
  const placeholders = new Map<string, Source<unknown>>()
  const later: string[] = []
  let progress: ((loaded: number, total: number) => void) | null = null
  let deferredCb: ((texture: Texture) => void) | null = null
  manager.onProgress = (_url, loaded, total) => progress?.(loaded, total)
  let started = false
  const ready = drained(manager, () => started)

  const fetchImage = (
    loader: ImageBitmapLoader,
    url: string,
    entry: Entry,
    late: boolean,
  ): void => {
    // A failed image leaves its textures blank (or on their flat colour); the manager still drains.
    loader.load(url, (image) => {
      const source = new Source(image)
      entry.source = source
      for (const tex of entry.textures) {
        // Drop the flat stand-in's GPU texture before pointing at the real image.
        if (late) tex.dispose()
        tex.source = source
        tex.needsUpdate = true
        if (late) deferredCb?.(tex)
      }
    })
  }

  const settled = ready.then(() => {
    const done = drained(laterManager, () => later.length > 0)
    for (const url of later) {
      const entry = entries.get(url)
      if (entry) fetchImage(laterImages, url, entry, true)
    }
    return done
  })

  return {
    texture(url, opts = {}) {
      const tex = new Texture()
      if (opts.srgb) tex.colorSpace = SRGBColorSpace
      if (opts.repeat !== undefined) {
        tex.wrapS = RepeatWrapping
        tex.wrapT = RepeatWrapping
        tex.repeat.set(opts.repeat, opts.repeat)
      }
      tex.anisotropy = anisotropy
      let entry = entries.get(url)
      if (!entry) {
        entry = { textures: [], source: null }
        entries.set(url, entry)
        if (opts.deferred === undefined) {
          started = true
          fetchImage(images, url, entry, false)
        } else later.push(url)
      }
      if (entry.source) {
        tex.source = entry.source
        tex.needsUpdate = true
      } else {
        entry.textures.push(tex)
        if (opts.deferred !== undefined) {
          let flat = placeholders.get(opts.deferred)
          if (!flat) {
            flat = new Source(flatImage(opts.deferred))
            placeholders.set(opts.deferred, flat)
          }
          tex.source = flat
          tex.needsUpdate = true
        }
      }
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
    settled,
    onProgress(cb) {
      progress = cb
    },
    onDeferred(cb) {
      deferredCb = cb
    },
  }
}
