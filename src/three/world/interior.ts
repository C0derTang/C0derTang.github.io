import {
  BackSide,
  BoxGeometry,
  type BufferGeometry,
  CatmullRomCurve3,
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
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { Quality } from '../../config/quality'
import { clamp } from '../../util/math'
import type { Materials } from '../materials'
import type { SceneState } from '../state'
import type { WorldPart } from './types'
import { createHearthFire, HEARTH_CENTER, hearthFlicker } from './fire'
import { FRONT_WINDOWS } from './house'

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
    emissiveIntensity: 0.04,
    side: DoubleSide,
  })
  const voidDark = new MeshStandardMaterial({
    color: new Color('#100c09'),
    roughness: 1,
    side: BackSide,
  })
  const lampPaper = mats.paper.clone()
  lampPaper.emissive.set('#f2b45a')

  const rounded = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    dark = false,
  ): void => {
    const geo = new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d, 0.12) * 0.18)
    geo.applyMatrix4(xform(x, y, z))
    b.push(
      dark ? 'furniture-dark' : 'furniture',
      dark ? mats.woodDark : mats.wood,
      geo,
      false,
      true,
    )
  }

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
  // The irori is an actual opening: retain the mat weave coordinates on the few cut pieces.
  const hearthHalf = 0.57
  const hearthX = HEARTH_CENTER.x
  const hearthZ = HEARTH_CENTER.z
  function cutMat(
    p: { x: number; z: number; ry: number },
    u0: number,
    u1: number,
    v0: number,
    v1: number,
    edge = false,
  ): void {
    const cos = Math.cos(p.ry)
    const sin = Math.sin(p.ry)
    const centerU = (hearthX - p.x) * cos - (hearthZ - p.z) * sin
    const centerV = (hearthX - p.x) * sin + (hearthZ - p.z) * cos
    const a = Math.max(u0, centerU - hearthHalf)
    const c = Math.min(u1, centerU + hearthHalf)
    const d = Math.max(v0, centerV - hearthHalf)
    const e = Math.min(v1, centerV + hearthHalf)
    const rects =
      a >= c || d >= e
        ? [[u0, u1, v0, v1]]
        : [
            [u0, a, v0, v1],
            [c, u1, v0, v1],
            [a, c, v0, d],
            [a, c, e, v1],
          ]
    for (const [left, right, front, back] of rects) {
      if (left === undefined || right === undefined || front === undefined || back === undefined)
        continue
      if (right - left < 0.001 || back - front < 0.001) continue
      const geo = new BoxGeometry(right - left, MAT_T + (edge ? 0.006 : 0), back - front)
      const uv = geo.attributes.uv
      const pos = geo.attributes.position
      if (uv && pos)
        for (let i = 8; i <= 15; i++)
          uv.setXY(
            i,
            pos.getX(i) + (left + right + MAT_W) / 2,
            pos.getZ(i) + (front + back + MAT_L) / 2,
          )
      geo.translate((left + right) / 2, 0, (front + back) / 2)
      geo.applyMatrix4(xform(p.x, FLOOR_Y - MAT_T / 2 + (edge ? 0.003 : 0), p.z, p.ry))
      b.push(edge ? 'cut-mat-edge' : 'cut-mat', edge ? mats.cloth : mats.tatami, geo, false, true)
    }
  }
  let bi = 0
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]
    if (!p) continue
    const halfX = p.ry === 0 ? MAT_W / 2 : MAT_L / 2
    const halfZ = p.ry === 0 ? MAT_L / 2 : MAT_W / 2
    const cut =
      Math.abs(p.x - hearthX) < halfX + hearthHalf && Math.abs(p.z - hearthZ) < halfZ + hearthHalf
    dummy.position.set(p.x, FLOOR_Y - MAT_T / 2, p.z)
    dummy.rotation.set(0, p.ry, 0)
    dummy.scale.setScalar(cut ? 0 : 1)
    dummy.updateMatrix()
    mats_.setMatrixAt(i, dummy.matrix)
    if (cut) cutMat(p, -MAT_W / 2, MAT_W / 2, -MAT_L / 2, MAT_L / 2)
    for (const side of [-1, 1]) {
      dummy.position.set(p.x, FLOOR_Y - MAT_T / 2 + 0.003, p.z)
      dummy.rotation.set(0, p.ry, 0)
      dummy.scale.setScalar(cut ? 0 : 1)
      dummy.translateX((side * (MAT_W - BORDER_W)) / 2)
      dummy.updateMatrix()
      borders.setMatrixAt(bi++, dummy.matrix)
      if (cut) {
        const center = (side * (MAT_W - BORDER_W)) / 2
        cutMat(
          p,
          center - BORDER_W / 2,
          center + BORDER_W / 2,
          -(MAT_L - 0.06) / 2,
          (MAT_L - 0.06) / 2,
          true,
        )
      }
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
    // Bearing blocks and short knee braces make the beams read as joined structural timber.
    for (const side of [-1, 1]) {
      b.box('beam', mats.woodDark, 0.48, 0.1, 0.34, side * 4.96, 2.8, z)
      // Lower end enters the wall at x ±5.39; upper end meets the bearing at x ±4.88.
      const run = 0.51
      const rise = 0.44
      b.box('beam', mats.woodDark, 0.1, Math.hypot(run, rise), 0.12, side * 5.135, 2.57, z, {
        rz: side * Math.atan2(run, rise),
      })
    }
  }
  for (let x = -4.8; x < 5; x += 0.6)
    b.box(
      'beam',
      mats.woodDark,
      0.035,
      0.055,
      ROOM_ZN - ROOM_ZF,
      x,
      3.155,
      (ROOM_ZN + ROOM_ZF) / 2,
      { cast: false },
    )
  if (quality.tier !== 'low') {
    // Keep the dark attic volume below the hip slopes at the room's outer corners.
    const voidGeo = new BoxGeometry(ROOM_X1 - ROOM_X0 - 0.4, 0.8, ROOM_ZN - ROOM_ZF - 0.4)
    voidGeo.applyMatrix4(xform(0, CEIL_Y + 0.45, (ROOM_ZN + ROOM_ZF) / 2))
    const roofVoid = new Mesh(voidGeo, voidDark)
    roofVoid.castShadow = false
    roofVoid.receiveShadow = false
    group.add(roofVoid)
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
    fixedPanes.push(paneGeometry(x0, x1, PANEL_Y0, PANEL_Y1, Z_FIXED - 0.018))
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
    const pull = mergeVertices(new RoundedBoxGeometry(0.06, 0.16, 0.018, 2, 0.012))
    pull.applyMatrix4(xform(-half + 0.08, 1.2, 0.025))
    frameParts.push(pull)
    const frameGeo = mergeGeometries(frameParts, false)
    const grp = new Group()
    if (frameGeo) {
      const frame = new Mesh(frameGeo, mats.woodDark)
      frame.castShadow = true
      frame.receiveShadow = true
      grp.add(frame)
    }
    const pane = new Mesh(paneGeometry(-half, half, PANEL_Y0, PANEL_Y1, -0.018), mats.paper)
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
  // Align the head with the adjacent 0.1 m rail's top at y 1.95.
  const sideWinY0 = 1.35
  const sideWinY1 = 1.95
  // Seat the frame against the plaster's inner face (-6.875), with the fine lattice in front
  // of the pane. The old frame face was coplanar with the plaster and its bars were buried.
  const sideWinZ = ROOM_ZF
  latticePanel(
    (g) => b.push('shojiFrame', mats.woodDark, g, true, true),
    sideWinX0,
    sideWinX1,
    sideWinY0,
    sideWinY1,
    sideWinZ,
    0.05,
  )
  const glassParts: BufferGeometry[] = [
    paneGeometry(sideWinX0, sideWinX1, sideWinY0, sideWinY1, sideWinZ - 0.023),
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
  const kamadoGeo = new LatheGeometry(kamadoPts, 32)
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
  const pot1 = new LatheGeometry(potPts, 28)
  pot1.applyMatrix4(xform(KX - 0.18, DOMA_Y + 0.54, KZ - 0.1))
  const pot2 = new LatheGeometry(
    potPts.map((p) => p.clone().multiplyScalar(0.85)),
    28,
  )
  pot2.applyMatrix4(xform(KX + 0.22, DOMA_Y + 0.54, KZ + 0.15))
  const metalParts: BufferGeometry[] = [pot1, pot2]
  if (ringMerged) metalParts.push(ringMerged)
  for (const [x, z, scale] of [
    [KX - 0.18, KZ - 0.1, 1],
    [KX + 0.22, KZ + 0.15, 0.85],
  ] as const) {
    const lid = new CylinderGeometry(0.105 * scale, 0.13 * scale, 0.025, 28)
    lid.applyMatrix4(xform(x, DOMA_Y + 0.54 + 0.18 * scale, z))
    const knob = new SphereGeometry(0.025, 12, 8)
    knob.applyMatrix4(xform(x, DOMA_Y + 0.57 + 0.18 * scale, z, 0, 0, 0, 1, 0.7, 1))
    metalParts.push(lid, knob)
  }
  // An iron firebox door on the room-facing side of the earthen stove.
  const stoveDoor = mergeVertices(new RoundedBoxGeometry(0.035, 0.21, 0.26, 2, 0.022))
  stoveDoor.applyMatrix4(xform(KX - 0.49, DOMA_Y + 0.19, KZ))
  metalParts.push(stoveDoor)
  for (const z of [KZ - 0.06, KZ, KZ + 0.06])
    b.box('hook', mats.woodDark, 0.018, 0.08, 0.012, KX - 0.511, DOMA_Y + 0.19, z, { cast: false })

  // water jar (clay, near the kamado)
  const jarPts = [
    new Vector2(0, 0),
    new Vector2(0.16, 0),
    new Vector2(0.19, 0.14),
    new Vector2(0.14, 0.32),
    new Vector2(0.1, 0.36),
    new Vector2(0.105, 0.365),
    new Vector2(0.09, 0.38),
    new Vector2(0.075, 0.375),
    new Vector2(0.08, 0.32),
    new Vector2(0.12, 0.27),
    new Vector2(0.135, 0.08),
    new Vector2(0, 0.055),
  ]
  const jarGeo = new LatheGeometry(jarPts, 28)
  jarGeo.applyMatrix4(xform(3.95, DOMA_Y, -3.3))
  const clayParts: BufferGeometry[] = [jarGeo]

  // shelf with jars (+x wall, further back) and a pot rack (nearer the front)
  b.box('trim', mats.wood, 0.28, 0.04, 1.1, 5.12, 1.7, -5.6)
  for (let i = 0; i < 4; i++) {
    const small = new LatheGeometry(
      jarPts.map((p) => p.clone().multiplyScalar(0.4 + i * 0.05)),
      20,
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
  const bucketGeo = new LatheGeometry(
    [
      new Vector2(0, 0),
      new Vector2(0.13, 0),
      new Vector2(0.16, 0.28),
      new Vector2(0.145, 0.28),
      new Vector2(0.115, 0.025),
      new Vector2(0, 0.025),
    ],
    28,
  )
  bucketGeo.applyMatrix4(xform(4.0, DOMA_Y, -1.0))
  const tanParts: BufferGeometry[] = [bucketGeo]
  for (const y of [0.06, 0.23]) {
    const hoop = new TorusGeometry(0.13 + y * 0.107, 0.008, 6, 28)
    hoop.applyMatrix4(xform(4, DOMA_Y + y, -1, 0, Math.PI / 2))
    metalParts.push(hoop)
  }
  const bucketHandle = new TorusGeometry(0.15, 0.009, 6, 24, Math.PI)
  bucketHandle.applyMatrix4(xform(4, DOMA_Y + 0.27, -1))
  metalParts.push(bucketHandle)
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
  shaftGeo.applyMatrix4(xform(-1.85, 0.96, -0.22, 0, 0, 0.16))
  b.push('trim', mats.wood, shaftGeo, false, false)
  const canopyGeo = new ConeGeometry(0.13, 0.85, 8)
  canopyGeo.applyMatrix4(xform(-1.85, 1.5, -0.26, 0, 0, 0.16))
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
      20,
    )
    small.applyMatrix4(xform(-5.0 - (i % 2) * 0.15, 1.62, -4.9 + i * 0.35))
    clayParts.push(small)
  }
  // A compact tea chest beneath the existing shelf, with inset drawer faces and ring pulls.
  const chestX = -4.68
  const chestZ = -4.52
  const chestTop = FLOOR_Y + 0.76
  rounded(0.62, 0.61, 1.5, chestX, FLOOR_Y + 0.405, chestZ, true)
  rounded(0.73, 0.07, 1.62, chestX, chestTop - 0.035, chestZ)
  rounded(0.69, 0.075, 1.56, chestX, FLOOR_Y + 0.095, chestZ)
  for (const z of [chestZ - 0.68, chestZ + 0.68])
    for (const x of [chestX - 0.23, chestX + 0.23])
      rounded(0.085, 0.12, 0.09, x, FLOOR_Y + 0.06, z, true)
  for (const y of [FLOOR_Y + 0.28, FLOOR_Y + 0.56]) {
    for (const z of [chestZ - 0.375, chestZ + 0.375]) {
      rounded(0.04, 0.245, 0.7, chestX + 0.326, y, z)
      const plate = new CylinderGeometry(0.025, 0.025, 0.012, 16)
      plate.applyMatrix4(xform(chestX + 0.35, y + 0.015, z, 0, 0, Math.PI / 2))
      const pull = new TorusGeometry(0.034, 0.005, 6, 18)
      pull.applyMatrix4(xform(chestX + 0.361, y - 0.015, z, Math.PI / 2))
      metalParts.push(plate, pull)
    }
  }
  // Raised tray edges, a hollow-bowled tea service and an unmistakable teapot silhouette.
  const trayY = chestTop + 0.035
  rounded(0.53, 0.03, 1.03, chestX, trayY - 0.015, chestZ, true)
  for (const side of [-1, 1]) {
    rounded(0.025, 0.03, 1.03, chestX + side * 0.253, trayY + 0.008, chestZ)
    rounded(0.53, 0.03, 0.025, chestX, trayY + 0.008, chestZ + side * 0.502)
  }
  const teapot = new LatheGeometry(
    [
      new Vector2(0, 0),
      new Vector2(0.06, 0),
      new Vector2(0.095, 0.018),
      new Vector2(0.113, 0.072),
      new Vector2(0.095, 0.13),
      new Vector2(0.06, 0.15),
      new Vector2(0.055, 0.16),
      new Vector2(0, 0.16),
    ],
    28,
  )
  const teaZ = chestZ - 0.28
  teapot.applyMatrix4(xform(chestX, trayY, teaZ))
  const teaLid = new SphereGeometry(0.065, 24, 12)
  teaLid.applyMatrix4(xform(chestX, trayY + 0.162, teaZ, 0, 0, 0, 1, 0.25, 1))
  const teaKnob = new SphereGeometry(0.016, 12, 8)
  teaKnob.applyMatrix4(xform(chestX, trayY + 0.188, teaZ))
  const teaSpout = new LatheGeometry(
    [
      new Vector2(0.033, 0),
      new Vector2(0.027, 0.06),
      new Vector2(0.019, 0.12),
      new Vector2(0.012, 0.12),
      new Vector2(0.017, 0.055),
    ],
    20,
  )
  teaSpout.applyMatrix4(xform(chestX + 0.073, trayY + 0.08, teaZ, 0, 0, -0.8))
  const teaHandle = new TorusGeometry(0.065, 0.012, 8, 24, Math.PI * 1.55)
  teaHandle.applyMatrix4(xform(chestX - 0.087, trayY + 0.09, teaZ, 0, 0, Math.PI * 0.22))
  clayParts.push(teapot, teaLid, teaKnob, teaSpout, teaHandle)
  for (const z of [chestZ + 0.03, chestZ + 0.3]) {
    const cup = new LatheGeometry(
      [
        new Vector2(0.026, 0),
        new Vector2(0.04, 0.008),
        new Vector2(0.052, 0.06),
        new Vector2(0.05, 0.078),
        new Vector2(0.043, 0.079),
        new Vector2(0.04, 0.059),
        new Vector2(0.028, 0.018),
        new Vector2(0, 0.018),
      ],
      24,
    )
    cup.applyMatrix4(xform(chestX + 0.08, trayY, z))
    const saucer = new CylinderGeometry(0.076, 0.065, 0.01, 24)
    saucer.applyMatrix4(xform(chestX + 0.08, trayY + 0.004, z))
    clayParts.push(cup, saucer)
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
    [1.42, ROOM_ZN - POST / 2], // align with the doorway bay, clear of the right front window
    [ROOM_X0 + POST / 2, ROOM_ZF + POST / 2],
    [ROOM_X1 - POST / 2, ROOM_ZF + POST / 2],
    [ROOM_X0 + POST / 2, (ROOM_ZN + ROOM_ZF) / 2],
    [ROOM_X1 - POST / 2, (ROOM_ZN + ROOM_ZF) / 2],
  ]
  for (const [x, z] of postCorners)
    b.box('post', mats.woodDark, POST, CEIL_Y - FLOOR_Y, POST, x, (FLOOR_Y + CEIL_Y) / 2, z)
  // daikokubashira: the stouter post that marks the tatami/doma threshold
  const DOMA_POST_Z = -3.5
  b.box(
    'post',
    mats.woodDark,
    0.24,
    CEIL_Y - DOMA_Y,
    0.24,
    DOMA_X0,
    (DOMA_Y + CEIL_Y) / 2,
    DOMA_POST_Z,
  )
  // nageshi rail at y 1.9, split around the front windows, doorway and shoji opening
  const RAIL_Y = 1.9
  const [frontLeft, frontRight] = FRONT_WINDOWS.centers
  const frontFrameHalf = FRONT_WINDOWS.halfWidth + FRONT_WINDOWS.frameWidth / 2
  for (const [x0, x1] of [
    [ROOM_X0, frontLeft - frontFrameHalf],
    [frontLeft + frontFrameHalf, -1.3],
    [1.3, frontRight - frontFrameHalf],
    [frontRight + frontFrameHalf, ROOM_X1],
  ] as const)
    b.box('post', mats.woodDark, x1 - x0, 0.1, 0.06, (x0 + x1) / 2, RAIL_Y, ROOM_ZN, {
      receive: false,
    })
  // The rear rail meets the window's stiles instead of covering its head and upper lattice.
  for (const [x0, x1] of [
    [ROOM_X0, sideWinX0],
    [sideWinX1, SHOJI_X0],
  ] as const)
    b.box('post', mats.woodDark, x1 - x0, 0.1, 0.06, (x0 + x1) / 2, RAIL_Y, ROOM_ZF, {
      receive: false,
    })
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
    DOMA_POST_Z - ROOM_ZF,
    DOMA_X0,
    RAIL_Y,
    (DOMA_POST_Z + ROOM_ZF) / 2,
    {
      receive: false,
    },
  )

  // -------------------------------------------------------------------------- hearth ----
  const HX = HEARTH_CENTER.x
  const HY = FLOOR_Y
  const HZ = HEARTH_CENTER.z
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
  for (let i = 0; i < 3; i++) {
    const log = new CylinderGeometry(0.045, 0.057, 0.55 - i * 0.06, 12)
    log.applyMatrix4(xform(HX + (i - 1) * 0.12, HY - 0.068 + i * 0.012, HZ, i * 0.8, Math.PI / 2))
    b.push('hook', mats.woodDark, log, false, true)
  }
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

  const fire = createHearthFire(quality)
  fire.group.position.set(HX, HY - PIT_DEPTH + 0.07, HZ)
  group.add(fire.group)

  // ------------------------------------------------------- kettle, chain and counterweight ----
  // The full-size kettle and its suspension share the fire's center.
  const PIVOT = { x: HX, y: 3.13, z: HZ }
  const swing = new Group()
  swing.position.set(PIVOT.x, PIVOT.y, PIVOT.z)
  b.box('post', mats.woodDark, 0.1, 0.16, 0.1, PIVOT.x, CEIL_Y - 0.06, PIVOT.z) // mounting bracket into the ceiling

  const chainParts: BufferGeometry[] = []
  const CHAIN_TOP = -0.05
  const CHAIN_BOTTOM = -2.1
  const LINKS = 29
  for (let i = 0; i < LINKS; i++) {
    const t = i / (LINKS - 1)
    const y = CHAIN_TOP + (CHAIN_BOTTOM + 0.2 - CHAIN_TOP) * t
    const link = new TorusGeometry(0.038, 0.007, 6, 14)
    link.applyMatrix4(xform(0, y, 0, i % 2 === 0 ? 0 : Math.PI / 2, 0, 0, 1, 1.3, 1))
    chainParts.push(link)
  }
  const kettlePts = [
    new Vector2(0, 0),
    new Vector2(0.21, 0),
    new Vector2(0.27, 0.018),
    new Vector2(0.305, 0.055),
    new Vector2(0.32, 0.1),
    new Vector2(0.322, 0.155),
    new Vector2(0.3, 0.22),
    new Vector2(0.265, 0.278),
    new Vector2(0.22, 0.32),
    new Vector2(0.14, 0.36),
    new Vector2(0.1, 0.37),
    new Vector2(0.08, 0.37),
  ]
  const kettleGeo = new LatheGeometry(kettlePts, 40)
  kettleGeo.applyMatrix4(xform(0, CHAIN_BOTTOM - 0.37, 0))
  const lidGeo = new LatheGeometry(
    [
      new Vector2(0, 0),
      new Vector2(0.11, 0),
      new Vector2(0.116, 0.012),
      new Vector2(0.105, 0.023),
      new Vector2(0.07, 0.032),
      new Vector2(0, 0.035),
    ],
    32,
  )
  lidGeo.applyMatrix4(xform(0, CHAIN_BOTTOM, 0))
  const knobGeo = new SphereGeometry(0.024, 16, 10)
  knobGeo.applyMatrix4(xform(0, CHAIN_BOTTOM + 0.04, 0))
  // Default orientation already arcs through +y (up) from (r,0,0) to (-r,0,0): no extra
  // rotation needed, just sat just above the rim so it reads as a handle, not a flat sliver.
  const bailGeo = new TorusGeometry(0.245, 0.014, 8, 36, Math.PI)
  bailGeo.applyMatrix4(xform(0, CHAIN_BOTTOM - 0.05, 0))
  const spoutGeo = new LatheGeometry(
    [
      new Vector2(0.074, 0),
      new Vector2(0.059, 0.055),
      new Vector2(0.042, 0.17),
      new Vector2(0.033, 0.26),
      new Vector2(0.034, 0.274),
      new Vector2(0.023, 0.274),
      new Vector2(0.023, 0.24),
      new Vector2(0.031, 0.17),
    ],
    28,
  )
  spoutGeo.applyMatrix4(xform(0.23, CHAIN_BOTTOM - 0.17, 0, 0, 0, -0.72))
  const footGeo = new TorusGeometry(0.215, 0.016, 8, 32)
  footGeo.applyMatrix4(xform(0, CHAIN_BOTTOM - 0.37 + 0.006, 0, 0, Math.PI / 2))
  const kettleParts: BufferGeometry[] = [kettleGeo, lidGeo, knobGeo, bailGeo, spoutGeo, footGeo]
  for (const side of [-1, 1]) {
    const lug = new SphereGeometry(0.028, 12, 8)
    lug.applyMatrix4(xform(side * 0.235, CHAIN_BOTTOM - 0.05, 0, 0, 0, 0, 1, 0.8, 0.75))
    kettleParts.push(lug)
  }
  const kettleMerged = mergeGeometries([...chainParts, ...kettleParts], false)
  if (kettleMerged) {
    const kettleMesh = new Mesh(kettleMerged, metal)
    kettleMesh.castShadow = true
    kettleMesh.receiveShadow = true
    swing.add(kettleMesh)
  }
  // carved wooden fish counterweight, hanging off a short arm partway up the chain
  const armGeo = new BoxGeometry(0.34, 0.02, 0.02)
  armGeo.applyMatrix4(xform(0.17, CHAIN_TOP - 0.5, 0))
  const fishBody = new SphereGeometry(0.09, 20, 12)
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
  const shadeProfile = [
    new Vector2(0.18, -0.3),
    new Vector2(0.212, -0.27),
    new Vector2(0.227, -0.2),
    new Vector2(0.235, -0.1),
    new Vector2(0.237, 0),
    new Vector2(0.235, 0.1),
    new Vector2(0.227, 0.2),
    new Vector2(0.212, 0.27),
    new Vector2(0.18, 0.3),
  ]
  const shadeGeo = new LatheGeometry(shadeProfile, 40)
  shadeGeo.applyMatrix4(xform(LAMP.x, LAMP.y, LAMP.z))
  const shade = new Mesh(shadeGeo, lampPaper)
  shade.castShadow = false
  shade.receiveShadow = false
  group.add(shade)
  for (let i = 0; i <= 18; i++) {
    const y = -0.3 + i / 30
    const radius =
      i === 0 || i === 18 ? 0.18 : 0.18 + 0.058 * Math.sqrt(Math.max(0, 1 - (y / 0.31) ** 2))
    const hoop = new TorusGeometry(radius, i === 0 || i === 18 ? 0.012 : 0.0025, 5, 40)
    hoop.applyMatrix4(xform(LAMP.x, LAMP.y + y, LAMP.z, 0, Math.PI / 2))
    b.push('hook', mats.woodDark, hoop, false, false)
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const rib = new TubeGeometry(
      new CatmullRomCurve3(
        shadeProfile.map(
          (p) =>
            new Vector3(
              LAMP.x + Math.cos(a) * (p.x + 0.002),
              LAMP.y + p.y,
              LAMP.z + Math.sin(a) * (p.x + 0.002),
            ),
        ),
      ),
      20,
      0.004,
      6,
      false,
    )
    b.push('hook', mats.woodDark, rib, false, false)
  }
  for (const y of [LAMP.y - 0.3, LAMP.y + 0.3]) {
    b.box('hook', mats.woodDark, 0.36, 0.016, 0.018, LAMP.x, y, LAMP.z, {
      cast: false,
      receive: false,
    })
    b.box('hook', mats.woodDark, 0.018, 0.016, 0.36, LAMP.x, y, LAMP.z, {
      cast: false,
      receive: false,
    })
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
      lampPaper.emissiveIntensity = glow * (0.45 + flicker)
      ember.emissiveIntensity = 1.2 * hearthFlicker(state.time, state.reduced)
      fire.update?.(state)
    },
  }
}
