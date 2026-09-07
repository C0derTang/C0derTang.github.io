import {
  AdditiveBlending,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
} from 'three'
import type { Quality } from '../../config/quality'
import { mulberry32 } from '../../util/math'
import type { SceneState } from '../state'
import type { WorldPart } from './types'

/** Shared plan position for the hearth opening, fire, suspended kettle and warm light. */
export const HEARTH_CENTER = { x: 0, z: -3.4 } as const

/** Shared by the coals, flames and hearth light; no accumulated simulation state. */
export function hearthFlicker(time: number, reduced: boolean): number {
  if (reduced) return 1
  const t = time / 1000
  return 1 + Math.sin(t * 7.3) * 0.12 + Math.sin(t * 13.7 + 2.1) * 0.07 + Math.sin(t * 3.1) * 0.1
}

const noise = /* glsl */ `
  float fireHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float fireNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(fireHash(i), fireHash(i + vec2(1.0, 0.0)), f.x),
      mix(fireHash(i + vec2(0.0, 1.0)), fireHash(i + 1.0), f.x), f.y);
  }
`

/** Small, layered flame sprites: anchored tongues curl upward while fine detail advects. */
export function createHearthFire(quality: Quality): WorldPart {
  const group = new Group()
  group.name = 'hearth-fire'
  const uTime = { value: 0 }
  const uGlow = { value: 1 }
  const rnd = mulberry32(104)
  const dummy = new Object3D()

  const flameGeometry = new PlaneGeometry(0.25, 0.48, 1, 8)
  flameGeometry.translate(0, 0.24, 0)
  const count = quality.tier === 'high' ? 11 : 7
  const seeds = new Float32Array(count * 2)
  const flameMaterial = new MeshStandardMaterial({
    color: '#180b02',
    emissive: '#ff8a24',
    emissiveIntensity: 2,
    roughness: 1,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  })
  flameMaterial.forceSinglePass = true
  flameMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime
    shader.uniforms.uGlow = uGlow
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uTime;
      attribute vec2 aFireSeed;
      varying vec2 vFireUv;
      varying vec2 vFireSeed;`,
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vFireUv = uv;
      vFireSeed = aFireSeed;
      float phase = aFireSeed.x * 6.283185;
      float pulse = 0.82 + 0.15 * sin(uTime * 7.3 + phase)
        + 0.09 * sin(uTime * 11.9 + phase * 2.0);
      transformed.y *= pulse * (0.64 + aFireSeed.y * 0.55);
      transformed.x += uv.y * uv.y * (sin(uTime * 4.2 - uv.y * 5.0 + phase) * 0.055
        + sin(uTime * 9.1 - uv.y * 8.0 + phase) * 0.021);
      // Rotate each sprite around world up so it has volume from every room face.
      vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
      transformed = right * transformed.x + vec3(0.0, transformed.y, 0.0);`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uTime;
      uniform float uGlow;
      varying vec2 vFireUv;
      varying vec2 vFireSeed;
      ${noise}`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec2 uvFire = vFireUv;
      float phase = vFireSeed.x * 9.0;
      vec2 flow = vec2(uvFire.x * 4.0 + phase, uvFire.y * 5.5 - uTime * 3.4);
      float turbulence = fireNoise(flow) * 0.65 + fireNoise(flow * 2.3) * 0.35;
      float center = 0.5 + sin(uvFire.y * 7.0 - uTime * 4.0 + phase) * uvFire.y * 0.13;
      float width = (1.0 - uvFire.y) * 0.4 + (turbulence - 0.5) * uvFire.y * 0.24;
      float edge = 1.0 - smoothstep(width * 0.35, max(0.01, width), abs(uvFire.x - center));
      float flameAlpha = edge * smoothstep(0.0, 0.09, uvFire.y)
        * (1.0 - smoothstep(0.74, 1.0, uvFire.y + (turbulence - 0.5) * 0.25));
      diffuseColor.a *= flameAlpha * 0.62;
      if (diffuseColor.a < 0.015) discard;`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float hot = (1.0 - smoothstep(0.12, 0.64, uvFire.y)) * edge;
      totalEmissiveRadiance = mix(vec3(2.5, 0.28, 0.018), vec3(4.0, 2.7, 0.8), hot) * uGlow;`,
    )
  }
  const flames = new InstancedMesh(flameGeometry, flameMaterial, count)
  flames.name = 'hearth-flames'
  for (let i = 0; i < count; i++) {
    const angle = rnd() * Math.PI * 2
    const radius = Math.sqrt(rnd()) * 0.23
    dummy.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
    dummy.updateMatrix()
    flames.setMatrixAt(i, dummy.matrix)
    seeds[i * 2] = rnd()
    seeds[i * 2 + 1] = rnd()
  }
  flameGeometry.setAttribute('aFireSeed', new InstancedBufferAttribute(seeds, 2))
  flames.frustumCulled = false
  group.add(flames)

  // A few short-lived embers rise on seeded paths, fading before their phase wraps.
  const sparkGeometry = new PlaneGeometry(0.007, 0.018)
  const sparkCount = quality.tier === 'high' ? 7 : 3
  const sparkSeeds = new Float32Array(sparkCount * 2)
  const sparkMaterial = new MeshStandardMaterial({
    color: '#210900',
    emissive: '#ff6818',
    emissiveIntensity: 3,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  })
  sparkMaterial.forceSinglePass = true
  sparkMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uTime; attribute vec2 aFireSeed;
      varying vec2 vSparkUv; varying float vLife;`,
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vSparkUv = uv;
      vLife = fract(uTime * (0.27 + aFireSeed.y * 0.14) + aFireSeed.x);
      vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
      transformed = right * position.x + vec3(0.0, position.y, 0.0);
      transformed += vec3(sin(vLife * 5.0 + aFireSeed.x * 12.0) * vLife * 0.12,
        vLife * 0.68, cos(vLife * 4.0 + aFireSeed.x * 9.0) * vLife * 0.08);`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec2 vSparkUv; varying float vLife;',
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float spark = 1.0 - smoothstep(0.1, 0.5, length(vSparkUv - 0.5));
      diffuseColor.a *= spark * smoothstep(0.0, 0.12, vLife)
        * (1.0 - smoothstep(0.25, 0.8, vLife));
      if (diffuseColor.a < 0.01) discard;`,
    )
  }
  const sparks = new InstancedMesh(sparkGeometry, sparkMaterial, sparkCount)
  sparks.name = 'hearth-sparks'
  for (let i = 0; i < sparkCount; i++) {
    dummy.position.set((rnd() - 0.5) * 0.25, 0.04, (rnd() - 0.5) * 0.25)
    dummy.updateMatrix()
    sparks.setMatrixAt(i, dummy.matrix)
    sparkSeeds[i * 2] = rnd()
    sparkSeeds[i * 2 + 1] = rnd()
  }
  sparkGeometry.setAttribute('aFireSeed', new InstancedBufferAttribute(sparkSeeds, 2))
  sparks.frustumCulled = false
  group.add(sparks)

  return {
    group,
    update(state: SceneState) {
      uTime.value = state.reduced ? 0 : state.time / 1000
      uGlow.value = hearthFlicker(state.time, state.reduced)
      sparks.visible = !state.reduced
    },
  }
}
