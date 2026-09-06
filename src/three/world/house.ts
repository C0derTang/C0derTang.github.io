import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Quality } from '../../config/quality'
import { mulberry32 } from '../../util/math'
import type { Materials } from '../materials'
import type { SceneState } from '../state'
import type { WorldPart } from './types'

/**
 * The farmhouse shell (walls with their inner faces, floor slab, ceiling, hip thatched roof,
 * doorway, two lit windows, engawa deck with posts, a lean-to, the noren) plus its street
 * furniture (bicycle, stone lantern, telephone pole and wires), and the yard immediately in
 * front of it (gravel path, puddles, hydrangea bushes). The room's furnishings are another
 * module's job (interior.ts); this file only builds the box they sit inside.
 *
 * Everything static is authored as one-off primitive geometries, transformed into place with
 * `place()`, and merged per material with `mergeMesh()` so the whole assembly costs a small,
 * fixed number of draw calls regardless of how many primitives compose it. The only per-frame
 * writes are the two sliding shoji panels (`state.doors`) and a handful of `uTime` uniforms for
 * the noren sway and the hydrangea wind (closed-form vertex offsets, never CPU-integrated).
 */

// ---------- small geometry helpers ----------

/** Bake a translate+rotate into a freshly-built geometry's vertices (mutates and returns it). */
function place(
  geo: BufferGeometry,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): BufferGeometry {
  const o = new Object3D()
  o.position.set(x, y, z)
  o.rotation.set(rx, ry, rz)
  o.updateMatrix()
  geo.applyMatrix4(o.matrix)
  return geo
}

/**
 * Box/Plane/Cylinder UVs are 0..1 per face; rescale to metres so a material's `repeat` (texture
 * repeats per metre) tiles at a consistent texel density regardless of this mesh's size.
 */
function scaleUV(geo: BufferGeometry, su: number, sv: number): BufferGeometry {
  const uv = geo.attributes.uv
  if (uv) {
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
    uv.needsUpdate = true
  }
  return geo
}

/** One straight tube from a to b (bike frame tubes, wire-free hardware bits). */
function segment(a: Vector3, b: Vector3, radius: number, radial = 6): BufferGeometry {
  const dir = new Vector3().subVectors(b, a)
  const len = Math.max(dir.length(), 0.001)
  const geo = new CylinderGeometry(radius, radius, len, radial)
  const mid = new Vector3().addVectors(a, b).multiplyScalar(0.5)
  const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize())
  geo.applyMatrix4(new Matrix4().compose(mid, quat, new Vector3(1, 1, 1)))
  return geo
}

