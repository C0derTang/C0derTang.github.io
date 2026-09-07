import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  SpotLight,
  TubeGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Quality } from '../../config/quality'
import { mulberry32 } from '../../util/math'
import type { Materials } from '../materials'
import { WATER_Y, type SceneState } from '../state'
import type { WorldPart } from './types'

/**
 * The murky paddy floor: a bumpy mud bed with a few stones and roots, ~600 rice stems swaying up
 * to the surface, a spotlight "cookie" of drifting caustic cells, additive light shafts, and two
 * particle systems (suspended sediment, rising bubbles). Everything ambient is a closed form of
 * `state.time` - the caustic canvas is repainted from a handful of bounded sine terms (never
 * accumulated), the stem sway and the particle drift are vertex-shader closed forms of one
 * `uTime` uniform - so a frozen frame is a pure lookup and scrubbing reproduces it exactly. The
 * water surface itself belongs to `world/paddy.ts` (a DoubleSide plane); this module only
 * furnishes what sits below it.
 */

const MUD_Y = -3
const MUD_Z0 = -13
const MUD_Z1 = -45
const MUD_WIDTH = 44
const MUD_DEPTH = MUD_Z0 - MUD_Z1
const BED_GRID = 0.25
/** Below the surface the water column runs this deep before the mud. */
const COLUMN = WATER_Y - MUD_Y

/* ---------------------------- mud bed ---------------------------- */

/** Smooth seeded value noise; only world coordinates enter the sediment shape. */
function bedNoise(x: number, z: number): number {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const sx = fx * fx * (3 - 2 * fx)
  const sz = fz * fz * (3 - 2 * fz)
  const hash = (a: number, b: number): number => {
    const n = Math.sin(a * 127.1 + b * 311.7 + 9.17) * 43758.5453
    return n - Math.floor(n)
  }
  const a = hash(ix, iz) * (1 - sx) + hash(ix + 1, iz) * sx
  const b = hash(ix, iz + 1) * (1 - sx) + hash(ix + 1, iz + 1) * sx
  return (a * (1 - sz) + b * sz) * 2 - 1
}

/** Settled silt, shallow hollows and small ripples. Its ±12.5cm bound clears the deep terrain
 *  floor while leaving the bottom-swimming loach above it. Every bed detail uses this height. */
function sedimentRelief(x: number, z: number): number {
  const broad = bedNoise(x * 0.38, z * 0.38) * 0.055
  const hollows = bedNoise(x * 1.15 + 14, z * 1.15 - 9) * 0.04
  const grains = bedNoise(x * 3.8 - 4, z * 3.8 + 21) * 0.018
  const ripples = Math.sin(x * 5.2 + broad * 22) * Math.sin(z * 0.7 + 1) * 0.012
  return MUD_Y + broad + hollows + grains + ripples
}

/** Match the bed's actual quarter-metre triangles, so small roots cannot hover between samples. */
export function mudBedHeight(x: number, z: number): number {
  const gx = (x + MUD_WIDTH / 2) / BED_GRID
  const gz = (z - MUD_Z1) / BED_GRID
  const ix = Math.floor(gx)
  const iz = Math.floor(gz)
  const u = gx - ix
  const v = gz - iz
  const x0 = ix * BED_GRID - MUD_WIDTH / 2
  const z0 = iz * BED_GRID + MUD_Z1
  const a = sedimentRelief(x0, z0)
  if (u === 0 && v === 0) return a
  const b = sedimentRelief(x0, z0 + BED_GRID)
  const d = sedimentRelief(x0 + BED_GRID, z0)
  if (u + v <= 1) return a + u * (d - a) + v * (b - a)
  const c = sedimentRelief(x0 + BED_GRID, z0 + BED_GRID)
  return c + (1 - u) * (b - c) + (1 - v) * (d - c)
}

/** Keep visible details in the fully submerged depression along the camera's swim. */
function bedPoint(rnd: () => number): { x: number; z: number } {
  return { x: (rnd() - rnd()) * 12, z: -19 - rnd() * 21 }
}

