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
import { computeState, type SceneState } from './state'
import { createFish } from './world/fish'
import { createHouse, createYard } from './world/house'
import { createInterior } from './world/interior'
import { createPaddy } from './world/paddy'
import { createRain } from './world/rain'
import { createTerrain } from './world/terrain'
import { createUnderwater } from './world/underwater'
import type { WorldPart } from './world/types'

export interface FrameStats {
  calls: number
  triangles: number
}

export interface App {
  /** loading progress 0..1 for the curtain */
  onProgress(cb: (p: number) => void): void
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
  renderer.toneMappingExposure = 1.15
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
    createYard(materials, quality),
    createHouse(materials, quality),
    createInterior(materials, quality),
    createTerrain(materials, quality),
    createPaddy(materials, quality),
    createUnderwater(materials, quality),
    createFish(materials, quality),
  ]
  const world = new Group()
  for (const p of parts) world.add(p.group)
  scene.add(world)
  const rain = createRain(quality)
  scene.add(rain.mesh, rain.splashes)

  const post = createPost(renderer, scene, camera, quality)

  // Environment lighting from the overcast HDRI (PMREM); the hemisphere light stands in until then.
  const pmrem = new PMREMGenerator(renderer)
  const ready = loader
    .hdri(HDRI_URL)
    .then((tex) => {
      scene.environment = pmrem.fromEquirectangular(tex).texture
      scene.environmentIntensity = 1.0
      tex.dispose()
      pmrem.dispose()
    })
    .catch(() => {
      /* no HDRI: hemisphere light only */
    })
    .then(() => loader.ready)
    .then(async () => {
      // Warm every shader behind the curtain: compileAsync only sees visible objects, so make
      // everything visible for the compile, then render a few poses (yard, room, paddy, under
      // water) so the transmission target, the depth of field and the underwater set are all
      // allocated before the first scrolled frame.
      const hidden: { o: { visible: boolean } }[] = []
      scene.traverse((o) => {
        if (!o.visible) {
          hidden.push({ o })
          o.visible = true
        }
      })
      await renderer.compileAsync(scene, camera)
      for (const h of hidden) h.o.visible = false
      for (const t of [0.02, 0.4, 0.7, 0.9]) update(computeState(t, 0, 1 / 60, 0, quality))
    })

  const target = new Vector3()
  const update = (state: SceneState): void => {
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
  }
  return {
    onProgress(cb) {
      loader.onProgress((loaded, total) => cb(total > 0 ? loaded / total : 1))
    },
    update,
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