/** A flat convex polygon (fan-triangulated) with planar metre UVs; used for the roof slopes. */
function flatPolygon(points: Vector3[]): BufferGeometry {
  const geo = new BufferGeometry()
  const p0 = points[0]
  const p1 = points[1]
  const p2 = points[2]
  if (!p0 || !p1 || !p2) return geo
  const u = new Vector3().subVectors(p1, p0).normalize()
  const e1 = new Vector3().subVectors(p1, p0)
  const e2 = new Vector3().subVectors(p2, p1)
  const normal = new Vector3().crossVectors(e1, e2).normalize()
  const v = new Vector3().crossVectors(normal, u).normalize()
  const positions: number[] = []
  const uvs: number[] = []
  const rel = new Vector3()
  for (const p of points) {
    positions.push(p.x, p.y, p.z)
    rel.subVectors(p, p0)
    uvs.push(rel.dot(u), rel.dot(v))
  }
  const indices: number[] = []
  for (let i = 1; i < points.length - 1; i++) indices.push(0, i, i + 1)
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/** Merge a batch of pre-placed geometries sharing one material into a single draw call. */
function mergeMesh(
  mat: MeshStandardMaterial,
  geoms: BufferGeometry[],
  cast = true,
  receive = true,
): Mesh {
  const merged = geoms.length > 0 ? mergeGeometries(geoms, false) : null
  const mesh = new Mesh(merged ?? new BufferGeometry(), mat)
  mesh.castShadow = cast
  mesh.receiveShadow = receive
  return mesh
}

/** Inject a closed-form-of-uTime sway into `transformed` (before any instance transform). */
function addSway(
  mat: MeshStandardMaterial,
  uniforms: { uTime: { value: number } },
  glsl: string,
): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${glsl}`)
  }
  mat.needsUpdate = true
}

// ---------- house dimensions (metres; see brief-3d.md's World section) ----------

const HALF_W = 5.5
const WALL_THK = 0.25
const PLINTH_TOP = 0.35
const EAVE_Y = 3.2
const RIDGE_Y = 6.0
const DEPTH = 7
const DOOR_HALF_W = 1.2
const DOOR_TOP = 2.55

export function createHouse(mats: Materials, quality: Quality): WorldPart {
  const group = new Group()
  const lowTier = quality.tier === 'low'

  const hardware = new MeshStandardMaterial({
    color: new Color('#242424'),
    roughness: 0.55,
    metalness: 0.35,
  })

  // ---------------- plaster shell (one draw call: every wall panel + both headers) ----------------
  const plasterGeoms: BufferGeometry[] = []
  const wallH = EAVE_Y - PLINTH_TOP
  const wallCy = PLINTH_TOP + wallH / 2
  const frontSideW = HALF_W - DOOR_HALF_W
  const wall = (w: number, h: number, x: number, y: number, z: number, ry = 0): void => {
    plasterGeoms.push(place(scaleUV(new BoxGeometry(w, h, WALL_THK), w, h), x, y, z, 0, ry, 0))
  }
  wall(frontSideW, wallH, -(HALF_W + DOOR_HALF_W) / 2, wallCy, 0)
  wall(frontSideW, wallH, (HALF_W + DOOR_HALF_W) / 2, wallCy, 0)
  wall(DOOR_HALF_W * 2, EAVE_Y - DOOR_TOP, 0, DOOR_TOP + (EAVE_Y - DOOR_TOP) / 2, 0)
  wall(DEPTH, wallH, -HALF_W, wallCy, -DEPTH / 2, Math.PI / 2)
  wall(DEPTH, wallH, HALF_W, wallCy, -DEPTH / 2, Math.PI / 2)
  const backSideW = HALF_W - 1.05
  wall(backSideW, wallH, -(HALF_W + 1.05) / 2, wallCy, -DEPTH)
  wall(backSideW, wallH, (HALF_W + 1.05) / 2, wallCy, -DEPTH)
  wall(2.1, EAVE_Y - DOOR_TOP, 0, DOOR_TOP + (EAVE_Y - DOOR_TOP) / 2, -DEPTH)
  const plaster = mergeMesh(mats.plaster, plasterGeoms)

  // ---------------- dark wood trim (one draw call: wainscot, door frame, lattice, ridge, ceiling) --
  const darkGeoms: BufferGeometry[] = []
  const wainscotH = 1.1 - PLINTH_TOP
  const wainscotCy = PLINTH_TOP + wainscotH / 2
  darkGeoms.push(
    place(
      scaleUV(new BoxGeometry(frontSideW, wainscotH, 0.05), frontSideW, wainscotH),
      -(HALF_W + DOOR_HALF_W) / 2,
      wainscotCy,
      WALL_THK / 2 + 0.03,
    ),
    place(
      scaleUV(new BoxGeometry(frontSideW, wainscotH, 0.05), frontSideW, wainscotH),
      (HALF_W + DOOR_HALF_W) / 2,
      wainscotCy,
      WALL_THK / 2 + 0.03,
    ),
    place(
      scaleUV(new BoxGeometry(0.05, wainscotH, DEPTH), DEPTH, wainscotH),
      -HALF_W - 0.03,
      wainscotCy,
      -DEPTH / 2,
      0,
      Math.PI / 2,
      0,
    ),
    place(
      scaleUV(new BoxGeometry(0.05, wainscotH, DEPTH), DEPTH, wainscotH),
      HALF_W + 0.03,
      wainscotCy,
      -DEPTH / 2,
      0,
      Math.PI / 2,
      0,
    ),
  )
  // doorway frame: two posts and a lintel, proud of the wall face
  const doorFrameZ = WALL_THK / 2 + 0.04
  const doorCy = PLINTH_TOP + (DOOR_TOP - PLINTH_TOP) / 2
  darkGeoms.push(
    place(
      new BoxGeometry(0.12, DOOR_TOP - PLINTH_TOP, 0.16),
      -DOOR_HALF_W - 0.01,
      doorCy,
      doorFrameZ,
    ),
    place(
      new BoxGeometry(0.12, DOOR_TOP - PLINTH_TOP, 0.16),
      DOOR_HALF_W + 0.01,
      doorCy,
      doorFrameZ,
    ),
    place(new BoxGeometry(DOOR_HALF_W * 2 + 0.12, 0.18, 0.16), 0, DOOR_TOP + 0.09, doorFrameZ),
  )
  // two windows: dark lattice bars over each opening
  for (const cx of [-3.4, 3.6]) {
    const wz = 0.15
    darkGeoms.push(
      place(new BoxGeometry(1.2, 0.05, 0.02), cx, 1.8 + 0.475, wz),
      place(new BoxGeometry(1.2, 0.05, 0.02), cx, 1.8 - 0.475, wz),
      place(new BoxGeometry(0.05, 1.0, 0.02), cx - 0.575, 1.8, wz),
      place(new BoxGeometry(0.05, 1.0, 0.02), cx + 0.575, 1.8, wz),
      place(new BoxGeometry(0.04, 1.0, 0.02), cx - 0.2, 1.8, wz),
      place(new BoxGeometry(0.04, 1.0, 0.02), cx + 0.2, 1.8, wz),
      place(new BoxGeometry(1.2, 0.04, 0.02), cx, 1.8, wz),
    )
  }
  // ceiling slab (underside of the room, top of the eave line)
  darkGeoms.push(
    place(
      scaleUV(new BoxGeometry(HALF_W * 2, 0.1, DEPTH), HALF_W * 2, DEPTH),
      0,
      EAVE_Y + 0.05,
      -DEPTH / 2,
    ),
  )

  // ---------------- hip thatched roof (one draw call: 4 slopes + eave band) ----------------
  const overhang = 1.2
  const roofHalfW = HALF_W + overhang
  const frontZ = overhang
  const backZ = -DEPTH - overhang
  const ridgeHalf = 2.0
  const ridgeZ = -DEPTH / 2
  const A = new Vector3(-roofHalfW, EAVE_Y, frontZ)
  const B = new Vector3(roofHalfW, EAVE_Y, frontZ)
  const C = new Vector3(roofHalfW, EAVE_Y, backZ)
  const D = new Vector3(-roofHalfW, EAVE_Y, backZ)
  const R1 = new Vector3(-ridgeHalf, RIDGE_Y, ridgeZ)
  const R2 = new Vector3(ridgeHalf, RIDGE_Y, ridgeZ)
  const roofGeoms: BufferGeometry[] = [
    flatPolygon([A, B, R2, R1]),
    flatPolygon([C, D, R1, R2]),
    flatPolygon([A, R1, D]),
    flatPolygon([B, C, R2]),
  ]
  const eaveBandH = 0.35
  const eaveBandCy = EAVE_Y - eaveBandH / 2
  const spanZ = frontZ - backZ
  roofGeoms.push(
    place(
      scaleUV(new BoxGeometry(roofHalfW * 2, eaveBandH, 0.06), roofHalfW * 2, eaveBandH),
      0,
      eaveBandCy,
      frontZ,
    ),
    place(
      scaleUV(new BoxGeometry(roofHalfW * 2, eaveBandH, 0.06), roofHalfW * 2, eaveBandH),
      0,
      eaveBandCy,
      backZ,
    ),
    place(
      scaleUV(new BoxGeometry(0.06, eaveBandH, spanZ), spanZ, eaveBandH),
      -roofHalfW,
      eaveBandCy,
      (frontZ + backZ) / 2,
    ),
    place(
      scaleUV(new BoxGeometry(0.06, eaveBandH, spanZ), spanZ, eaveBandH),
      roofHalfW,
      eaveBandCy,
      (frontZ + backZ) / 2,
    ),
  )
  const roof = mergeMesh(mats.thatch, roofGeoms)

  // ridge cap and the right-hip gable vent join the dark trim group
  darkGeoms.push(place(new BoxGeometry(ridgeHalf * 2 + 0.4, 0.22, 0.32), 0, RIDGE_Y + 0.11, ridgeZ))
  {
    const centroid = new Vector3()
      .add(B)
      .add(C)
      .add(R2)
      .multiplyScalar(1 / 3)
    const e1 = new Vector3().subVectors(C, B)
    const e2 = new Vector3().subVectors(R2, C)
    const hipNormal = new Vector3().crossVectors(e1, e2).normalize()
    const vent = new Object3D()
    vent.position.copy(centroid).addScaledVector(hipNormal, 0.05)
    vent.lookAt(vent.position.clone().add(hipNormal))
    vent.updateMatrix()
    const ventGeo = new BoxGeometry(0.4, 0.32, 0.05)
    ventGeo.applyMatrix4(vent.matrix)
    darkGeoms.push(ventGeo)
  }
  const darkTrim = mergeMesh(mats.woodDark, darkGeoms)

  // ---------------- windows (the tatami floor and the shoji panels belong to interior.ts) ----------------
  const paperGeoms: BufferGeometry[] = []
  for (const cx of [-3.4, 3.6]) paperGeoms.push(place(new PlaneGeometry(1.1, 0.9), cx, 1.8, 0.135))
  const windowPaper = mergeMesh(mats.paper, paperGeoms, false, false)

  // ---------------- engawa deck, posts, lean-to, wicker basket (one wood draw call) ----------------
  const woodGeoms: BufferGeometry[] = [
    place(scaleUV(new BoxGeometry(HALF_W * 2, 0.12, 1.4), HALF_W * 2, 1.4), 0, 0.41, 0.7),
  ]
  for (const x of [-5.3, -1.4, 1.4, 5.3])
    woodGeoms.push(place(new CylinderGeometry(0.09, 0.09, wallH, lowTier ? 6 : 10), x, wallCy, 0.6))
  // lean-to at the right side (x 5.5..6.6): a mono-pitch roof, two posts, slatted siding
  const leanInnerX = HALF_W
  const leanOuterX = HALF_W + 1.1
  const leanInnerY = 2.9
  const leanOuterY = 2.3
  const leanZ0 = 0.15
  const leanZ1 = 3.25
  const leanDx = leanOuterX - leanInnerX
  const leanDy = leanOuterY - leanInnerY
  woodGeoms.push(
    place(
      scaleUV(
        new BoxGeometry(Math.hypot(leanDx, leanDy), 0.06, leanZ1 - leanZ0),
        Math.hypot(leanDx, leanDy),
        leanZ1 - leanZ0,
      ),
      (leanInnerX + leanOuterX) / 2,
      (leanInnerY + leanOuterY) / 2,
      (leanZ0 + leanZ1) / 2,
      0,
      0,
      Math.atan2(leanDy, leanDx),
    ),
  )
  for (const z of [leanZ0 + 0.35, leanZ1 - 0.35])
    woodGeoms.push(
      place(new CylinderGeometry(0.05, 0.05, leanOuterY, 8), leanOuterX - 0.05, leanOuterY / 2, z),
    )
  for (let i = 0; i < 5; i++) {
    const z = leanZ0 + ((leanZ1 - leanZ0) * (i + 0.5)) / 5
    woodGeoms.push(place(new BoxGeometry(0.05, 2.3, 0.06), leanOuterX - 0.02, 1.15, z))
  }

  // bicycle (local bike space: +z front/back, +y up, x thin; final lean+placement applied after merge)
  const bikeDarkLocal: BufferGeometry[] = []
  const bikeBasketLocal: BufferGeometry[] = []
  const wheelSeg = lowTier ? 16 : 24
  for (const wz of [-0.55, 0.55]) {
    bikeDarkLocal.push(
      place(new TorusGeometry(0.33, 0.018, 8, wheelSeg), 0, 0.33, wz, 0, Math.PI / 2, 0),
    )
    const spokes = 12
    for (let i = 0; i < spokes; i++) {
      const phi = (i / spokes) * Math.PI * 2
      const len = 0.3
      const g = new CylinderGeometry(0.008, 0.008, len, 4)
      g.rotateX(phi)
      bikeDarkLocal.push(
        place(g, 0, 0.33 + (len / 2) * Math.cos(phi), wz + (len / 2) * Math.sin(phi)),
      )
    }
  }
  const bottomBracket = new Vector3(0, 0.3, -0.05)
  const seatTop = new Vector3(0, 0.92, -0.2)
  const headTop = new Vector3(0, 0.85, 0.42)
  const rearAxle = new Vector3(0, 0.33, -0.55)
  const frontAxle = new Vector3(0, 0.33, 0.55)
  const handlebarC = new Vector3(0, 0.95, 0.46)
  bikeDarkLocal.push(
    segment(bottomBracket, seatTop, 0.016),
    segment(seatTop, headTop, 0.016),
    segment(bottomBracket, headTop, 0.016),
    segment(bottomBracket, rearAxle, 0.016),
    segment(seatTop, rearAxle, 0.014),
    segment(headTop, frontAxle, 0.016),
    segment(headTop, handlebarC, 0.014),
    segment(
      new Vector3(-0.16, handlebarC.y, handlebarC.z),
      new Vector3(0.16, handlebarC.y, handlebarC.z),
      0.012,
    ),
    place(new BoxGeometry(0.1, 0.05, 0.26), 0, 0.95, -0.22),
  )
  bikeBasketLocal.push(
    place(
      new LatheGeometry(
        [
          new Vector2(0.02, 0),
          new Vector2(0.16, 0.02),
          new Vector2(0.19, 0.1),
          new Vector2(0.21, 0.18),
          new Vector2(0.19, 0.2),
        ],
        lowTier ? 6 : 10,
      ),
      0,
      0.8,
      0.62,
    ),
  )
  const bikeLean = -0.14
  const bikeDarkMerged = mergeGeometries(bikeDarkLocal, false) ?? new BufferGeometry()
  place(bikeDarkMerged, -3.2, 0.35, 0.6, bikeLean, 0, 0)
  const bikeBasketMerged = mergeGeometries(bikeBasketLocal, false) ?? new BufferGeometry()
  place(bikeBasketMerged, -3.2, 0.35, 0.6, bikeLean, 0, 0)
  woodGeoms.push(bikeBasketMerged)
  const wood = mergeMesh(mats.wood, woodGeoms)

  // ---------------- hardware: bicycle dark parts, stone lantern, pole + wires ----------------
  const bike = mergeMesh(hardware, [bikeDarkMerged])

  const stoneGeoms: BufferGeometry[] = [
    place(new BoxGeometry(HALF_W * 2 + 1, 0.35, DEPTH + 1.6), 0, 0.175, -DEPTH / 2 + 0.3),
    place(
      new LatheGeometry(
        [
          new Vector2(0.02, 0),
          new Vector2(0.24, 0.04),
          new Vector2(0.15, 0.12),
          new Vector2(0.15, 0.55),
          new Vector2(0.32, 0.6),
          new Vector2(0.32, 0.92),
          new Vector2(0.2, 0.98),
        ],
        lowTier ? 8 : 12,
      ),
      5,
      0,
      4,
    ),
    place(new BoxGeometry(0.55, 0.14, 0.55), 5, 1.05, 4),
  ]
  const stone = mergeMesh(mats.stone, stoneGeoms)

  const poleGeoms: BufferGeometry[] = [
    place(new CylinderGeometry(0.08, 0.15, 8, lowTier ? 6 : 8), 7.5, 4, 3),
    place(new BoxGeometry(1.6, 0.1, 0.1), 7.5, 7.6, 3),
  ]
  for (const dx of [-0.6, 0, 0.6])
    poleGeoms.push(place(new CylinderGeometry(0.04, 0.05, 0.15, 8), 7.5 + dx, 7.72, 3))
  for (const dy of [0, -0.25, -0.5]) {
    const curve = new CatmullRomCurve3([
      new Vector3(-60, 7.2 + dy, 3),
      new Vector3(-26, 6.4 + dy, 3),
      new Vector3(7.5, 7.6 + dy, 3),
      new Vector3(40, 6.5 + dy, 3),
      new Vector3(70, 7.3 + dy, 3),
    ])
    poleGeoms.push(new TubeGeometry(curve, 48, 0.012, 4, false))
  }
  const pole = mergeMesh(hardware, poleGeoms)

  // ---------------- noren: two cloth panels with a gentle vertex-shader sway ----------------
  const norenMat = mats.cloth.clone()
  const norenUniforms = { uTime: { value: 0 } }
  addSway(
    norenMat,
    norenUniforms,
    `float nTop = 2.55; float nPin = 1.0 - smoothstep(nTop - 0.12, nTop, position.y);
     float nSway = sin(uTime * 1.3 + position.y * 3.0 + position.x * 2.0) * 0.045 * nPin;
     transformed.x += nSway;
     transformed.z += cos(uTime * 1.05 + position.y * 2.2) * 0.02 * nPin;`,
  )
  const norenGeoms = [
    place(new PlaneGeometry(1.1, 0.85), -0.6, 2.125, 0.06),
    place(new PlaneGeometry(1.1, 0.85), 0.6, 2.125, 0.06),
  ]
  const noren = mergeMesh(norenMat, norenGeoms, false, false)

  group.add(plaster, darkTrim, roof, windowPaper, wood, bike, stone, pole, noren)

  return {
    group,
    update(state: SceneState) {
      norenUniforms.uTime.value = state.reduced ? 0 : state.time / 1000
    },
  }
}

// ---------- yard: gravel path, puddles, hydrangeas ----------

/** A small procedural leaf silhouette (alpha channel) for the hydrangea leaf cards. */
function makeLeafAlpha(size = 64): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const tex = new CanvasTexture(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return tex
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(size * 0.5, size * 0.04)
  ctx.quadraticCurveTo(size * 0.96, size * 0.5, size * 0.5, size * 0.96)
  ctx.quadraticCurveTo(size * 0.04, size * 0.5, size * 0.5, size * 0.04)
  ctx.fill()
  tex.needsUpdate = true
  return tex
}

const BUSH_SPECS = [
  { x: -3.5, z: 2, color: '#8e8cc9' },
  { x: 3.5, z: 2, color: '#b48fc4' },
  { x: -2, z: 12, color: '#6f95cc' },
  { x: 2, z: 12, color: '#8e8cc9' },
] as const

export function createYard(mats: Materials, quality: Quality): WorldPart {
  const group = new Group()
  const lowTier = quality.tier === 'low'

  // gravel path: darker, wetter than the default tint
  const path = new Mesh(
    scaleUV(new PlaneGeometry(3, 25), 3, 25),
    mats.make('gravel', { repeat: 0.8, roughness: 0.45, color: '#7d8179' }),
  )
  path.rotation.x = -Math.PI / 2
  path.position.set(0, 0.01, 11.5)
  path.receiveShadow = true

  // a wet, darker band of path right under the eave overhang
  const wetBand = new Mesh(
    scaleUV(new PlaneGeometry(3, 1.5), 3, 1.5),
    mats.make('gravel', { repeat: 0.8, roughness: 0.2, color: '#585c56' }),
  )
  wetBand.rotation.x = -Math.PI / 2
  wetBand.position.set(0, 0.012, 0.55)
  wetBand.receiveShadow = true

  // puddles: thin discs of the shallow-water material
  const puddleGeoms = [0.4, -0.6, 0.2].map((x, i) => {
    const z = [8, 14, 19][i] ?? 0
    const r = [0.9, 1.2, 0.7][i] ?? 0.8
    return place(new CylinderGeometry(r, r, 0.02, 24), x, 0.015, z)
  })
  const puddles = mergeMesh(mats.puddle, puddleGeoms, false, false)

  // hydrangeas: florets + leaves + stems for all four bushes, each as one instanced draw call
  const floretsPerBush = lowTier ? 60 : 120
  const leavesPerBush = lowTier ? 30 : 60
  const stemsPerBush = 4

  const floretMatrices: Matrix4[] = []
  const floretColors: Color[] = []
  const leafMatrices: Matrix4[] = []
  const stemMatrices: Matrix4[] = []
  const dummy = new Object3D()

  BUSH_SPECS.forEach((spec, b) => {
    const rnd = mulberry32(401 + b * 97)
    const headCount = 6 + Math.floor(rnd() * 4)
    const heads: { x: number; y: number; z: number; r: number }[] = []
    for (let h = 0; h < headCount; h++) {
      const ang = rnd() * Math.PI * 2
      const dist = rnd() * 0.32
      heads.push({
        x: Math.cos(ang) * dist,
        z: Math.sin(ang) * dist,
        y: 0.45 + rnd() * 0.5,
        r: 0.18 + rnd() * 0.1,
      })
    }
    const floretColor = new Color(spec.color)
    for (let i = 0; i < floretsPerBush; i++) {
      const head = heads[i % heads.length]
      if (!head) continue
      const theta = rnd() * Math.PI * 2
      const phi = Math.acos(2 * rnd() - 1)
      const rr = head.r * (0.75 + rnd() * 0.3)
      dummy.position.set(
        spec.x + head.x + Math.sin(phi) * Math.cos(theta) * rr,
        head.y + Math.cos(phi) * rr * 0.85,
        spec.z + head.z + Math.sin(phi) * Math.sin(theta) * rr,
      )
      dummy.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI)
      const s = 0.75 + rnd() * 0.5
      dummy.scale.set(s, s, s)
      dummy.updateMatrix()
      floretMatrices.push(dummy.matrix.clone())
      floretColors.push(floretColor)
    }
    for (let i = 0; i < leavesPerBush; i++) {
      const ang = rnd() * Math.PI * 2
      const dist = rnd() * 0.42
      dummy.position.set(
        spec.x + Math.cos(ang) * dist,
        0.12 + rnd() * 0.75,
        spec.z + Math.sin(ang) * dist,
      )
      dummy.rotation.set((rnd() - 0.5) * 1.1, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.6)
      const s = 0.8 + rnd() * 0.5
      dummy.scale.set(s, s, s)
      dummy.updateMatrix()
      leafMatrices.push(dummy.matrix.clone())
    }
    for (let i = 0; i < stemsPerBush; i++) {
      const ang = rnd() * Math.PI * 2
      const dist = rnd() * 0.15
      const h = 0.35 + rnd() * 0.35
      dummy.position.set(spec.x + Math.cos(ang) * dist, h / 2, spec.z + Math.sin(ang) * dist)
      dummy.rotation.set((rnd() - 0.5) * 0.2, 0, (rnd() - 0.5) * 0.2)
      dummy.scale.set(1, h / 0.5, 1)
      dummy.updateMatrix()
      stemMatrices.push(dummy.matrix.clone())
    }
  })

  const floretUniforms = { uTime: { value: 0 } }
  const floretMat = new MeshStandardMaterial({ color: new Color('#ffffff'), roughness: 0.8 })
  addSway(
    floretMat,
    floretUniforms,
    `float fSeed = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);
     float fSway = sin(uTime * 1.7 + fSeed * 6.2831853) * 0.02;
     transformed.x += fSway;
     transformed.z += fSway * 0.6;`,
  )
  const florets = new InstancedMesh(
    new IcosahedronGeometry(0.06, 0),
    floretMat,
    floretMatrices.length,
  )
  florets.castShadow = false
  florets.receiveShadow = true
  floretMatrices.forEach((mm, i) => {
    florets.setMatrixAt(i, mm)
    const c = floretColors[i]
    if (c) florets.setColorAt(i, c)
  })
  florets.instanceMatrix.needsUpdate = true
  if (florets.instanceColor) florets.instanceColor.needsUpdate = true

  const leafUniforms = { uTime: { value: 0 } }
  const leafMat = mats.make('moss', { repeat: 4, color: '#3c5a38', roughness: 0.85 })
  leafMat.alphaMap = makeLeafAlpha()
  leafMat.alphaTest = 0.5
  leafMat.side = DoubleSide
  addSway(
    leafMat,
    leafUniforms,
    `float lSeed = fract(sin(float(gl_InstanceID) * 78.233) * 12543.231);
     float lSway = sin(uTime * 1.4 + lSeed * 6.2831853) * 0.025;
     transformed.x += lSway;
     transformed.y += lSway * 0.3;`,
  )
  const leaves = new InstancedMesh(new PlaneGeometry(0.18, 0.14), leafMat, leafMatrices.length)
  leaves.castShadow = false
  leaves.receiveShadow = true
  leafMatrices.forEach((mm, i) => leaves.setMatrixAt(i, mm))
  leaves.instanceMatrix.needsUpdate = true

  const stemMat = mats.make('bark', { repeat: 2, color: '#4a5c3a', roughness: 0.9 })
  const stems = new InstancedMesh(
    new CylinderGeometry(0.02, 0.03, 0.5, 6),
    stemMat,
    stemMatrices.length,
  )
  stems.castShadow = false
  stems.receiveShadow = true
  stemMatrices.forEach((mm, i) => stems.setMatrixAt(i, mm))
  stems.instanceMatrix.needsUpdate = true

  group.add(path, wetBand, puddles, florets, leaves, stems)

  return {
    group,
    update(state: SceneState) {
      const t = state.reduced ? 0 : state.time / 1000
      floretUniforms.uTime.value = t
      leafUniforms.uTime.value = t
    },
  }
}