function buildMudBed(mats: Materials): Mesh {
  // The positive dimensions preserve upward winding. Edges overlap beneath the pool rims.
  const geo = new PlaneGeometry(MUD_WIDTH, MUD_DEPTH, MUD_WIDTH / BED_GRID, MUD_DEPTH / BED_GRID)
  const pos = geo.attributes.position
  const uv = geo.attributes.uv
  const colors = new Float32Array((pos?.count ?? 0) * 3)
  const centerZ = (MUD_Z0 + MUD_Z1) / 2
  if (pos) {
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = centerZ - pos.getY(i)
      pos.setZ(i, mudBedHeight(x, z) - MUD_Y)
      uv?.setXY(i, x, -z)
      const patch = bedNoise(x * 0.63 + 8, z * 0.63 - 2)
      colors[i * 3] = 0.88 + patch * 0.1
      colors[i * 3 + 1] = 0.85 + patch * 0.1
      colors[i * 3 + 2] = 0.78 + patch * 0.09
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3))
  const mat = mats.make('mud', { repeat: 0.9, roughness: 0.94, color: '#b8a990' })
  mat.normalScale.set(0.6, 0.6)
  mat.aoMapIntensity = 0.45
  mat.vertexColors = true
  const mesh = new Mesh(geo, mat)
  mesh.name = 'paddy-mud-bed'
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(0, MUD_Y, centerZ)
  mesh.castShadow = false
  mesh.receiveShadow = true
  return mesh
}

function buildStones(mats: Materials, rnd: () => number, count: number): InstancedMesh {
  const geo = new IcosahedronGeometry(0.11, 1)
  geo.scale(1, 0.58, 0.78)
  const uv = geo.attributes.uv
  if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.22, uv.getY(i) * 0.22)
  const mat = mats.make('stone', { repeat: 4, roughness: 0.86, color: '#a49c85' })
  mat.normalScale.set(0.45, 0.45)
  const mesh = new InstancedMesh(geo, mat, count)
  mesh.name = 'paddy-bed-pebbles'
  const o = new Object3D()
  const color = new Color()
  for (let i = 0; i < count; i++) {
    const { x, z } = bedPoint(rnd)
    const s = 0.3 + rnd() * 0.85
    o.position.set(x, mudBedHeight(x, z) - s * 0.015, z)
    o.rotation.set(0, rnd() * Math.PI * 2, 0)
    o.scale.set(s, s, s * (0.65 + rnd() * 0.55))
    o.updateMatrix()
    mesh.setMatrixAt(i, o.matrix)
    const shade = 0.68 + rnd() * 0.3
    mesh.setColorAt(i, color.setRGB(shade, shade * 0.96, shade * 0.87))
  }
  mesh.castShadow = false
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  return mesh
}

/** Low, irregular silt clods break the silhouette without turning the bed into a rock field. */
function buildClods(mats: Materials, rnd: () => number, count: number): InstancedMesh {
  const geo = new IcosahedronGeometry(0.1, 1)
  geo.scale(1, 0.36, 0.8)
  const uv = geo.attributes.uv
  if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.2, uv.getY(i) * 0.2)
  const mat = mats.make('mud', { repeat: 0.9, roughness: 0.95, color: '#ad9c80' })
  mat.normalScale.set(0.55, 0.55)
  const mesh = new InstancedMesh(geo, mat, count)
  mesh.name = 'paddy-silt-clods'
  const o = new Object3D()
  for (let i = 0; i < count; i++) {
    const { x, z } = bedPoint(rnd)
    const s = 0.5 + rnd() * 1.1
    o.position.set(x, mudBedHeight(x, z) - 0.012 * s, z)
    o.rotation.y = rnd() * Math.PI * 2
    o.scale.set(s, s, s * (0.65 + rnd() * 0.7))
    o.updateMatrix()
    mesh.setMatrixAt(i, o.matrix)
  }
  mesh.castShadow = false
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  return mesh
}

