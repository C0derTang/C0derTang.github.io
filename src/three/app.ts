import {
  ACESFilmicToneMapping,
  Group,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { Quality } from '../config/quality'
import { createAtmosphere } from './atmosphere'
import { createLoader } from './loader'
import { createMaterials } from './materials'
import { createPost } from './post'
import type { SceneState } from './state'
import {
  placeholderGround,
  placeholderHouse,
  placeholderLandscape,
  placeholderWater,
  type WorldPart,
} from './world/placeholders'
import { createRain } from './world/rain'

export interface FrameStats {
  calls: number
  triangles: number
}

export interface App {
  update(state: SceneState): void
  resize(w: number, h: number): void
  stats(): FrameStats
  readonly ready: Promise<void>
  readonly camera: PerspectiveCamera
}

/** Assets the boot loads; empty entries mean flat placeholder materials. */
export const HDRI_URL = '/assets/hdri/kloofendal_overcast_1k.hdr'

export function createApp(canvas: HTMLCanvasElement, quality: Quality): App {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dpr))
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.outputColorSpace = SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap
  // Stats cover the whole frame (the composer renders several passes).
  renderer.info.autoReset = false
  renderer.transmissionResolutionScale = 0.5

  const scene = new Scene()
  const camera = new PerspectiveCamera(55, 1, 0.05, 900)
  const loader = createLoader()
  const materials = createMaterials(quality, loader)
  const atmosphere = createAtmosphere(scene, quality)

  const parts: WorldPart[] = [
    placeholderGround(materials),
    placeholderHouse(materials),
    placeholderLandscape(materials, quality),
    placeholderWater(materials),
  ]
  const world = new Group()
  for (const p of parts) world.add(p.group)
  scene.add(world)
  const rain = createRain(quality)
  scene.add(rain.mesh)

  const post = createPost(renderer, scene, camera, quality)

  // Environment lighting from the overcast HDRI (PMREM); the hemisphere light stands in until then.
  const pmrem = new PMREMGenerator(renderer)
  const ready = loader
    .hdri(HDRI_URL)
    .then((tex) => {
      scene.environment = pmrem.fromEquirectangular(tex).texture
      scene.environmentIntensity = 0.7
      tex.dispose()
      pmrem.dispose()
    })
    .catch(() => {
      /* no HDRI: hemisphere light only */
    })
    .then(() => loader.ready)
    .then(() => renderer.compileAsync(scene, camera))
    .then(() => undefined)

  const target = new Vector3()
  return {
    update(state) {
      renderer.info.reset()
      const p = state.pose
      camera.position.set(p.x, p.y, p.z)
      // Underwater float: a slow time-based bob well below the surface (never at the crossing).
      if (state.underwater && !state.reduced)
        camera.position.y += 0.04 * Math.sin(state.time / 1400) * Math.min(1, state.depth / 0.6)
      target.set(p.tx, p.ty, p.tz)
      camera.lookAt(target)
      if (camera.fov !== p.fov) {
        camera.fov = p.fov
        camera.updateProjectionMatrix()
      }
      for (const part of parts) part.update?.(state)
      materials.update(state.reduced ? 0 : state.time)
      atmosphere.apply(state, camera)
      rain.update(state, camera)
      post.apply(state)
      post.render(state.dt)
    },
    resize(w, h) {
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      post.resize(w, h)
    },
    stats() {
      return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }
    },
    ready,
    camera,
  }
}
