import {
  BackSide,
  BoxGeometry,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Quality } from '../../config/quality'
import { clamp } from '../../util/math'
import type { Materials } from '../materials'
import type { SceneState } from '../state'
import type { WorldPart } from './types'

/**
 * The room interior: floor, ceiling, the back shoji wall (with the sliding panels the doors
 * beat animates), the kitchen doma on +x, the front wall dressing around the doorway, the
 * window wall on -x, posts/rail, the irori hearth, the hanging kettle and the paper lamp.
 *
 * Static geometry is baked (world-space `applyMatrix4`) into a handful of per-material
 * `BufferGeometryUtils.mergeGeometries` buckets so the whole room costs a small, fixed number
 * of draw calls regardless of prop count; only the pieces that move (the two sliding panels,
 * the swinging kettle, the flickering lamp shade) get their own Mesh/material.
 */

// Room bounds (see brief): floor top y 0.41, ceiling y 3.2, x -5.25..5.25, z -0.15 (front) to
// -6.85 (back shoji wall). The kitchen doma steps down 0.2 m for x >= 3.6.
const ROOM_X0 = -5.25
const ROOM_X1 = 5.25
const ROOM_ZN = -0.15
const ROOM_ZF = -6.85
const FLOOR_Y = 0.41
const CEIL_Y = 3.2
const DOMA_X0 = 3.6
const DOMA_Y = FLOOR_Y - 0.2

const dummy = new Object3D()

/** Compose a world matrix from TRS without touching any shared scene node. */
function xform(
  x: number,
  y: number,
  z: number,
  ry = 0,
  rx = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
): Matrix4 {
  dummy.position.set(x, y, z)
  dummy.rotation.set(rx, ry, rz)
  dummy.scale.set(sx, sy, sz)
  dummy.updateMatrix()
  return dummy.matrix.clone()
}

/**
 * Rescale a BoxGeometry's top/bottom face UVs from the default 0..1 to 0..w / 0..d (metres),
 * so a shared PBR material's `repeat` (per metre of UV) tiles the same regardless of the box's
 * footprint (BoxGeometry vertices 8-15 are the +y/-y faces, u <- local x, v <- local z).
 */
function metreUV(geo: BoxGeometry, w: number, d: number): void {
  const uv = geo.attributes.uv
  const pos = geo.attributes.position
  if (!uv || !pos) return
  for (let i = 8; i <= 15; i++) {
    uv.setXY(i, pos.getX(i) + w / 2, pos.getZ(i) + d / 2)
  }
  uv.needsUpdate = true
}

interface Bucket {
  material: MeshStandardMaterial
  cast: boolean
  receive: boolean
  parts: BufferGeometry[]
}

/** Accumulates static (non-animated) geometry into one merged Mesh per bucket key. */
function createBuilder(): {
  push(
    key: string,
    material: MeshStandardMaterial,
    geo: BufferGeometry,
    cast: boolean,
    receive: boolean,
  ): void
  box(
    key: string,
    material: MeshStandardMaterial,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    opts?: { ry?: number; rx?: number; rz?: number; cast?: boolean; receive?: boolean },
  ): void
  mount(group: Group): void
} {
  const buckets = new Map<string, Bucket>()
  function push(
    key: string,
    material: MeshStandardMaterial,
    geo: BufferGeometry,
    cast: boolean,
    receive: boolean,
  ): void {
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { material, cast, receive, parts: [] }
      buckets.set(key, bucket)
    }
    bucket.parts.push(geo)
  }
  function box(
    key: string,
    material: MeshStandardMaterial,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    opts: { ry?: number; rx?: number; rz?: number; cast?: boolean; receive?: boolean } = {},
  ): void {
    const geo = new BoxGeometry(w, h, d)
    geo.applyMatrix4(xform(x, y, z, opts.ry, opts.rx, opts.rz))
    push(key, material, geo, opts.cast ?? true, opts.receive ?? true)
  }
  function mount(group: Group): void {
    for (const bucket of buckets.values()) {
      const merged = mergeGeometries(bucket.parts, false)
      if (!merged) continue
      const mesh = new Mesh(merged, bucket.material)
      mesh.castShadow = bucket.cast
      mesh.receiveShadow = bucket.receive
      group.add(mesh)
    }
  }
  return { push, box, mount }
}

/** A kumiko lattice panel (outer frame + a 3x6 grid of thin bars), pushed via `sink`. */
function latticePanel(
  sink: (geo: BufferGeometry) => void,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z: number,
  depth: number,
): void {
  const w = x1 - x0
  const h = y1 - y0
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const stile = 0.05
  const bar = 0.02
  const mk = (bw: number, bh: number, x: number, y: number, d: number): void => {
    const g = new BoxGeometry(bw, bh, d)
    g.applyMatrix4(new Matrix4().makeTranslation(x, y, z))
    sink(g)
  }
  mk(w, stile, cx, y0 + stile / 2, depth) // sill
  mk(w, stile, cx, y1 - stile / 2, depth) // top rail
  mk(stile, h, x0 + stile / 2, cy, depth) // left stile
  mk(stile, h, x1 - stile / 2, cy, depth) // right stile
  for (let i = 1; i <= 2; i++) mk(bar, h - stile * 2, x0 + (w * i) / 3, cy, depth * 0.6) // 3 columns
  for (let j = 1; j <= 5; j++) mk(w - stile * 2, bar, cx, y0 + (h * j) / 6, depth * 0.6) // 6 rows
}

