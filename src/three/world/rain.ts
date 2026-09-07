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
import { FIELD_RAIN_BOUNDS } from './field-rain'
import { insidePuddle, PUDDLE_Y, PUDDLES } from './puddles'

/**
 * Ambient rain as one instanced draw: thin quads in a 24 m box wrapped around the camera. Every drop's
 * position is a closed form of one time uniform (never integrated on the CPU), so a frozen time
 * gives a still frame and scrubbing is reproducible. Drops inside the house box are collapsed in
 * the vertex shader, so the rain shows through the door and windows by itself. Streak length
 * follows the apparent speed (scroll toward the rain); world-space wind and falling speed stay fixed.
 */
export interface Rain {
  mesh: Mesh
  /** splash rings confined to standing water (pre-seeded schedule, closed form of time) */
  splashes: Mesh
  update(state: SceneState, camera: Camera): void
}

const BOX = 24
const SPLASH_RADIUS = 0.18
// Both shaders use this clock: falling drop, impact, expanding ripple, then a quiet interval.
const IMPACT_TIMING = /* glsl */ `
  const float IMPACT_CYCLE = 1.8;
  const float DROP_DURATION = 0.4;
  const float RIPPLE_DURATION = 0.8;
  const float DROP_HEIGHT = 3.2;
  float impactPhase(float time, float seed) {
    return mod(time + seed * IMPACT_CYCLE, IMPACT_CYCLE);
  }
`
/** The house volume no drop may enter (x, y, z ranges in metres). */
const HOUSE_MIN = new Vector3(-5.6, -1, -7.2)
const HOUSE_MAX = new Vector3(5.6, 6.2, 0.9)

