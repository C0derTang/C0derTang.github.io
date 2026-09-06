import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
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
const MUD_Z0 = -8
const MUD_Z1 = -68
/** Below the surface the water column runs this deep before the mud. */
const COLUMN = WATER_Y - MUD_Y

/* ---------------------------- mud bed ---------------------------- */

function buildMudBed(mats: Materials, rnd: () => number): Mesh {
  const width = 90
  const depth = MUD_Z1 - MUD_Z0
  const geo = new PlaneGeometry(width, depth, 56, 36)
  const pos = geo.attributes.position
  const fx1 = 0.1 + rnd() * 0.08
  const fy1 = 0.09 + rnd() * 0.07
  const fx2 = 0.35 + rnd() * 0.2
  const phase = rnd() * Math.PI * 2
  if (pos) {
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const bump =
        0.16 * Math.sin(x * fx1 + y * fy1 + phase) * Math.cos(y * 0.12) +
        0.06 * Math.sin(x * fx2 - y * 0.28)
      pos.setZ(i, bump)
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
  }
  const mesh = new Mesh(geo, mats.mud)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(0, MUD_Y, (MUD_Z0 + MUD_Z1) / 2)
  mesh.castShadow = false
  mesh.receiveShadow = true
  return mesh
}

function buildStones(mats: Materials, rnd: () => number, count: number): InstancedMesh {
  const geo = new IcosahedronGeometry(0.22, 0)
  const mesh = new InstancedMesh(geo, mats.stone, count)
  const o = new Object3D()
  for (let i = 0; i < count; i++) {
    o.position.set(
      -16 + rnd() * 32,
      MUD_Y + 0.06 + rnd() * 0.06,
      MUD_Z0 - rnd() * (MUD_Z1 - MUD_Z0),
    )
    o.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI)
    const s = 0.5 + rnd() * 1.1
    o.scale.set(s, s * (0.7 + rnd() * 0.3), s)
    o.updateMatrix()
    mesh.setMatrixAt(i, o.matrix)
  }
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  return mesh
}

/** A handful of gnarled roots lying on the mud, baked as one static merged mesh. */
function buildRoots(mats: Materials, rnd: () => number, count: number): Mesh {
  const pieces: BufferGeometry[] = []
  for (let i = 0; i < count; i++) {
    const len = 0.6 + rnd() * 1.1
    const geo = new CylinderGeometry(0.01, 0.045, len, 5, 1, true)
    geo.rotateZ(Math.PI / 2)
    geo.translate(len / 2, 0, 0)
    geo.rotateY(rnd() * Math.PI * 2)
    const x = -16 + rnd() * 32
    const z = MUD_Z0 - rnd() * (MUD_Z1 - MUD_Z0)
    geo.translate(x, MUD_Y + 0.02, z)
    pieces.push(geo)
  }
  const merged = mergeGeometries(pieces, false)
  if (!merged) throw new Error('root geometry merge failed')
  const mesh = new Mesh(merged, mats.bark)
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
  const cols = 40
  const o = new Object3D()
  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const z = -10 - col * 0.75 + (rnd() - 0.5) * 0.3
    const x = -9 + row * 1.8 + (rnd() - 0.5) * 0.9
    o.position.set(x, MUD_Y, Math.max(MUD_Z1 + 1, z))
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

/** Long thin additive planes from the surface down, each fading toward its own foot via an
 *  alpha-gradient texture (top bright, bottom transparent) baked once at boot. */
function buildLightShafts(rnd: () => number): Mesh {
  const gradCanvas = document.createElement('canvas')
  gradCanvas.width = 8
  gradCanvas.height = 64
  const gctx = gradCanvas.getContext('2d')
  const alphaTex = new CanvasTexture(gradCanvas)
  if (gctx) {
    const g = gctx.createLinearGradient(0, 0, 0, 64)
    g.addColorStop(0, 'rgba(255,255,255,0.9)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    gctx.fillStyle = g
    gctx.fillRect(0, 0, 8, 64)
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
    opacity: 0.08,
    alphaMap: alphaTex,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  })
  const mesh = new Mesh(merged, mat)
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
    positions[i * 3] = -18 + rnd() * 36
    positions[i * 3 + 1] = MUD_Y + 0.1 + rnd() * (COLUMN - 0.2)
    positions[i * 3 + 2] = MUD_Z0 - rnd() * (MUD_Z1 - MUD_Z0)
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
    positions[i * 3] = -16 + rnd() * 32
    positions[i * 3 + 1] = MUD_Y + rnd() * COLUMN
    positions[i * 3 + 2] = MUD_Z0 - rnd() * (MUD_Z1 - MUD_Z0)
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
      float localY = transformed.y - (${MUD_Y.toFixed(2)});
      float wrapped = mod(localY + uTime * speed, ${COLUMN.toFixed(3)});
      transformed.y = (${MUD_Y.toFixed(2)}) + wrapped;
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

  const mud = buildMudBed(mats, rnd)
  const stones = buildStones(mats, rnd, Math.max(4, Math.round(10 * scale)))
  const roots = buildRoots(mats, rnd, Math.max(2, Math.round(6 * scale)))
  const stems = buildStems(rnd, Math.max(80, Math.round(600 * scale)))
  const shafts = buildLightShafts(rnd)
  const caustics = buildCaustics()
  const sediment = buildSediment(rnd, Math.max(300, Math.round(2000 * scale)))
  const bubbles = buildBubbles(rnd, Math.max(60, Math.round(300 * scale)))

  group.add(mud, stones, roots, stems.mesh, shafts, sediment.points, bubbles.points)
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
