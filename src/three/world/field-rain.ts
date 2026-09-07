import {
  Color,
  DataTexture,
  DoubleSide,
  FloatType,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NearestFilter,
  PlaneGeometry,
  RGBAFormat,
  ShaderMaterial,
  Vector3,
  type MeshPhysicalMaterial,
} from 'three'
import type { Quality } from '../../config/quality'
import { mulberry32 } from '../../util/math'
import { WATER_Y } from '../state'
import type { WorldPart } from './types'

const MIN_X = -45
const MIN_Z = -52
const WIDTH = 90
const DEPTH = 44
const CELL = 1.25
const COLS = Math.ceil(WIDTH / CELL)
const ROWS = Math.ceil(DEPTH / CELL)
const CYCLE = 2.2
const FALL = 0.45
const LIFE = 1.2
const HEIGHT = 3.6
export const FIELD_RAIN_BOUNDS = {
  minX: MIN_X,
  maxX: MIN_X + WIDTH,
  minZ: MIN_Z,
  maxZ: MIN_Z + DEPTH,
  topY: WATER_Y + HEIGHT,
} as const

/** Shared by the surface and incoming drops; the impact begins only at the end of the fall. */
const IMPACT_CLOCK = /* glsl */ `
  float fieldImpactAge(float time, float phase) {
    return mod(time + phase * ${CYCLE.toFixed(2)}, ${CYCLE.toFixed(2)}) - ${FALL.toFixed(2)};
  }
`

/** The exact float seeds are consumed by both the water shader and the falling-drop instances. */
export function fieldRainSeeds(): Float32Array {
  const rnd = mulberry32(79)
  const data = new Float32Array(COLS * ROWS * 4)
  for (let z = 0; z < ROWS; z++) {
    for (let x = 0; x < COLS; x++) {
      const i = (z * COLS + x) * 4
      const jx = 0.15 + rnd() * 0.7
      const jz = 0.15 + rnd() * 0.7
      const px = MIN_X + (x + jx) * CELL
      const pz = MIN_Z + (z + jz) * CELL
      data[i] = jx
      data[i + 1] = jz
      data[i + 2] = rnd()
      // Rain on the raised dikes does not disturb the water below them.
      const onDike = pz >= -48 && Math.abs(Math.abs(px) - 2.6) < 0.5
      data[i + 3] = pz < -8 && !onDike ? 1 : 0
    }
  }
  return data
}