function paneGeometry(x0: number, x1: number, y0: number, y1: number, z: number): BufferGeometry {
  const g = new BoxGeometry(x1 - x0 - 0.1, y1 - y0 - 0.1, 0.008)
  g.applyMatrix4(new Matrix4().makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, z))
  return g
}

export function createInterior(mats: Materials, quality: Quality): WorldPart {
  const group = new Group()
  const b = createBuilder()

  // Small ad hoc materials the shared registry doesn't carry (per brief: metals are a plain
  // dark MeshStandardMaterial; the rest follow the same std-color pattern as mats.paper/cloth).
  const metal = new MeshStandardMaterial({
    color: new Color('#3a3b3e'),
    roughness: 0.5,
    metalness: 0.8,
  })
  const clay = mats.make('stone', { repeat: 0.5, color: '#b3987a', roughness: 0.88 })
  const tan = new MeshStandardMaterial({ color: new Color('#c7a468'), roughness: 0.85 })
  const ash = new MeshStandardMaterial({ color: new Color('#8f887d'), roughness: 1 })
  const ember = new MeshStandardMaterial({
    color: new Color('#3a1508'),
    roughness: 1,
    emissive: new Color('#ff7a2e'),
    emissiveIntensity: 1.3,
  })
  const glass = new MeshStandardMaterial({
    color: new Color('#98a6a8'),
    roughness: 0.25,
    metalness: 0.05,
    emissive: new Color('#aab8ba'),
    emissiveIntensity: 0.4,
    side: DoubleSide,
  })
  const voidDark = new MeshStandardMaterial({
    color: new Color('#100c09'),
    roughness: 1,
    side: BackSide,
  })
  const lampPaper = mats.paper.clone()

  // ---------------------------------------------------------------- floor: tatami + trim ----
  const MAT_W = 0.9
  const MAT_L = 1.8
  const MAT_T = 0.06
  const CELL = 1.8
  const TATAMI_X0 = -4.4
  const NX = 4
  const TATAMI_ZMIN = -6.2
  const NZ = 3
  const BORDER_W = 0.06

  const matTemplate = new BoxGeometry(MAT_W, MAT_T, MAT_L)
  metreUV(matTemplate, MAT_W, MAT_L)
  const borderTemplate = new BoxGeometry(BORDER_W, MAT_T + 0.006, MAT_L - 0.06)

  const placements: { x: number; z: number; ry: number }[] = []
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const cx = TATAMI_X0 + i * CELL + CELL / 2
      const cz = TATAMI_ZMIN + j * CELL + CELL / 2
      if ((i + j) % 2 === 0) {
        for (const side of [-1, 1]) placements.push({ x: cx + (side * MAT_W) / 2, z: cz, ry: 0 })
      } else {
        for (const side of [-1, 1])
          placements.push({ x: cx, z: cz + (side * MAT_W) / 2, ry: Math.PI / 2 })
      }
    }
  }
  const mats_ = new InstancedMesh(matTemplate, mats.tatami, placements.length)
  const borders = new InstancedMesh(borderTemplate, mats.cloth, placements.length * 2)
  let bi = 0
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]
    if (!p) continue
    dummy.position.set(p.x, FLOOR_Y - MAT_T / 2, p.z)
    dummy.rotation.set(0, p.ry, 0)
    dummy.scale.setScalar(1)
    dummy.updateMatrix()
    mats_.setMatrixAt(i, dummy.matrix)
    for (const side of [-1, 1]) {
      dummy.position.set(p.x, FLOOR_Y - MAT_T / 2 + 0.003, p.z)
      dummy.rotation.set(0, p.ry, 0)
      dummy.translateX((side * (MAT_W - BORDER_W)) / 2)
      dummy.updateMatrix()
      borders.setMatrixAt(bi++, dummy.matrix)
    }
  }
  mats_.castShadow = false
  mats_.receiveShadow = true
  borders.castShadow = false
  borders.receiveShadow = true
  group.add(mats_, borders)

  // Wood floor frame around the tatami field (also the raised front threshold) and the doma
  // riser that steps down to the earthen kitchen floor.
  b.box(
    'trim',
    mats.woodDark,
    DOMA_X0 - ROOM_X0 - 0.1,
    0.09,
    ROOM_ZN - (TATAMI_ZMIN + NZ * CELL),
    (DOMA_X0 + ROOM_X0 + 0.1) / 2,
    FLOOR_Y + 0.015,
    (ROOM_ZN + (TATAMI_ZMIN + NZ * CELL)) / 2,
    { cast: false },
  )
  b.box(
    'trim',
    mats.woodDark,
    DOMA_X0 - ROOM_X0 - 0.1,
    0.06,
    TATAMI_ZMIN - ROOM_ZF,
    (DOMA_X0 + ROOM_X0 + 0.1) / 2,
    FLOOR_Y - 0.015,
    (TATAMI_ZMIN + ROOM_ZF) / 2,
    { cast: false },
  )
  b.box(
    'trim',
    mats.woodDark,
    TATAMI_X0 - ROOM_X0,
    0.06,
    ROOM_ZN - ROOM_ZF,
    (TATAMI_X0 + ROOM_X0) / 2,
    FLOOR_Y - 0.015,
    (ROOM_ZN + ROOM_ZF) / 2,
    { cast: false },
  )
  b.box(
    'trim',
    mats.woodDark,
    DOMA_X0 - (TATAMI_X0 + NX * CELL),
    0.06,
    ROOM_ZN - ROOM_ZF,
    (DOMA_X0 + (TATAMI_X0 + NX * CELL)) / 2,
    FLOOR_Y - 0.015,
    (ROOM_ZN + ROOM_ZF) / 2,
    { cast: false },
  )
  // doma riser (vertical kick face at the tatami/earthen-floor step)
  b.box(
    'trim',
    mats.woodDark,
    0.05,
    FLOOR_Y - DOMA_Y,
    ROOM_ZN - ROOM_ZF,
    DOMA_X0,
    (FLOOR_Y + DOMA_Y) / 2,
    (ROOM_ZN + ROOM_ZF) / 2,
    {
      cast: false,
    },
  )

  // ------------------------------------------------------------------------------ ceiling ----
  const ceilGeo = new BoxGeometry(ROOM_X1 - ROOM_X0, 0.05, ROOM_ZN - ROOM_ZF)
  metreUV(ceilGeo, ROOM_X1 - ROOM_X0, ROOM_ZN - ROOM_ZF)
  ceilGeo.applyMatrix4(xform(0, CEIL_Y + 0.025, (ROOM_ZN + ROOM_ZF) / 2))
  const ceiling = new Mesh(ceilGeo, mats.woodDark)
  ceiling.castShadow = false
  ceiling.receiveShadow = false
  group.add(ceiling)
  for (const z of [-2, -4, -6]) {
    b.box('beam', mats.woodDark, ROOM_X1 - ROOM_X0, 0.3, 0.25, 0, 3.0, z)
  }
  if (quality.tier !== 'low') {
    const voidGeo = new BoxGeometry(ROOM_X1 - ROOM_X0 - 0.4, 1.6, ROOM_ZN - ROOM_ZF - 0.4)
    voidGeo.applyMatrix4(xform(0, CEIL_Y + 0.85, (ROOM_ZN + ROOM_ZF) / 2))
    const roofVoid = new Mesh(voidGeo, voidDark)
    roofVoid.castShadow = false
    roofVoid.receiveShadow = false
    group.add(roofVoid)
    for (let i = 0; i < 6; i++) {
      const x = -4 + i * 1.6
      b.box('beam', mats.woodDark, 0.12, 0.16, 1.4, x, 3.35, -3.5, {
        rx: 0.55,
        cast: false,
        receive: false,
      })
    }
  }

  // ------------------------------------------------------------ back wall: shoji + window ----
  const SHOJI_X0 = -2.2
  const SHOJI_X1 = 2.2
  const SHOJI_Y0 = FLOOR_Y
  const SHOJI_Y1 = 2.55
  const Z_FRAME = -6.8
  const Z_FIXED = -6.68
  const Z_SLIDE = -6.58
  const PANEL_Y0 = 0.44
  const PANEL_Y1 = 2.52

  // fixed frame: sill, top rail, outer stiles
  b.box('shojiFrame', mats.woodDark, SHOJI_X1 - SHOJI_X0, 0.08, 0.08, 0, SHOJI_Y0 + 0.04, Z_FRAME)
  b.box('shojiFrame', mats.woodDark, SHOJI_X1 - SHOJI_X0, 0.08, 0.08, 0, SHOJI_Y1 - 0.04, Z_FRAME)
  b.box(
    'shojiFrame',
    mats.woodDark,
    0.1,
    SHOJI_Y1 - SHOJI_Y0,
    0.08,
    SHOJI_X0 + 0.05,
    (SHOJI_Y0 + SHOJI_Y1) / 2,
    Z_FRAME,
  )
  b.box(
    'shojiFrame',
    mats.woodDark,
    0.1,
    SHOJI_Y1 - SHOJI_Y0,
    0.08,
    SHOJI_X1 - 0.05,
    (SHOJI_Y0 + SHOJI_Y1) / 2,
    Z_FRAME,
  )

  // fixed outer panels (P1 left, P4 right): lattice into the structural bucket, panes merged separately
  const fixedPanes: BufferGeometry[] = []
  const fixedRanges: [number, number][] = [
    [-2.1, -1.05],
    [1.05, 2.1],
  ]
  for (const [x0, x1] of fixedRanges) {
    latticePanel(
      (g) => b.push('shojiFrame', mats.woodDark, g, true, true),
      x0,
      x1,
      PANEL_Y0,
      PANEL_Y1,
      Z_FIXED,
      0.05,
    )
    fixedPanes.push(paneGeometry(x0, x1, PANEL_Y0, PANEL_Y1, Z_FIXED + 0.03))
  }
  const fixedPaneGeo = mergeGeometries(fixedPanes, false)
  if (fixedPaneGeo) {
    const paneMesh = new Mesh(fixedPaneGeo, mats.paper)
    paneMesh.castShadow = false
    paneMesh.receiveShadow = false
    group.add(paneMesh)
  }

  // sliding inner panels (P2 left, P3 right): each its own Group so update() can slide it
  function makeSlidingPanel(half: number): Group {
    const frameParts: BufferGeometry[] = []
    latticePanel((g) => frameParts.push(g), -half, half, PANEL_Y0, PANEL_Y1, 0, 0.05)
    const frameGeo = mergeGeometries(frameParts, false)
    const grp = new Group()
    if (frameGeo) {
      const frame = new Mesh(frameGeo, mats.woodDark)
      frame.castShadow = true
      frame.receiveShadow = true
      grp.add(frame)
    }
    const pane = new Mesh(paneGeometry(-half, half, PANEL_Y0, PANEL_Y1, 0.03), mats.paper)
    pane.castShadow = false
    pane.receiveShadow = false
    grp.add(pane)
    return grp
  }
  const REST_L = -0.525
  const REST_R = 0.525
  const panelL = makeSlidingPanel(0.525)
  panelL.position.set(REST_L, 0, Z_SLIDE)
  const panelR = makeSlidingPanel(0.525)
  panelR.position.set(REST_R, 0, Z_SLIDE)
  group.add(panelL, panelR)

  // small side window on the back wall
  const sideWinX0 = -3.9
  const sideWinX1 = -3.1
  const sideWinY0 = 1.3
  const sideWinY1 = 1.9
  latticePanel(
    (g) => b.push('shojiFrame', mats.woodDark, g, true, true),
    sideWinX0,
    sideWinX1,
    sideWinY0,
    sideWinY1,
    -6.9,
    0.05,
  )
  const glassParts: BufferGeometry[] = [
    paneGeometry(sideWinX0, sideWinX1, sideWinY0, sideWinY1, -6.87),
  ]

  // ----------------------------------------------------------------- +x wall: kitchen doma ----
  const domaGeo = new BoxGeometry(ROOM_X1 - DOMA_X0, 0.06, ROOM_ZN - ROOM_ZF)
  metreUV(domaGeo, ROOM_X1 - DOMA_X0, ROOM_ZN - ROOM_ZF)
  domaGeo.applyMatrix4(xform((ROOM_X1 + DOMA_X0) / 2, DOMA_Y - 0.03, (ROOM_ZN + ROOM_ZF) / 2))
  const doma = new Mesh(domaGeo, mats.mud)
  doma.castShadow = false
  doma.receiveShadow = true
  group.add(doma)

  // kamado stove: a stepped lathe silhouette (two stacked forms) with two pot rings + iron pots
  const KX = 4.4
  const KZ = -3.8
  const kamadoPts = [
    new Vector2(0.02, 0),
    new Vector2(0.52, 0),
    new Vector2(0.55, 0.08),
    new Vector2(0.5, 0.3),
    new Vector2(0.44, 0.34),
    new Vector2(0.4, 0.36),
    new Vector2(0.36, 0.42),
    new Vector2(0.22, 0.56),
    new Vector2(0.2, 0.56),
  ]
  const kamadoGeo = new LatheGeometry(kamadoPts, 16)
  kamadoGeo.applyMatrix4(xform(KX, DOMA_Y, KZ))
  const ringGeo1 = new TorusGeometry(0.15, 0.02, 6, 14)
  ringGeo1.applyMatrix4(xform(KX - 0.18, DOMA_Y + 0.56, KZ - 0.1, 0, Math.PI / 2))
  const ringGeo2 = new TorusGeometry(0.13, 0.02, 6, 14)
  ringGeo2.applyMatrix4(xform(KX + 0.22, DOMA_Y + 0.56, KZ + 0.15, 0, Math.PI / 2))
  const kamadoMerged = mergeGeometries([kamadoGeo], false)
  if (kamadoMerged) {
    const kamado = new Mesh(kamadoMerged, clay)
    kamado.castShadow = false
    kamado.receiveShadow = true
    group.add(kamado)
  }
  const ringMerged = mergeGeometries([ringGeo1, ringGeo2], false)
  const potPts = [
    new Vector2(0, 0),
    new Vector2(0.15, 0),
    new Vector2(0.165, 0.05),
    new Vector2(0.14, 0.14),
    new Vector2(0.09, 0.19),
    new Vector2(0, 0.2),
  ]
  const pot1 = new LatheGeometry(potPts, 12)
  pot1.applyMatrix4(xform(KX - 0.18, DOMA_Y + 0.54, KZ - 0.1))
  const pot2 = new LatheGeometry(
    potPts.map((p) => p.clone().multiplyScalar(0.85)),
    12,
  )
  pot2.applyMatrix4(xform(KX + 0.22, DOMA_Y + 0.54, KZ + 0.15))
  const metalParts: BufferGeometry[] = [pot1, pot2]
  if (ringMerged) metalParts.push(ringMerged)

  // water jar (clay, near the kamado)
  const jarPts = [
    new Vector2(0, 0),
    new Vector2(0.16, 0),
    new Vector2(0.19, 0.14),
    new Vector2(0.14, 0.32),
    new Vector2(0.1, 0.36),
    new Vector2(0.08, 0.36),
  ]
  const jarGeo = new LatheGeometry(jarPts, 12)
  jarGeo.applyMatrix4(xform(3.95, DOMA_Y, -3.3))
  const clayParts: BufferGeometry[] = [jarGeo]

  // shelf with jars (+x wall, further back) and a pot rack (nearer the front)
  b.box('trim', mats.wood, 0.28, 0.04, 1.1, 5.12, 1.7, -5.6)
  for (let i = 0; i < 4; i++) {
    const small = new LatheGeometry(
      jarPts.map((p) => p.clone().multiplyScalar(0.4 + i * 0.05)),
      8,
    )
    small.applyMatrix4(xform(5.0 + (i % 2) * 0.18, 1.72, -5.9 + i * 0.24))
    clayParts.push(small)
  }
  b.box('trim', mats.woodDark, 0.06, 0.06, 1.0, 5.15, 2.15, -2.0) // pot rack bar
  for (let i = 0; i < 5; i++) {
    const zi = -1.55 - i * 0.22
    const drop = 0.22 + (i % 3) * 0.08
    b.box('hook', mats.woodDark, 0.015, drop, 0.015, 5.15, 2.15 - drop / 2, zi, {
      cast: false,
      receive: false,
    })
    const pan = new CylinderGeometry(0.09 + (i % 2) * 0.02, 0.09 + (i % 2) * 0.02, 0.03, 10)
    pan.applyMatrix4(xform(5.15, 2.15 - drop, zi))
    metalParts.push(pan)
  }
  // hooks with a couple of small tools near the rack
  b.box('hook', mats.woodDark, 0.1, 0.02, 0.02, 5.15, 1.55, -1.2, {
    rz: Math.PI / 6,
    cast: false,
    receive: false,
  })
  b.box('hook', mats.woodDark, 0.1, 0.02, 0.02, 5.15, 1.4, -1.35, {
    rz: -Math.PI / 6,
    cast: false,
    receive: false,
  })

  // bucket + bamboo basket on the doma floor
  const bucketGeo = new CylinderGeometry(0.16, 0.13, 0.28, 12)
  bucketGeo.applyMatrix4(xform(4.0, DOMA_Y + 0.14, -1.0))
  const tanParts: BufferGeometry[] = [bucketGeo]
  const basketGeo = new CylinderGeometry(0.22, 0.17, 0.22, 10)
  basketGeo.applyMatrix4(xform(4.5, DOMA_Y + 0.11, -0.7))
  tanParts.push(basketGeo)

  // small window on the kitchen wall. This wall faces -x (its plane is y/z, thin along x), so
  // it is built directly with box() calls rather than the z-facing `latticePanel` helper.
  const kw0 = -4.6 - 0.35
  const kw1 = -4.6 + 0.35
  b.box('trim', mats.woodDark, 0.05, 0.6, 0.03, 5.2, 1.7, -4.6) // vertical mullion
  b.box('trim', mats.woodDark, 0.05, 0.05, 0.7, 5.2, 1.4, -4.6) // sill
  b.box('trim', mats.woodDark, 0.05, 0.05, 0.7, 5.2, 2.0, -4.6) // head
  b.box('trim', mats.woodDark, 0.05, 0.6, 0.03, 5.2, 1.7, kw0) // left stile
  b.box('trim', mats.woodDark, 0.05, 0.6, 0.03, 5.2, 1.7, kw1) // right stile
  const kwGeo = new BoxGeometry(0.008, 0.5, 0.6)
  kwGeo.applyMatrix4(xform(5.18, 1.7, -4.6))
  glassParts.push(kwGeo)

  // ------------------------------------------------------------- +z wall: front, from inside ----
  // The doorway + noren are the house module's; here just the wall dressing around it. The
  // front wall (placeholderHouse) is centred on z=0 with 0.25 thickness, so its inner face is
  // at z=-0.125: pegs stick out from there toward more-negative z, into the room.
  b.box('hook', mats.woodDark, 0.02, 0.02, 0.12, -2.5, 1.95, -0.185, {
    cast: false,
    receive: false,
  })
  b.box('hook', mats.woodDark, 0.02, 0.02, 0.12, -2.3, 1.7, -0.185, { cast: false, receive: false })
  const coatGeo = new CylinderGeometry(0.16, 0.24, 0.46, 10, 1, true)
  coatGeo.applyMatrix4(xform(-2.5, 1.65, -0.24))
  const clothParts: BufferGeometry[] = [coatGeo]
  const hatGeo = new ConeGeometry(0.26, 0.1, 12)
  hatGeo.applyMatrix4(xform(-2.3, 1.62, -0.24))
  tanParts.push(hatGeo)
  // umbrella leaning against the wall
  const shaftGeo = new CylinderGeometry(0.015, 0.015, 1.1, 6)
  shaftGeo.applyMatrix4(xform(-2.9, 0.96, -0.22, 0, 0, 0.16))
  b.push('trim', mats.wood, shaftGeo, false, false)
  const canopyGeo = new ConeGeometry(0.13, 0.85, 8)
  canopyGeo.applyMatrix4(xform(-2.9, 1.5, -0.26, 0, 0, 0.16))
  clothParts.push(canopyGeo)
  // a small step at the tatami/doma boundary near the front
  b.box('trim', mats.wood, 0.5, 0.18, 0.4, 3.3, FLOOR_Y - 0.09, -0.45, { cast: false })

  // --------------------------------------------------------------------- -x wall: window ----
  const ww0 = -1.7
  const ww1 = -3.3
  const wwZ0 = Math.min(ww0, ww1)
  const wwZ1 = Math.max(ww0, ww1)
  b.box('trim', mats.woodDark, 0.06, 1.2, 0.03, -5.2, 1.8, wwZ0 + 0.015) // left stile
  b.box('trim', mats.woodDark, 0.06, 1.2, 0.03, -5.2, 1.8, wwZ1 - 0.015) // right stile
  for (let i = 1; i <= 2; i++)
    b.box('trim', mats.woodDark, 0.06, 1.2, 0.025, -5.2, 1.8, wwZ0 + ((wwZ1 - wwZ0) * i) / 3, {
      receive: false,
    })
  b.box('trim', mats.woodDark, 0.06, 0.025, wwZ1 - wwZ0, -5.2, 1.2, (wwZ0 + wwZ1) / 2, {
    receive: false,
  })
  b.box('trim', mats.woodDark, 0.06, 0.025, wwZ1 - wwZ0, -5.2, 2.4, (wwZ0 + wwZ1) / 2, {
    receive: false,
  })
  const wGlass = new BoxGeometry(0.01, 1.1, wwZ1 - wwZ0 - 0.08)
  wGlass.applyMatrix4(xform(-5.18, 1.8, (wwZ0 + wwZ1) / 2))
  glassParts.push(wGlass)

  b.box('trim', mats.wood, 0.28, 0.04, 1.3, -5.13, 1.6, -4.5)
  for (let i = 0; i < 3; i++) {
    const small = new LatheGeometry(
      jarPts.map((p) => p.clone().multiplyScalar(0.35 + i * 0.06)),
      8,
    )
    small.applyMatrix4(xform(-5.0 - (i % 2) * 0.15, 1.62, -4.9 + i * 0.35))
    clayParts.push(small)
  }
  // farm tools leaning against the wall: handles (wood) + heads (metal)
  const toolX = -5.12
  for (const [z, tilt] of [
    [-5.5, 0.05],
    [-5.75, -0.04],
    [-6.0, 0.08],
  ] as const) {
    const handle = new CylinderGeometry(0.014, 0.014, 1.3, 6)
    handle.applyMatrix4(xform(toolX, 0.41 + 0.65, z, 0, 0, tilt))
    b.push('trim', mats.wood, handle, false, false)
  }
  const rakeHead = new BoxGeometry(0.26, 0.05, 0.02)
  rakeHead.applyMatrix4(xform(toolX + 0.03, 1.05, -5.5, 0, 0, 0.05))
  const hoeHead = new BoxGeometry(0.2, 0.14, 0.015)
  hoeHead.applyMatrix4(xform(toolX + 0.05, 1.02, -5.75, 0, Math.PI / 2, -0.04))
  const sickle = new TorusGeometry(0.12, 0.012, 5, 10, Math.PI * 0.7)
  sickle.applyMatrix4(xform(toolX + 0.05, 1.0, -6.0, 0, 0, Math.PI * 0.6 + 0.08))
  metalParts.push(rakeHead, hoeHead, sickle)
  // rolled futon along the wall
  const futonGeo = new CylinderGeometry(0.22, 0.22, 1.5, 12)
  futonGeo.applyMatrix4(xform(-4.85, FLOOR_Y + 0.22, -1.3, 0, 0, Math.PI / 2))
  clothParts.push(futonGeo)
  // hanging bamboo basket
  const hangBasket = new CylinderGeometry(0.15, 0.11, 0.18, 10)
  hangBasket.applyMatrix4(xform(-5.05, 2.0, -3.5))
  tanParts.push(hangBasket)
  b.box('hook', mats.woodDark, 0.02, 0.22, 0.02, -5.1, 2.15, -3.5, { cast: false, receive: false })
  // a hanging scroll (kakejiku)
  const scrollGeo = new BoxGeometry(0.008, 0.85, 0.34)
  scrollGeo.applyMatrix4(xform(-5.19, 2.05, -1.9))
  const scrollMat = new MeshStandardMaterial({ color: new Color('#e6dabd'), roughness: 0.85 })
  const scroll = new Mesh(scrollGeo, scrollMat)
  scroll.castShadow = false
  scroll.receiveShadow = false
  group.add(scroll)

  // ---------------------------------------------------------------------- posts + rail ----
  const POST = 0.18
  const postCorners: [number, number][] = [
    [ROOM_X0 + POST / 2, ROOM_ZN - POST / 2],
    [DOMA_X0 - POST / 2, ROOM_ZN - POST / 2],
    [ROOM_X0 + POST / 2, ROOM_ZF + POST / 2],
    [ROOM_X1 - POST / 2, ROOM_ZF + POST / 2],
    [ROOM_X0 + POST / 2, (ROOM_ZN + ROOM_ZF) / 2],
    [ROOM_X1 - POST / 2, (ROOM_ZN + ROOM_ZF) / 2],
  ]
  for (const [x, z] of postCorners)
    b.box('post', mats.woodDark, POST, CEIL_Y - FLOOR_Y, POST, x, (FLOOR_Y + CEIL_Y) / 2, z)
  // daikokubashira: the stouter post that marks the tatami/doma threshold
  b.box('post', mats.woodDark, 0.24, CEIL_Y - DOMA_Y, 0.24, DOMA_X0, (DOMA_Y + CEIL_Y) / 2, -3.5)
  // nageshi rail at y 1.9, split around the doorway and the shoji opening
  const RAIL_Y = 1.9
  b.box('post', mats.woodDark, 5.25 - 1.3, 0.1, 0.06, (ROOM_X0 + -1.3) / 2, RAIL_Y, ROOM_ZN, {
    receive: false,
  })
  b.box('post', mats.woodDark, DOMA_X0 - 1.3, 0.1, 0.06, (DOMA_X0 + 1.3) / 2, RAIL_Y, ROOM_ZN, {
    receive: false,
  })
  b.box(
    'post',
    mats.woodDark,
    SHOJI_X0 - ROOM_X0,
    0.1,
    0.06,
    (SHOJI_X0 + ROOM_X0) / 2,
    RAIL_Y,
    ROOM_ZF,
    {
      receive: false,
    },
  )
  b.box(
    'post',
    mats.woodDark,
    ROOM_X1 - SHOJI_X1,
    0.1,
    0.06,
    (SHOJI_X1 + ROOM_X1) / 2,
    RAIL_Y,
    ROOM_ZF,
    {
      receive: false,
    },
  )
  b.box(
    'post',
    mats.woodDark,
    0.06,
    0.1,
    ROOM_ZN - ROOM_ZF,
    ROOM_X0,
    RAIL_Y,
    (ROOM_ZN + ROOM_ZF) / 2,
    {
      receive: false,
    },
  )
  b.box(
    'post',
    mats.woodDark,
    0.06,
    0.1,
    ROOM_ZN - ROOM_ZF,
    DOMA_X0,
    RAIL_Y,
    (ROOM_ZN + ROOM_ZF) / 2,
    {
      receive: false,
    },
  )

  // -------------------------------------------------------------------------- hearth ----
  const HX = 0
  const HY = FLOOR_Y
  const HZ = -3.4
  const PIT = 1.2
  const PIT_DEPTH = 0.14
  for (const side of [-1, 1]) {
    b.box('post', mats.woodDark, PIT + 0.16, 0.05, 0.08, HX, HY + 0.025, HZ + (side * PIT) / 2) // top lip, +/- z
  }
  for (const side of [-1, 1]) {
    b.box('post', mats.woodDark, 0.08, 0.05, PIT, HX + (side * PIT) / 2, HY + 0.025, HZ)
  }
  for (const side of [-1, 1]) {
    b.box(
      'hook',
      mats.woodDark,
      0.04,
      PIT_DEPTH,
      PIT - 0.1,
      HX + (side * (PIT - 0.08)) / 2,
      HY - PIT_DEPTH / 2,
      HZ,
      {
        cast: false,
      },
    ) // inner pit walls, +/- x
  }
  for (const side of [-1, 1]) {
    b.box(
      'hook',
      mats.woodDark,
      PIT - 0.1,
      PIT_DEPTH,
      0.04,
      HX,
      HY - PIT_DEPTH / 2,
      HZ + (side * (PIT - 0.08)) / 2,
      {
        cast: false,
      },
    ) // inner pit walls, +/- z
  }
  const ashGeo = new BoxGeometry(PIT - 0.14, 0.03, PIT - 0.14)
  ashGeo.applyMatrix4(xform(HX, HY - PIT_DEPTH + 0.02, HZ))
  const ashMesh = new Mesh(ashGeo, ash)
  ashMesh.castShadow = false
  ashMesh.receiveShadow = true
  group.add(ashMesh)
  const emberCount = quality.tier === 'low' ? 4 : 8
  const emberGeo = new SphereGeometry(0.045, 6, 5)
  const embers = new InstancedMesh(emberGeo, ember, emberCount)
  for (let i = 0; i < emberCount; i++) {
    const a = (i / emberCount) * Math.PI * 2
    const r = 0.08 + (i % 3) * 0.06
    dummy.position.set(HX + Math.cos(a) * r, HY - PIT_DEPTH + 0.05, HZ + Math.sin(a) * r)
    dummy.rotation.set(0, a, 0)
    dummy.scale.setScalar(0.7 + (i % 4) * 0.12)
    dummy.updateMatrix()
    embers.setMatrixAt(i, dummy.matrix)
  }
  embers.castShadow = false
  embers.receiveShadow = false
  group.add(embers)

  // ------------------------------------------------------- kettle, chain and counterweight ----
  // Offset off x=0 so the swinging assembly never sits on the camera's dolly line (the camera
  // holds x=0 through the whole approach/turn/doors beats and crosses z=-3.4 just past t=.5).
  const PIVOT = { x: 0.75, y: 3.13, z: HZ }
  const swing = new Group()
  swing.position.set(PIVOT.x, PIVOT.y, PIVOT.z)
  b.box('post', mats.woodDark, 0.1, 0.08, 0.1, PIVOT.x, CEIL_Y + 0.01, PIVOT.z) // mounting bracket into the ceiling

  const chainParts: BufferGeometry[] = []
  const CHAIN_TOP = -0.05
  // The kettle hangs close over the fire (well below the camera's ~1.45 m eye line, which is
  // flat through the whole turn+doors beats), not at head height: the camera sits fixed only
  // 0.2 m from the hearth in z during the turn and later flies straight through this z depth,
  // so anything at eye level here would fill the frame or clip the lens.
  const CHAIN_BOTTOM = -2.1
  const LINKS = 14
  for (let i = 0; i < LINKS; i++) {
    const t = i / (LINKS - 1)
    const y = CHAIN_TOP + (CHAIN_BOTTOM - CHAIN_TOP) * t
    const link = new TorusGeometry(0.045, 0.012, 5, 8)
    link.applyMatrix4(xform(0, y, 0, 0, i % 2 === 0 ? 0 : Math.PI / 2))
    chainParts.push(link)
  }
  const kettlePts = [
    new Vector2(0, 0),
    new Vector2(0.26, 0),
    new Vector2(0.32, 0.1),
    new Vector2(0.3, 0.22),
    new Vector2(0.22, 0.32),
    new Vector2(0.14, 0.36),
    new Vector2(0.1, 0.37),
    new Vector2(0.08, 0.37),
  ]
  const kettleGeo = new LatheGeometry(kettlePts, 14)
  kettleGeo.applyMatrix4(xform(0, CHAIN_BOTTOM - 0.37, 0))
  const lidGeo = new CylinderGeometry(0.09, 0.1, 0.04, 12)
  lidGeo.applyMatrix4(xform(0, CHAIN_BOTTOM, 0))
  const knobGeo = new SphereGeometry(0.02, 6, 5)
  knobGeo.applyMatrix4(xform(0, CHAIN_BOTTOM + 0.03, 0))
  // Default orientation already arcs through +y (up) from (r,0,0) to (-r,0,0): no extra
  // rotation needed, just sat just above the rim so it reads as a handle, not a flat sliver.
  const bailGeo = new TorusGeometry(0.13, 0.013, 5, 12, Math.PI)
  bailGeo.applyMatrix4(xform(0, CHAIN_BOTTOM + 0.06, 0))
  const kettleMerged = mergeGeometries([...chainParts, kettleGeo, lidGeo, knobGeo, bailGeo], false)
  if (kettleMerged) {
    const kettleMesh = new Mesh(kettleMerged, metal)
    kettleMesh.castShadow = true
    kettleMesh.receiveShadow = true
    swing.add(kettleMesh)
  }
  // carved wooden fish counterweight, hanging off a short arm partway up the chain
  const armGeo = new BoxGeometry(0.34, 0.02, 0.02)
  armGeo.applyMatrix4(xform(0.17, CHAIN_TOP - 0.5, 0))
  const fishBody = new SphereGeometry(0.09, 8, 6)
  fishBody.applyMatrix4(xform(0.34, CHAIN_TOP - 0.62, 0, 0, 0, 0, 1, 0.55, 0.38))
  const fishTail = new ConeGeometry(0.07, 0.12, 4)
  fishTail.applyMatrix4(xform(0.46, CHAIN_TOP - 0.62, 0, 0, 0, Math.PI / 2, 1, 1, 0.25))
  const fishMerged = mergeGeometries([armGeo, fishBody, fishTail], false)
  if (fishMerged) {
    const fish = new Mesh(fishMerged, mats.wood)
    fish.castShadow = false
    fish.receiveShadow = false
    swing.add(fish)
  }
  group.add(swing)

  // ------------------------------------------------------------------------------- lamp ----
  const LAMP = { x: 1.5, y: 2.3, z: -4 }
  const shadeGeo = new CylinderGeometry(0.22, 0.22, 0.6, 12, 1, true)
  shadeGeo.applyMatrix4(xform(LAMP.x, LAMP.y, LAMP.z))
  const shade = new Mesh(shadeGeo, lampPaper)
  shade.castShadow = false
  shade.receiveShadow = false
  group.add(shade)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    b.box(
      'hook',
      mats.woodDark,
      0.02,
      0.6,
      0.02,
      LAMP.x + Math.cos(a) * 0.22,
      LAMP.y,
      LAMP.z + Math.sin(a) * 0.22,
      {
        cast: false,
        receive: false,
      },
    )
  }
  b.box('hook', mats.woodDark, 0.015, 0.6, 0.015, LAMP.x, LAMP.y + 0.6, LAMP.z, {
    cast: false,
    receive: false,
  })

  // --------------------------------------------------------------------------- assemble ----
  const glassMerged = mergeGeometries(glassParts, false)
  if (glassMerged) {
    const glassMesh = new Mesh(glassMerged, glass)
    glassMesh.castShadow = false
    glassMesh.receiveShadow = false
    group.add(glassMesh)
  }
  const clayMerged = mergeGeometries(clayParts, false)
  if (clayMerged) {
    const clayMesh = new Mesh(clayMerged, clay)
    clayMesh.castShadow = false
    clayMesh.receiveShadow = true
    group.add(clayMesh)
  }
  const metalMerged = mergeGeometries(metalParts, false)
  if (metalMerged) {
    const metalMesh = new Mesh(metalMerged, metal)
    metalMesh.castShadow = false
    metalMesh.receiveShadow = true
    group.add(metalMesh)
  }
  const tanMerged = mergeGeometries(tanParts, false)
  if (tanMerged) {
    const tanMesh = new Mesh(tanMerged, tan)
    tanMesh.castShadow = false
    tanMesh.receiveShadow = true
    group.add(tanMesh)
  }
  const clothMerged = mergeGeometries(clothParts, false)
  if (clothMerged) {
    const clothMesh = new Mesh(clothMerged, mats.cloth)
    clothMesh.castShadow = false
    clothMesh.receiveShadow = true
    group.add(clothMesh)
  }
  b.mount(group)

  return {
    group,
    update(state: SceneState) {
      const slide = 1.05 * state.doors
      panelL.position.x = REST_L - slide
      panelR.position.x = REST_R + slide

      const t = state.reduced ? 0 : state.time
      swing.rotation.z = Math.sin(t / 2200) * 0.018 + Math.sin(t / 1300 + 1.1) * 0.009

      const glow = clamp(state.lamp / 9, 0, 1)
      const flicker = state.reduced ? 0 : Math.sin(t / 90) * 0.06 + Math.sin(t / 231 + 2) * 0.04
      lampPaper.emissiveIntensity = glow * (0.85 + flicker)
      const emberFlicker = state.reduced ? 0 : Math.sin(t / 140 + 0.6) * 0.15
      ember.emissiveIntensity = 1.2 + emberFlicker
    },
  }
}