/** Thin partly embedded roots follow the same bed height, with short branching rootlets. */
function buildRoots(mats: Materials, rnd: () => number, count: number): Mesh {
  const pieces: BufferGeometry[] = []
  const branch = (x: number, z: number, angle: number, len: number, radius: number): void => {
    const curve = new CatmullRomCurve3(
      Array.from({ length: 5 }, (_, i) => {
        const u = i / 4
        const bend = Math.sin(u * Math.PI) * len * 0.12
        const px = x + Math.cos(angle) * u * len - Math.sin(angle) * bend
        const pz = z + Math.sin(angle) * u * len + Math.cos(angle) * bend
        return new Vector3(px, mudBedHeight(px, pz) + radius * 0.4, pz)
      }),
    )
    const geo = new TubeGeometry(curve, 10, radius, 5, false)
    const pos = geo.attributes.position
    if (pos)
      for (let i = 0; i < pos.count; i++) {
        const center = curve.getPointAt(Math.floor(i / 6) / 10)
        pos.setY(i, mudBedHeight(pos.getX(i), pos.getZ(i)) + pos.getY(i) - center.y)
      }
    geo.computeVertexNormals()
    const uv = geo.attributes.uv
    if (uv)
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, uv.getX(i) * len, uv.getY(i) * radius * 2 * Math.PI)
    pieces.push(geo)
  }
  for (let i = 0; i < count; i++) {
    const { x, z } = bedPoint(rnd)
    const len = 0.35 + rnd() * 0.7
    const angle = rnd() * Math.PI * 2
    branch(x, z, angle, len, 0.011 + rnd() * 0.007)
    branch(x, z, angle + 0.65, len * 0.55, 0.006)
  }
  const merged = mergeGeometries(pieces, false)
  if (!merged) throw new Error('root geometry merge failed')
  const mesh = new Mesh(merged, mats.make('bark', { repeat: 5, roughness: 0.94, color: '#8e846d' }))
  mesh.name = 'paddy-bed-roots'
  for (const piece of pieces) piece.dispose()
  mesh.castShadow = false
  mesh.receiveShadow = true
  return mesh
}

/* ---------------------------- rice stems ---------------------------- */

/** One stem unit (tapered stalk + three leaf cards near the top), tail=0..top=`height` in y. */
function buildStemUnit(height: number): BufferGeometry {
  const stem = new CylinderGeometry(0.014, 0.032, height, 6, 2, true)
  stem.translate(0, height / 2, 0)
  const stemVerts = stem.attributes.position?.count ?? 0
  const stemColor = new Float32Array(stemVerts * 4)
  for (let i = 0; i < stemVerts; i++) {
    stemColor[i * 4] = 0.55
    stemColor[i * 4 + 1] = 0.5
    stemColor[i * 4 + 2] = 0.4
    stemColor[i * 4 + 3] = 1
  }
  stem.setAttribute('color', new BufferAttribute(stemColor, 4))

  const leaves: BufferGeometry[] = []
  for (let i = 0; i < 3; i++) {
    const leaf = new PlaneGeometry(0.05, 0.5)
    leaf.translate(0, 0.25, 0)
    leaf.rotateX(-0.4)
    leaf.translate(0, height - 0.42, 0)
    leaf.rotateY((i / 3) * Math.PI * 2)
    const leafVerts = leaf.attributes.position?.count ?? 0
    const c = new Float32Array(leafVerts * 4).fill(1)
    leaf.setAttribute('color', new BufferAttribute(c, 4))
    leaves.push(leaf)
  }
  const merged = mergeGeometries([stem, ...leaves], false)
  if (!merged) throw new Error('stem geometry merge failed')
  return merged
}

/** Gentle sway: lateral offset growing with height, a closed form of one `uTime` uniform plus a
 *  per-instance phase so stems don't sway in lockstep. */
