import {
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  PointLight,
  Vector3,
  type PerspectiveCamera,
  type Scene,
} from 'three'
import type { Quality } from '../config/quality'
import { BEATS } from '../config/beats'
import { monotoneCubic } from '../util/math'
import type { SceneState } from './state'

/**
 * Fog, sky/sun lights and the room lights, all driven from the state each frame. One
 * directional light casts shadows; its orthographic frustum is fitted every frame to a box
 * ahead of the camera (radius keyed by beat), so one 1536 map covers yard, room and paddy
 * without cascades. Instanced foliage never casts.
 */
export interface Atmosphere {
  apply(state: SceneState, camera: PerspectiveCamera): void
}

const shadowRadius = monotoneCubic([
  [0, 16],
  [BEATS.enter[0], 14],
  [BEATS.enter[1], 6],
  [BEATS.doors[1], 6],
  [BEATS.paddy[0] + 0.04, 26],
  [1, 26],
])

export function createAtmosphere(scene: Scene, quality: Quality): Atmosphere {
  const fog = new FogExp2(new Color('#b9c3c6'), 0.028)
  scene.fog = fog
  scene.background = fog.color

  const sun = new DirectionalLight(new Color('#d7dde0'), 1.1)
  sun.castShadow = true
  sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize)
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.03
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 140
  scene.add(sun)
  scene.add(sun.target)
  // Overcast key: from the upper left of the yard view, low elevation.
  const sunDir = new Vector3(-0.55, 0.62, 0.55).normalize()

  const sky = new HemisphereLight(new Color('#9fb4c0'), new Color('#3f4f38'), 0.7)
  scene.add(sky)

  const lamp = new PointLight(new Color('#f2b45a'), 0, 14, 2)
  lamp.position.set(1.5, 2.3, -4)
  scene.add(lamp)
  const hearth = new PointLight(new Color('#e06a3a'), 0, 6, 2)
  hearth.position.set(0, 0.75, -3.4)
  scene.add(hearth)

  const forward = new Vector3()
  const center = new Vector3()
  let lastRadius = -1
  return {
    apply(state, camera) {
      fog.color.set(state.fog.color)
      fog.density = state.fog.density
      sun.intensity = state.sun.intensity
      sun.color.set(state.sun.color)
      sky.intensity = state.sky
      lamp.intensity = state.lamp
      hearth.intensity = state.lamp * 0.35
      sun.visible = !state.underwater

      // Fit the shadow frustum around a point ahead of the camera.
      const r = shadowRadius(state.t)
      camera.getWorldDirection(forward)
      center.copy(camera.position).addScaledVector(forward, r * 0.6)
      center.y = Math.max(0, center.y)
      sun.target.position.copy(center)
      sun.position.copy(center).addScaledVector(sunDir, 60)
      if (r !== lastRadius) {
        lastRadius = r
        const c = sun.shadow.camera
        c.left = -r
        c.right = r
        c.top = r
        c.bottom = -r
        c.updateProjectionMatrix()
      }
    },
  }
}
