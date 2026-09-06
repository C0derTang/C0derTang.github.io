import {
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type Camera,
} from 'three'
import type { Quality } from '../../config/quality'
import { mulberry32 } from '../../util/math'
import type { SceneState } from '../state'

/**
 * Rain as one instanced draw: thin quads in a 24 m box wrapped around the camera. Every drop's
 * position is a closed form of one time uniform (never integrated on the CPU), so a frozen time
 * gives a still frame and scrubbing is reproducible. Drops inside the house box are collapsed in
 * the vertex shader, so the rain shows through the door and windows by itself. Streak length
 * follows the apparent speed (scroll toward the rain) and the wind slants the fall.
 */
export interface Rain {
  mesh: Mesh
  update(state: SceneState, camera: Camera): void
}

const BOX = 24
/** The house volume no drop may enter (x, y, z ranges in metres). */
const HOUSE_MIN = new Vector3(-5.6, -1, -7.2)
const HOUSE_MAX = new Vector3(5.6, 6.2, 0.9)

export function createRain(quality: Quality): Rain {
  const n = quality.rainCount
  const rnd = mulberry32(11)
  const base = new PlaneGeometry(0.014, 0.3)
  const geo = new InstancedBufferGeometry()
  geo.index = base.index
  geo.attributes.position = base.attributes.position as never
  geo.attributes.uv = base.attributes.uv as never
  const offsets = new Float32Array(n * 3)
  const seeds = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    offsets[i * 3] = rnd() * BOX
    offsets[i * 3 + 1] = rnd() * BOX
    offsets[i * 3 + 2] = rnd() * BOX
    seeds[i * 2] = rnd()
    seeds[i * 2 + 1] = rnd()
  }
  geo.setAttribute('aOffset', new InstancedBufferAttribute(offsets, 3))
  geo.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 2))
  geo.instanceCount = n

  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCenter: { value: new Vector3() },
      uRight: { value: new Vector3(1, 0, 0) },
      uWind: { value: new Vector3(0.35, 0, 0) },
      uStretch: { value: 1 },
      uAlpha: { value: 1 },
      uColor: { value: new Color('#dfe6ea') },
      uHouseMin: { value: HOUSE_MIN },
      uHouseMax: { value: HOUSE_MAX },
    },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform vec3 uCenter; uniform vec3 uRight; uniform vec3 uWind;
      uniform float uStretch; uniform vec3 uHouseMin; uniform vec3 uHouseMax;
      attribute vec3 aOffset; attribute vec2 aSeed;
      varying vec2 vUv; varying float vFade;
      const float BOX = ${BOX.toFixed(1)};
      void main() {
        vUv = uv;
        float speed = (7.5 + 4.0 * aSeed.x) * uStretch;
        // Drops fixed in world space, wrapped around the camera in x/z and falling in y.
        float x = mod(aOffset.x - uCenter.x, BOX) - BOX * 0.5;
        float z = mod(aOffset.z - uCenter.z, BOX) - BOX * 0.5;
        float y = mod(aOffset.y - uTime * speed, BOX) - BOX * 0.5;
        vec3 fallDir = normalize(vec3(uWind.x, -1.0, uWind.z));
        vec3 drop = uCenter + vec3(x, y, z) + uWind * y * 0.5;
        bool inHouse = all(greaterThan(drop, uHouseMin)) && all(lessThan(drop, uHouseMax));
        vec3 wp = drop + uRight * position.x + fallDir * position.y * (0.8 + 1.4 * uStretch);
        float dist = length(vec3(x, y, z));
        vFade = (1.0 - smoothstep(6.0, 12.0, dist)) * (inHouse ? 0.0 : 1.0);
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        gl_Position = inHouse ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAlpha; uniform vec3 uColor;
      varying vec2 vUv; varying float vFade;
      void main() {
        float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
        float along = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
        float a = uAlpha * vFade * across * along * 0.55;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
  })
  const mesh = new Mesh(geo, material)
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = false
  const right = new Vector3()
  return {
    mesh,
    update(state, camera) {
      const u = material.uniforms
      mesh.visible = state.rain.alpha > 0.001 && !state.underwater
      if (!mesh.visible) return
      ;(u.uTime as { value: number }).value = state.reduced ? 0 : state.time / 1000
      ;(u.uCenter as { value: Vector3 }).value.copy(camera.position)
      camera.matrixWorld.extractBasis(right, new Vector3(), new Vector3())
      ;(u.uRight as { value: Vector3 }).value.copy(right)
      ;(u.uWind as { value: Vector3 }).value.set(state.rain.windX, 0, state.rain.windZ)
      ;(u.uStretch as { value: number }).value = state.rain.speed
      ;(u.uAlpha as { value: number }).value = state.rain.alpha
    },
  }
}
