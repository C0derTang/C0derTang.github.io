import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three'
import type { Quality } from '../../config/quality'
import { mulberry32 } from '../../util/math'
import type { Materials } from '../materials'
import { WATER_Y, type SceneState } from '../state'
import type { WorldPart } from './types'
import { createFieldRain } from './field-rain'

/**
 * The flooded paddy: the rain-pocked reflective water surface, the two earth dikes that divide
 * it, and the instanced field of rice between them. Everything here is pure in `state.t` /
 * `state.time`: rain impacts deform the otherwise calm surface at the same points where drops
 * land; rice wind sway is a closed form of time. Both freeze under reduced motion, and neither
 * integrates state on the CPU.
 */

const DIKE_X = [-2.6, 2.6] as const
const DIKE_Z: readonly [number, number] = [-8, -48]
const DIKE_WIDTH = 0.9
const DIKE_HEIGHT = 0.5
const DIKE_TOP_Y = WATER_Y + DIKE_HEIGHT / 2

const RICE_X: readonly [number, number] = [-40, 40]
const RICE_Z: readonly [number, number] = [-9, -50]
const RICE_ROW_SPACING = 0.35
const RICE_BASE_Y = WATER_Y - 0.05
const RICE_CARD_W = 0.14
const RICE_CARD_H = 0.6

const shadowed = (m: Mesh, cast = true, receive = true): Mesh => {
  m.castShadow = cast
  m.receiveShadow = receive
  return m
}

/** Push a candidate x out of both dike footprints (half width + a small margin) so rice never
 * plants inside the raised earth banks. */
function clearDikes(x: number): number {
  // The lane between the dikes stays open water: the camera dives through it.
  if (Math.abs(x) < 3.1) x = (x < 0 ? -1 : 1) * (3.1 + (Math.abs(x) / 3.1) * 0.6)
  for (const cx of DIKE_X) {
    if (Math.abs(x - cx) < 0.5) return x < cx ? cx - 0.5 : cx + 0.5
  }
  return x
}

/** `cards` vertical alpha-card quads crossed around Y, each pivoted at its own base (local
 * y = 0..height) so a non-uniform instance scale.y stretches a plant to its own height. */
function crossCardGeometry(width: number, height: number, cards: number): BufferGeometry {
  const position: number[] = []
  const normal: number[] = []
  const uv: number[] = []
  const index: number[] = []
  for (let c = 0; c < cards; c++) {
    const a = (Math.PI * c) / cards
    const cx = Math.cos(a) * (width / 2)
    const cz = Math.sin(a) * (width / 2)
    const nx = Math.cos(a + Math.PI / 2)
    const nz = Math.sin(a + Math.PI / 2)
    const base = c * 4
    position.push(-cx, 0, -cz, cx, 0, cz, cx, height, cz, -cx, height, -cz)
    for (let i = 0; i < 4; i++) normal.push(nx, 0, nz)
    uv.push(0, 0, 1, 0, 1, 1, 0, 1)
    index.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(position, 3))
  geo.setAttribute('normal', new Float32BufferAttribute(normal, 3))
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  geo.setIndex(index)
  return geo
}

/** Rescale a 1-segment BoxGeometry's default 0..1-per-face UVs to metres, matching a material
 * whose `repeat` is tuned per UV-metre (see materials.ts's `make()`). */
function scaleBoxUv(geo: BoxGeometry, w: number, h: number, d: number): void {
  const uvAttr = geo.attributes.uv
  if (!uvAttr) return
  const faceSize: readonly (readonly [number, number])[] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ]
  for (let f = 0; f < 6; f++) {
    const size = faceSize[f] ?? ([1, 1] as const)
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i
      uvAttr.setXY(idx, uvAttr.getX(idx) * size[0], uvAttr.getY(idx) * size[1])
    }
  }
  uvAttr.needsUpdate = true
}

/** A small tapered-blade tuft baked as colour + alpha: darker at the canvas bottom, lighter at
 * the top, so the texture's default V-flip lands the light tip at local V = 1 (the blade top). */