/** Calm physical water perturbed only by local rain impacts, with no drifting normal texture. */
export function createFieldRain(water: MeshPhysicalMaterial, quality: Quality): WorldPart {
  const data = fieldRainSeeds()
  const seeds = new DataTexture(data, COLS, ROWS, RGBAFormat, FloatType)
  seeds.minFilter = NearestFilter
  seeds.magFilter = NearestFilter
  seeds.generateMipmaps = false
  seeds.needsUpdate = true
  const uniforms = {
    uFieldTime: { value: 0 },
    uFieldWind: { value: new Vector3() },
  }

  water.normalMap = null
  water.onBeforeCompile = (shader) => {
    shader.uniforms.uFieldTime = uniforms.uFieldTime
    shader.uniforms.uFieldSeeds = { value: seeds }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFieldPosition;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvFieldPosition = (modelMatrix * vec4(position, 1.0)).xz;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec2 vFieldPosition;
        uniform sampler2D uFieldSeeds;
        uniform float uFieldTime;
        ${IMPACT_CLOCK}
        // Returns the world-space height gradient and a restrained crest highlight.
        vec3 fieldRipples(vec2 p) {
          float pixelWidth = length(fwidth(p));
          vec2 grid = (p - vec2(${MIN_X.toFixed(1)}, ${MIN_Z.toFixed(1)})) / ${CELL.toFixed(2)};
          vec2 cell = floor(grid);
          vec3 result = vec3(0.0);
          for (int z = -1; z <= 1; z++) {
            for (int x = -1; x <= 1; x++) {
              vec2 neighbor = cell + vec2(float(x), float(z));
              if (any(lessThan(neighbor, vec2(0.0))) ||
                  any(greaterThanEqual(neighbor, vec2(${COLS.toFixed(1)}, ${ROWS.toFixed(1)})))) continue;
              vec4 seed = texture2D(uFieldSeeds, (neighbor + 0.5) / vec2(${COLS.toFixed(1)}, ${ROWS.toFixed(1)}));
              float age = fieldImpactAge(uFieldTime, seed.b);
              if (seed.a < 0.5 || age < 0.0 || age >= ${LIFE.toFixed(2)}) continue;
              vec2 delta = (grid - neighbor - seed.rg) * ${CELL.toFixed(2)};
              float r = length(delta);
              float radius = 0.018 + age * 0.46;
              float front = r - radius;
              // Filter the narrow crest at oblique/distant views, keeping it on the water.
              float width = max(0.026, pixelWidth * 1.25);
              float q = front / width;
              float inner = (front + 0.065) / (width * 1.35);
              float crest = exp(-q * q);
              float trough = exp(-inner * inner);
              float decay = pow(1.0 - age / ${LIFE.toFixed(2)}, 1.7);
              float slope = (-2.0 * q * crest / width + 0.8 * inner * trough / (width * 1.35)) * 0.0038 * decay;
              result.xy += delta / max(r, 0.001) * slope;
              result.z += crest * decay * 0.045;
            }
          }
          return result;
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        vec3 rainSurface = fieldRipples(vFieldPosition);
        vec3 rainNormal = normalize(vec3(-rainSurface.x, 1.0, -rainSurface.y));
        normal = normalize(mat3(viewMatrix) * rainNormal) * faceDirection;`,
      )
      .replace(
        'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
        `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
        outgoingLight += rainSurface.z * vec3(0.75, 0.85, 0.88);`,
      )
  }
  water.customProgramCacheKey = () => 'field-rain-impacts-v1'
  water.needsUpdate = true

  const positions: number[] = []
  const phases: number[] = []
  for (let z = 0; z < ROWS; z++) {
    for (let x = 0; x < COLS; x++) {
      const i = (z * COLS + x) * 4
      const jx = data[i] ?? 0
      const jz = data[i + 1] ?? 0
      const phase = data[i + 2] ?? 0
      if ((data[i + 3] ?? 0) === 0) continue
      positions.push(MIN_X + (x + jx) * CELL, WATER_Y, MIN_Z + (z + jz) * CELL)
      phases.push(phase)
    }
  }
  const base = new PlaneGeometry(0.008, 0.18).translate(0, 0.09, 0)
  const geo = new InstancedBufferGeometry()
  geo.index = base.index
  geo.setAttribute('position', base.getAttribute('position'))
  geo.setAttribute('uv', base.getAttribute('uv'))
  geo.setAttribute('aLanding', new InstancedBufferAttribute(new Float32Array(positions), 3))
  geo.setAttribute('aPhase', new InstancedBufferAttribute(new Float32Array(phases), 1))
  geo.instanceCount = phases.length
  const material = new ShaderMaterial({
    uniforms: {
      ...uniforms,
      uColor: { value: new Color('#dfe6ea') },
    },
    vertexShader: /* glsl */ `
      uniform float uFieldTime;
      uniform vec3 uFieldWind;
      attribute vec3 aLanding;
      attribute float aPhase;
      varying vec2 vUv;
      varying float vAlpha;
      ${IMPACT_CLOCK}
      void main() {
        vUv = uv;
        float age = fieldImpactAge(uFieldTime, aPhase);
        float height = -age * ${(HEIGHT / FALL).toFixed(1)};
        vec3 upstream = vec3(-uFieldWind.x, 1.0, -uFieldWind.z);
        vec3 tip = aLanding + upstream * max(height, 0.0);
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 wp = tip + right * position.x + normalize(upstream) * position.y;
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        vAlpha = (1.0 - step(0.0, age)) * smoothstep(-${FALL.toFixed(2)}, -${(FALL - 0.04).toFixed(2)}, age);
        vAlpha *= 1.0 - smoothstep(18.0, 35.0, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vAlpha;
      void main() {
        float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
        float tail = 1.0 - smoothstep(0.55, 1.0, vUv.y);
        float alpha = across * tail * vAlpha * 0.5;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uColor, alpha);
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  })
  const drops = new Mesh(geo, material)
  drops.name = 'rice-field-rain-impacts'
  drops.castShadow = false
  drops.receiveShadow = false
  drops.frustumCulled = false
  // The software tier retains the surface response without spending fill on distant streaks.
  drops.visible = !quality.software
  const group = new Group()
  group.add(drops)
  return {
    group,
    update(state) {
      uniforms.uFieldTime.value = state.reduced ? 0 : state.time / 1000
      uniforms.uFieldWind.value.set(state.rain.windX, 0, state.rain.windZ)
      drops.visible = !quality.software && !state.underwater && state.pose.z < 1
    },
  }
}