function installStemSway(mat: MeshStandardMaterial, height: number): { setTime(t: number): void } {
  let ref: { value: number } | null = null
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 }
    ref = shader.uniforms.uTime as { value: number }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aPhase;\nuniform float uTime;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float grow = clamp(transformed.y / ${height.toFixed(4)}, 0.0, 1.0);
          grow *= grow;
          float sway = grow * (0.05 * sin(uTime * 0.6 + aPhase) + 0.02 * sin(uTime * 1.3 + aPhase * 1.7));
          transformed.x += sway;
          transformed.z += sway * 0.6;
        }`,
      )
  }
  return {
    setTime(t: number) {
      if (ref) ref.value = t
    },
  }
}

function buildStems(
  rnd: () => number,
  count: number,
): { mesh: InstancedMesh; setTime(t: number): void } {
  const height = COLUMN
  const unit = buildStemUnit(height)
  const mat = new MeshStandardMaterial({
    color: new Color('#3a6b45'),
    roughness: 0.75,
    metalness: 0,
    vertexColors: true,
    side: DoubleSide,
  })
  const sway = installStemSway(mat, height)
  const phases = new Float32Array(count)
  for (let i = 0; i < count; i++) phases[i] = rnd() * Math.PI * 2
  unit.setAttribute('aPhase', new InstancedBufferAttribute(phases, 1))

  const mesh = new InstancedMesh(unit, mat, count)
  mesh.name = 'submerged-rice-stems'
  const cols = 40
  const o = new Object3D()
  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const z = -10 - col * 0.75 + (rnd() - 0.5) * 0.3
    let x = -9 + row * 1.8 + (rnd() - 0.5) * 0.9
    // Leave room around the swim from z -24 to -34, including leaf reach and shader sway.
    if (z >= -36 && z <= -22 && Math.abs(x) < 0.8) x = (x < 0 ? -1 : 1) * (0.8 + Math.abs(x) * 0.3)
    o.position.set(x, mudBedHeight(x, z), z)
    o.rotation.y = rnd() * Math.PI * 2
    const s = 0.8 + rnd() * 0.3
    o.scale.set(s, 0.85 + rnd() * 0.25, s)
    o.updateMatrix()
    mesh.setMatrixAt(i, o.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.frustumCulled = false
  return { mesh, setTime: (t: number) => sway.setTime(t) }
}

/* ---------------------------- caustics ---------------------------- */

/** A cell-network caustic pattern, repainted from a handful of bounded sine-drifting radial
 *  blobs each frame - a pure function of time, never an accumulated simulation. */
function buildCaustics(): { light: SpotLight; paint(timeSec: number): void } {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const tex = new CanvasTexture(canvas)
  const rnd = mulberry32(77)
  const blobs = Array.from({ length: 9 }, () => ({
    x: rnd(),
    y: rnd(),
    r: 0.16 + rnd() * 0.18,
    fx: 0.05 + rnd() * 0.12,
    fy: 0.05 + rnd() * 0.12,
    ax: 0.1 + rnd() * 0.12,
    ay: 0.1 + rnd() * 0.12,
    ph: rnd() * Math.PI * 2,
  }))
  const light = new SpotLight(new Color('#bfe6de'), 0, 14, Math.PI / 3.2, 0.4, 1.4)
  light.position.set(0, 4, -34)
  light.target.position.set(0, MUD_Y, -34)
  light.castShadow = false
  light.map = tex
  const paint = (timeSec: number): void => {
    if (!ctx) return
    ctx.fillStyle = '#04110f'
    ctx.fillRect(0, 0, size, size)
    ctx.globalCompositeOperation = 'lighter'
    for (const b of blobs) {
      const x = (b.x + Math.sin(timeSec * b.fx + b.ph) * b.ax) * size
      const y = (b.y + Math.cos(timeSec * b.fy + b.ph * 1.3) * b.ay) * size
      const r = b.r * size
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, 'rgba(255,255,255,0.85)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
    tex.needsUpdate = true
  }
  paint(0)
  return { light, paint }
}

/* ---------------------------- light shafts ---------------------------- */

/** Faint light from the surface, feathered on every edge so the cards never read as pillars.
 *  alphaMap reads green, so store the falloff in opaque grayscale rather than texture alpha. */
function buildLightShafts(rnd: () => number): Mesh {
  const gradCanvas = document.createElement('canvas')
  gradCanvas.width = 32
  gradCanvas.height = 128
  const gctx = gradCanvas.getContext('2d')
  const alphaTex = new CanvasTexture(gradCanvas)
  if (gctx) {
    const pixels = gctx.createImageData(gradCanvas.width, gradCanvas.height)
    for (let y = 0; y < gradCanvas.height; y++) {
      const depth = y / (gradCanvas.height - 1)
      const entry = Math.min(depth / 0.08, 1)
      const vertical = entry * entry * (3 - 2 * entry) * (1 - depth) ** 1.8
      for (let x = 0; x < gradCanvas.width; x++) {
        const across = Math.sin((Math.PI * x) / (gradCanvas.width - 1)) ** 2
        const shade = Math.round(255 * across * vertical)
        const i = (y * gradCanvas.width + x) * 4
        pixels.data[i] = shade
        pixels.data[i + 1] = shade
        pixels.data[i + 2] = shade
        pixels.data[i + 3] = 255
      }
    }
    gctx.putImageData(pixels, 0, 0)
    alphaTex.needsUpdate = true
  }
  const pieces: BufferGeometry[] = []
  for (let i = 0; i < 6; i++) {
    const h = 2.2 + rnd() * 0.6
    const w = 0.35 + rnd() * 0.45
    const geo = new PlaneGeometry(w, h)
    geo.translate(0, h / 2, 0)
    geo.rotateZ((rnd() - 0.5) * 0.3)
    geo.rotateY(rnd() * Math.PI * 2)
    const x = -10 + rnd() * 20
    const z = -16 - rnd() * 24
    geo.translate(x, WATER_Y - h, z)
    pieces.push(geo)
  }
  const merged = mergeGeometries(pieces, false)
  if (!merged) throw new Error('light shaft geometry merge failed')
  const mat = new MeshBasicMaterial({
    color: new Color('#dffaf2'),
    transparent: true,
    opacity: 0.04,
    alphaMap: alphaTex,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  })
  const mesh = new Mesh(merged, mat)
  mesh.name = 'underwater-light-shafts'
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.frustumCulled = false
  return mesh
}

/* ---------------------------- particles ---------------------------- */

const CIRCLE_SPRITE_FRAG = `#include <map_particle_fragment>
{
  vec2 pc = gl_PointCoord - 0.5;
  float d = length(pc);
  if (d > 0.5) discard;
  diffuseColor.a *= smoothstep(0.5, 0.05, d);
}`

function installPointDrift(
  mat: PointsMaterial,
  attribDecl: string,
  moveCode: string,
): { setTime(t: number): void } {
  let ref: { value: number } | null = null
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 }
    ref = shader.uniforms.uTime as { value: number }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\n${attribDecl}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${moveCode}`)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_particle_fragment>',
      CIRCLE_SPRITE_FRAG,
    )
  }
  return {
    setTime(t: number) {
      if (ref) ref.value = t
    },
  }
}