export function createRain(quality: Quality): Rain {
  const n = quality.rainCount
  const rnd = mulberry32(11)
  const base = new PlaneGeometry(0.009, 0.23)
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
        // Changing scroll speed must not retime an entire elapsed fall or move it with the camera.
        float speed = 7.5 + 4.0 * aSeed.x;
        vec3 velocity = vec3(uWind.x, -1.0, uWind.z) * speed;
        vec3 falling = aOffset + velocity * uTime;
        // Select the nearest periodic copy; every boundary is beyond the fully faded 12 m radius.
        vec3 relative = mod(falling - uCenter + BOX * 0.5, BOX) - BOX * 0.5;
        vec3 drop = uCenter + relative;
        vec3 fallDir = normalize(velocity);
        bool inHouse = all(greaterThan(drop, uHouseMin)) && all(lessThan(drop, uHouseMax));
        // Camera motion changes only the short exposure streak, capped to a modest length change.
        float streak = 2.2 + 0.4 * (uStretch - 1.0);
        vec3 wp = drop + uRight * position.x + fallDir * position.y * streak;
        float dist = length(relative);
        // Keep nearby drops from becoming bright bars across the entire viewport.
        vFade = smoothstep(1.2, 3.2, dist) * (1.0 - smoothstep(6.0, 12.0, dist)) * (inHouse ? 0.0 : 1.0);
        // Near the field surface, the drops paired with actual water impacts take over.
        bool overField = drop.x > ${FIELD_RAIN_BOUNDS.minX.toFixed(1)} && drop.x < ${FIELD_RAIN_BOUNDS.maxX.toFixed(1)} &&
                         drop.z > ${FIELD_RAIN_BOUNDS.minZ.toFixed(1)} && drop.z < ${FIELD_RAIN_BOUNDS.maxZ.toFixed(1)};
        bool overDike = drop.z > -48.0 && abs(abs(drop.x) - 2.6) < 0.45;
        if (overField && !overDike) vFade *= smoothstep(${(FIELD_RAIN_BOUNDS.topY - 0.3).toFixed(1)}, ${(FIELD_RAIN_BOUNDS.topY + 0.3).toFixed(1)}, drop.y);
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        gl_Position = inHouse ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAlpha; uniform vec3 uColor;
      varying vec2 vUv; varying float vFade;
      void main() {
        float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
        float along = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
        float a = uAlpha * vFade * across * along * 0.35;
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

  // Grass and damp gravel do not make water rings. Seed only standing-water polygons, inset by
  // the largest ring radius, and keep that entire circle on the three-metre gravel path too.
  const splashCount = Math.max(8, Math.round(n / 150))
  const sGeo = new InstancedBufferGeometry()
  const sBase = new PlaneGeometry(1, 1)
  sGeo.index = sBase.index
  sGeo.attributes.position = sBase.attributes.position as never
  sGeo.attributes.uv = sBase.attributes.uv as never
  const sPos = new Float32Array(splashCount * 3)
  const sSeed = new Float32Array(splashCount)
  for (let i = 0; i < splashCount; i++) {
    const puddleIndex = i % PUDDLES.length
    const puddle = PUDDLES[puddleIndex]
    if (!puddle) continue
    let x: number
    let z: number
    do {
      x = puddle.x + (rnd() - 0.5) * puddle.radius * 2.36
      z = puddle.z + (rnd() - 0.5) * puddle.radius * 1.7
    } while (
      Math.abs(x) + SPLASH_RADIUS > 1.48 ||
      !insidePuddle(puddleIndex, x, z, SPLASH_RADIUS + 0.005)
    )
    sPos[i * 3] = x
    sPos[i * 3 + 1] = PUDDLE_Y + 0.003
    sPos[i * 3 + 2] = z
    sSeed[i] = rnd()
  }
  sGeo.setAttribute('aPos', new InstancedBufferAttribute(sPos, 3))
  sGeo.setAttribute('aPhase', new InstancedBufferAttribute(sSeed, 1))
  sGeo.instanceCount = splashCount
  const impactUniforms = {
    uTime: { value: 0 },
    uAlpha: { value: 1 },
    uRight: { value: new Vector3(1, 0, 0) },
    uWind: { value: new Vector3(0.35, 0, 0) },
  }
  const sMat = new ShaderMaterial({
    uniforms: {
      ...impactUniforms,
      uColor: { value: new Color('#98acad') },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute vec3 aPos; attribute float aPhase;
      varying vec2 vUv; varying float vU; varying float vActive;
      ${IMPACT_TIMING}
      void main() {
        vUv = uv;
        float phase = impactPhase(uTime, aPhase);
        float age = phase - DROP_DURATION;
        float u = clamp(age / RIPPLE_DURATION, 0.0, 1.0);
        vU = u;
        vActive = step(0.0, age) * (1.0 - step(RIPPLE_DURATION, age));
        float s = mix(0.008, ${(SPLASH_RADIUS * 2).toFixed(3)}, u);
        vec3 wp = aPos + vec3(position.x * s, 0.0, -position.y * s);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAlpha; uniform vec3 uColor;
      varying vec2 vUv; varying float vU; varying float vActive;
      void main() {
        float d = length(vUv - 0.5);
        float ring = smoothstep(0.40, 0.45, d) * (1.0 - smoothstep(0.47, 0.5, d));
        // A soft crest and shallow trough sit within the water's reflected color.
        float trough = smoothstep(0.30, 0.35, d) * (1.0 - smoothstep(0.37, 0.42, d));
        float impact = (1.0 - smoothstep(0.0, 0.18, d)) * exp(-vU * 32.0);
        float envelope = smoothstep(0.0, 0.075, vU) * (1.0 - smoothstep(0.1, 1.0, vU));
        float crestWeight = (ring + impact) * envelope;
        float troughWeight = trough * envelope * 0.3;
        float weight = crestWeight + troughWeight;
        float a = weight * vActive * 0.14 * uAlpha;
        if (a < 0.003) discard;
        vec3 color = mix(uColor * 0.55, uColor, crestWeight / max(weight, 0.0001));
        gl_FragColor = vec4(color, a);
      }`,
    transparent: true,
    depthWrite: false,
  })
  const splashes = new Mesh(sGeo, sMat)
  splashes.frustumCulled = false
  splashes.castShadow = false
  splashes.receiveShadow = false

  // The incoming streak and its ring use the exact same point and phase attributes. The streak's
  // leading tip reaches PUDDLE_Y at DROP_DURATION; only then does the ripple become visible.
  const impactGeo = new InstancedBufferGeometry()
  const impactBase = new PlaneGeometry(0.008, 0.2).translate(0, 0.1, 0)
  impactGeo.index = impactBase.index
  impactGeo.attributes.position = impactBase.attributes.position as never
  impactGeo.attributes.uv = impactBase.attributes.uv as never
  impactGeo.setAttribute('aPos', sGeo.getAttribute('aPos'))
  impactGeo.setAttribute('aPhase', sGeo.getAttribute('aPhase'))
  impactGeo.instanceCount = splashCount
  const impactMat = new ShaderMaterial({
    uniforms: {
      ...impactUniforms,
      uColor: { value: new Color('#dfe6ea') },
    },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform vec3 uRight; uniform vec3 uWind;
      attribute vec3 aPos; attribute float aPhase;
      varying vec2 vUv; varying float vFade;
      ${IMPACT_TIMING}
      void main() {
        vUv = uv;
        float phase = impactPhase(uTime, aPhase);
        float height = DROP_HEIGHT * (1.0 - clamp(phase / DROP_DURATION, 0.0, 1.0));
        vec3 upstream = vec3(-uWind.x, 1.0, -uWind.z);
        vec3 tip = aPos - vec3(0.0, 0.003, 0.0) + upstream * height;
        vec3 wp = tip + uRight * position.x + normalize(upstream) * position.y;
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        vFade = (1.0 - step(DROP_DURATION, phase)) * smoothstep(0.0, 0.04, phase);
        vFade *= 1.0 - smoothstep(16.0, 24.0, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAlpha; uniform vec3 uColor;
      varying vec2 vUv; varying float vFade;
      void main() {
        float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
        float tail = 1.0 - smoothstep(0.55, 1.0, vUv.y);
        float a = across * tail * vFade * uAlpha * 0.55;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  })
  const impacts = new Mesh(impactGeo, impactMat)
  impacts.frustumCulled = false
  impacts.castShadow = false
  impacts.receiveShadow = false
  splashes.add(impacts)

  const right = new Vector3()
  return {
    mesh,
    splashes,
    update(state, camera) {
      const u = material.uniforms
      mesh.visible = state.rain.alpha > 0.001 && !state.underwater
      splashes.visible = mesh.visible && camera.position.z > -6
      impactUniforms.uTime.value = state.reduced ? 0 : state.time / 1000
      impactUniforms.uAlpha.value = state.rain.alpha
      if (!mesh.visible) return
      ;(u.uTime as { value: number }).value = state.reduced ? 0 : state.time / 1000
      ;(u.uCenter as { value: Vector3 }).value.copy(camera.position)
      camera.matrixWorld.extractBasis(right, new Vector3(), new Vector3())
      impactUniforms.uRight.value.copy(right)
      impactUniforms.uWind.value.set(state.rain.windX, 0, state.rain.windZ)
      ;(u.uRight as { value: Vector3 }).value.copy(right)
      ;(u.uWind as { value: Vector3 }).value.set(state.rain.windX, 0, state.rain.windZ)
      ;(u.uStretch as { value: number }).value = state.rain.speed
      ;(u.uAlpha as { value: number }).value = state.rain.alpha
    },
  }
}
