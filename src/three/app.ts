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
import { hdriUrl } from '../config/assets'
import { PROJECTS } from '../config/projects'
import type { Quality } from '../config/quality'
import { createAtmosphere } from './atmosphere'
import { createFocus, type Focus } from './focus'
import { createLoader } from './loader'
import { createMaterials } from './materials'
import { createPost } from './post'
import { computeState, type SceneState } from './state'
import { createFish } from './world/fish'
import { createHouse, createYard } from './world/house'
import { createInterior } from './world/interior'
import { createPaddy } from './world/paddy'
import { createRain } from './world/rain'
import { createScrolls } from './world/scrolls'
import { createTerrain } from './world/terrain'
import { createTrophies } from './world/trophies'
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
  /** GPU resources currently resident */
  memory(): { textures: number; geometries: number }
  readonly ready: Promise<void>
  /** resolves once the deferred assets are in as well */
  readonly settled: Promise<void>
  readonly camera: PerspectiveCamera
  /** the opened view: picking, the open banner or trophy (`focus.ts`) */
  readonly focus: Focus
}

/**
 * The camera path is framed for a landscape screen. On a portrait one the same vertical angle
 * would leave a sliver of it, so the angle widens to keep the horizontal view of a 3:4 frame.
 */
const PORTRAIT_ASPECT = 0.75
function fitFov(fov: number, aspect: number): number {
  if (aspect >= PORTRAIT_ASPECT) return fov
  const half = Math.tan((fov * Math.PI) / 360) * (PORTRAIT_ASPECT / aspect)
  return (Math.atan(half) * 360) / Math.PI
}

/**
 * `eager` holds the curtain for every asset, deferred ones included, so a frame at any `t` is
 * complete the moment the scene is ready (frozen frames, screenshots, benches).
 */
export function createApp(canvas: HTMLCanvasElement, quality: Quality, eager = false): App {
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
  const loader = createLoader(
    Math.min(quality.anisotropy, renderer.capabilities.getMaxAnisotropy()),
  )
  // Upload late textures as they arrive instead of on the frame that first shows them.
  loader.onDeferred((texture) => renderer.initTexture(texture))
  const materials = createMaterials(quality, loader)
  const atmosphere = createAtmosphere(scene, quality)

  // The banner images wait for the curtain's own assets unless the start is eager.
  const scrolls = createScrolls(materials, quality, eager ? undefined : loader.ready)
  // Upload the painted atlas when it is ready rather than on the frame that first shows a scroll.
  void scrolls.painted.then((texture) => renderer.initTexture(texture))

  const trophies = createTrophies(materials, quality)
  const focus = createFocus(camera, [scrolls, trophies], {
    paper(id) {
      const project = PROJECTS.find((p) => p.id === id)
      return project ? scrolls.paper(project.id) : null
    },
    reducedMotion: quality.reducedMotion,
  })

  const parts: WorldPart[] = [
    createYard(materials, quality),
    createHouse(materials, quality),
    createInterior(materials, quality),
    scrolls,
    trophies,
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
  // Boot phases for the DevTools timeline: world built, assets resident, shaders warm.
  performance.mark('scene:built')

  // Environment lighting from the overcast HDRI (PMREM); the hemisphere light stands in until then.
  const pmrem = new PMREMGenerator(renderer)
  const ready = loader
    .hdri(hdriUrl(quality.tier))
    .then((tex) => {
      scene.environment = pmrem.fromEquirectangular(tex).texture
      scene.environmentIntensity = 1.0
      tex.dispose()
      pmrem.dispose()
    })
    .catch(() => {
      /* no HDRI: hemisphere light only */
    })
    .then((): Promise<unknown> =>
      eager ? Promise.all([loader.settled, scrolls.painted]) : loader.ready,
    )
    .then(async () => {
      performance.mark('scene:loaded')
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
      performance.mark('scene:compiled')
      for (const t of [0.02, 0.4, 0.7, 0.9]) update(computeState(t, 0, 1 / 60, 0, quality))
      performance.mark('scene:warm')
    })

  const target = new Vector3()
  const update = (scroll: SceneState): void => {
    renderer.info.reset()
    const p = scroll.pose
    camera.position.set(p.x, p.y, p.z)
    // Underwater float: a slow time-based bob well below the surface (never at the crossing).
    if (scroll.underwater && !scroll.reduced)
      camera.position.y += 0.04 * Math.sin(scroll.time / 1400) * Math.min(1, scroll.depth / 0.6)
    target.set(p.tx, p.ty, p.tz)
    camera.lookAt(target)
    const fov = fitFov(p.fov, camera.aspect)
    if (camera.fov !== fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    // The opened view sits on top of the scroll frame; with nothing open this is `scroll` itself.
    const state = focus.apply(scroll)
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
    memory() {
      return {
        textures: renderer.info.memory.textures,
        geometries: renderer.info.memory.geometries,
      }
    },
    ready,
    settled: ready.then(() => Promise.all([loader.settled, scrolls.painted])).then(() => undefined),
    camera,
    focus,
  }
}