function makeBladeTexture(w = 128, h = 256, seed = 31, blades = 6): CanvasTexture {
  const rnd = mulberry32(seed)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const tex = new CanvasTexture(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return tex
  const grad = ctx.createLinearGradient(0, h, 0, 0)
  grad.addColorStop(0, '#5c7642')
  grad.addColorStop(0.62, '#7f9a5d')
  grad.addColorStop(1, '#dbe4a4')
  ctx.fillStyle = grad
  // Blade bases spread across nearly the full card width (with some outward lean) so the tuft
  // fills its 0.14 m card instead of leaving bare margins at the card's edges.
  for (let i = 0; i < blades; i++) {
    const u = blades === 1 ? 0.5 : i / (blades - 1)
    const baseX = w * (0.08 + 0.84 * u + (rnd() - 0.5) * 0.1)
    const baseW = w * (0.16 + rnd() * 0.07)
    const lean = (u - 0.5) * w * 0.3
    const bendX = baseX + lean * 0.6 + (rnd() - 0.5) * w * 0.1
    const tipX = baseX + lean + (rnd() - 0.5) * w * 0.14
    const tipY = h * (0.02 + rnd() * 0.08)
    ctx.beginPath()
    ctx.moveTo(baseX - baseW / 2, h)
    ctx.quadraticCurveTo(bendX - baseW * 0.18, h * 0.42, tipX, tipY)
    ctx.quadraticCurveTo(bendX + baseW * 0.18, h * 0.42, baseX + baseW / 2, h)
    ctx.closePath()
    ctx.fill()
  }
  tex.colorSpace = SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** Wind sway patched into the rice material: a closed form of `uTime`, amplitude growing with
 * blade height, gusts travelling along x. Local `transformed` is object space (pre-instance), so
 * the sway rotates and scales correctly with each instance's own matrix. */
function patchRiceSway(mat: MeshStandardMaterial, uniforms: { uTime: { value: number } }): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float phase = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);
          float worldX = instanceMatrix[3].x;
          float heightFrac = clamp(transformed.y / ${RICE_CARD_H.toFixed(3)}, 0.0, 1.0);
          float amp = heightFrac * heightFrac;
          float gust = 0.5 + 0.5 * sin(worldX * 0.12 + uTime * 0.55);
          float sway = sin(uTime * 1.7 + phase * 6.2832) * (0.05 + 0.11 * gust);
          transformed.x += sway * amp;
          transformed.z += sway * amp * 0.35;
        }`,
      )
  }
}

export function createPaddy(mats: Materials, quality: Quality): WorldPart {
  const group = new Group()
  const bladeTex = makeBladeTexture()

  // --- water: calm between the impacts of the rain ------------------------------------------
  const fieldRain = createFieldRain(mats.water, quality)
  group.add(fieldRain.group)
  const water = new Mesh(new PlaneGeometry(90, 44, 24, 12), mats.water)
  water.rotation.x = -Math.PI / 2
  water.position.set(0, WATER_Y, -30)
  water.castShadow = false
  water.receiveShadow = true
  group.add(water)

  // --- dikes: raised earth banks dividing the field, plus grass tufts along both edges ---------
  const dikeLen = DIKE_Z[0] - DIKE_Z[1]
  for (const cx of DIKE_X) {
    const geo = new BoxGeometry(DIKE_WIDTH, DIKE_HEIGHT, dikeLen)
    scaleBoxUv(geo, DIKE_WIDTH, DIKE_HEIGHT, dikeLen)
    const dike = shadowed(new Mesh(geo, mats.mud))
    dike.position.set(cx, WATER_Y, (DIKE_Z[0] + DIKE_Z[1]) / 2)
    group.add(dike)
  }

  const tuftMat = new MeshStandardMaterial({
    map: bladeTex,
    color: new Color('#8fa06c'),
    roughness: 0.85,
    side: DoubleSide,
    alphaTest: 0.5,
  })
  const tuftSpacing = quality.tier === 'low' ? 0.8 : 0.4
  const perEdge = Math.max(1, Math.round(dikeLen / tuftSpacing))
  const tuftCount = perEdge * 2 * DIKE_X.length
  const tufts = new InstancedMesh(crossCardGeometry(0.08, 0.22, 3), tuftMat, tuftCount)
  tufts.castShadow = false
  tufts.receiveShadow = true
  {
    const rnd = mulberry32(67)
    const o = new Object3D()
    let i = 0
    for (const cx of DIKE_X) {
      for (const edge of [-1, 1]) {
        for (let k = 0; k < perEdge; k++) {
          const z = DIKE_Z[0] - (k + 0.5) * (dikeLen / perEdge) + (rnd() - 0.5) * 0.15
          const x = cx + edge * (DIKE_WIDTH / 2 + 0.02 + rnd() * 0.1)
          o.position.set(x, DIKE_TOP_Y, z)
          o.rotation.set(0, rnd() * Math.PI * 2, 0)
          const s = 0.8 + rnd() * 0.5
          o.scale.set(s, s, s)
          o.updateMatrix()
          tufts.setMatrixAt(i, o.matrix)
          i++
        }
      }
    }
  }
  group.add(tufts)

  // --- rice: one instanced crossed-card field, swaying as a closed form of time ----------------
  const riceUniforms = { uTime: { value: 0 } }
  const riceMat = new MeshStandardMaterial({
    map: bladeTex,
    color: new Color('#ffffff'),
    roughness: 0.85,
    side: DoubleSide,
    alphaTest: 0.5,
  })
  patchRiceSway(riceMat, riceUniforms)
  const count = quality.riceCount
  const rice = new InstancedMesh(crossCardGeometry(RICE_CARD_W, RICE_CARD_H, 3), riceMat, count)
  rice.castShadow = false
  rice.receiveShadow = false
  // Best-effort hint only: three's transmission pass currently shares the main camera's layer
  // mask, so this does not fully exclude rice from the water's refraction (see paddy task notes).
  // `quality.refraction` (off on the low tier, in materials.ts) is the real cost control.
  rice.layers.enable(1)
  {
    const rnd = mulberry32(61)
    const rows = Math.max(1, Math.round((RICE_Z[0] - RICE_Z[1]) / RICE_ROW_SPACING))
    const perRow = Math.max(1, Math.ceil(count / rows))
    const xStep = (RICE_X[1] - RICE_X[0]) / perRow
    const o = new Object3D()
    for (let i = 0; i < count; i++) {
      const row = i % rows
      const col = Math.floor(i / rows)
      const x = clearDikes(RICE_X[0] + (col + 0.5) * xStep + (rnd() - 0.5) * xStep * 0.6)
      const z = RICE_Z[0] - (row + 0.5) * RICE_ROW_SPACING + (rnd() - 0.5) * RICE_ROW_SPACING * 0.5
      const height = 0.5 + rnd() * 0.2
      const widthJitter = 0.85 + rnd() * 0.3
      o.position.set(x, RICE_BASE_Y, z)
      o.rotation.set(0, rnd() * Math.PI * 2, 0)
      o.scale.set(widthJitter, height / RICE_CARD_H, widthJitter)
      o.updateMatrix()
      rice.setMatrixAt(i, o.matrix)
    }
  }
  group.add(rice)

  return {
    group,
    update(state: SceneState) {
      const t = state.reduced ? 0 : state.time / 1000
      riceUniforms.uTime.value = t
      fieldRain.update?.(state)
    },
  }
}