/** Tiny pale specks drifting in a small bounded sway around a seeded resting point. */
function buildSediment(
  rnd: () => number,
  count: number,
): { points: Points; setTime(t: number): void } {
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const { x, z } = bedPoint(rnd)
    const floor = mudBedHeight(x, z)
    positions[i * 3] = x
    positions[i * 3 + 1] = floor + 0.25 + rnd() * (WATER_Y - floor - 0.5)
    positions[i * 3 + 2] = z
    seeds[i * 3] = rnd() * Math.PI * 2
    seeds[i * 3 + 1] = rnd() * Math.PI * 2
    seeds[i * 3 + 2] = rnd() * Math.PI * 2
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(positions, 3))
  geo.setAttribute('aSeed', new BufferAttribute(seeds, 3))
  const mat = new PointsMaterial({
    color: new Color('#cfd8c2'),
    size: 0.02,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    fog: true,
  })
  const drift = installPointDrift(
    mat,
    'attribute vec3 aSeed;',
    `transformed += vec3(
      sin(uTime * 0.06 + aSeed.x) * 0.35,
      sin(uTime * 0.04 + aSeed.y) * 0.18,
      cos(uTime * 0.05 + aSeed.z) * 0.35
    );`,
  )
  const points = new Points(geo, mat)
  points.frustumCulled = false
  return { points, setTime: (t: number) => drift.setTime(t) }
}

/** Bubbles rising from the mud to the surface, wrapping seamlessly back to the bottom. */
function buildBubbles(
  rnd: () => number,
  count: number,
): { points: Points; setTime(t: number): void } {
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    const { x, z } = bedPoint(rnd)
    positions[i * 3] = x
    positions[i * 3 + 1] = MUD_Y + 0.13 + rnd() * (COLUMN - 0.13)
    positions[i * 3 + 2] = z
    seeds[i * 2] = rnd()
    seeds[i * 2 + 1] = rnd() * Math.PI * 2
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(positions, 3))
  geo.setAttribute('aSeed', new BufferAttribute(seeds, 2))
  const mat = new PointsMaterial({
    color: new Color('#dff5f0'),
    size: 0.035,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: true,
  })
  const drift = installPointDrift(
    mat,
    'attribute vec2 aSeed;',
    `{
      float speed = 0.12 + 0.09 * aSeed.x;
      float localY = transformed.y - (${(MUD_Y + 0.13).toFixed(2)});
      float wrapped = mod(localY + uTime * speed, ${(COLUMN - 0.13).toFixed(3)});
      transformed.y = (${(MUD_Y + 0.13).toFixed(2)}) + wrapped;
      transformed.x += sin(uTime * 0.6 + aSeed.y) * 0.15;
      transformed.z += cos(uTime * 0.5 + aSeed.y * 1.3) * 0.15;
    }`,
  )
  const points = new Points(geo, mat)
  points.frustumCulled = false
  return { points, setTime: (t: number) => drift.setTime(t) }
}

/* ---------------------------- factory ---------------------------- */

export function createUnderwater(mats: Materials, quality: Quality): WorldPart {
  const group = new Group()
  const scale = quality.software ? 0.35 : quality.tier === 'low' ? 0.6 : 1
  const rnd = mulberry32(9001)

  const mud = buildMudBed(mats)
  const stones = buildStones(mats, rnd, Math.max(16, Math.round(96 * scale)))
  const clods = buildClods(mats, rnd, Math.max(12, Math.round(48 * scale)))
  const roots = buildRoots(mats, rnd, Math.max(4, Math.round(16 * scale)))
  const stems = buildStems(rnd, Math.max(80, Math.round(600 * scale)))
  const shafts = buildLightShafts(rnd)
  const caustics = buildCaustics()
  const sediment = buildSediment(rnd, Math.max(300, Math.round(2000 * scale)))
  const bubbles = buildBubbles(rnd, Math.max(60, Math.round(300 * scale)))

  group.add(mud, stones, clods, roots, stems.mesh, shafts, sediment.points, bubbles.points)
  group.add(caustics.light, caustics.light.target)

  return {
    group,
    update(state: SceneState) {
      const lt = state.reduced ? 0 : state.time / 1000
      stems.setTime(lt)
      caustics.light.intensity = state.underwater ? 30 : 0
      shafts.visible = state.underwater
      sediment.points.visible = state.underwater
      bubbles.points.visible = state.underwater
      if (state.underwater) {
        caustics.paint(lt)
        sediment.setTime(lt)
        bubbles.setTime(lt)
      }
    },
  }
}
