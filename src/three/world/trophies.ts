import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  Path,
  type PerspectiveCamera,
  PMREMGenerator,
  Shape,
  SphereGeometry,
  type Texture,
  TorusGeometry,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Quality } from '../../config/quality'
import type { Materials } from '../materials'
import type { SceneState } from '../state'
import { beat } from './beat'
import type { Interactive, OpenState, Pickable, WorldPart } from './types'

/**
 * The trophy case on the -x wall and its eight trophies. The case is one merged dark-wood mesh
 * that casts and receives shadows. Each trophy is one merged mesh with vertex colours (bright
 * metal for the figure, a darker tone for its plinth) on a polished gold or silver metal; only
 * the red stage disc is a second, non-metal mesh. Nothing is written on anything.
 *
 * Polish: the room's overcast sky is a dim, even grey (and `scene.environmentIntensity` would
 * override any per-material intensity), so the metal reflects its own small studio environment
 * instead: three's RoomEnvironment with a warm key panel, PMREM'd once at the size of the scene's
 * environment (same shader program). Edges are rounded (bevelled lathe profiles, rounded boxes,
 * creased normals on extrusions) so highlights run along them.
 *
 * The glow is a closed form of `state.time`: unvisited trophies breathe, an opened one fades to
 * a steady low glow over a second from when it was first seen visited. The opened trophy's
 * flight and hover are a closed form of the openness `k` and the time `since` it began opening.
 */

// The case: against the -x wall, centred on the camera's z at the trophy hold.
const CASE_Z = -4.9
const CASE_W = 1.8
const BACK_X = -5.23
const FRONT_X = -4.94
const FLOOR_Y = 0.41
const SHELF_Y = [0.95, 1.52] as const
const TOP_Y = 2.08
const TROPHY_X = -5.065
/** Trophy geometry faces +z; on the shelf that turns to face the room (+x). */
const SHELF_YAW = Math.PI / 2

// The opened trophy: where it hovers and how it gets there.
const HOVER_DIST = 0.9
const HOVER_LEFT = 0.18
const HOVER_RISE_PORTRAIT = 0.14
const HOVER_SCALE = 1.6
const HOVER_SCALE_PORTRAIT = 1.3
const ARC_HEIGHT = 0.16
const SPIN_TURNS = 3
const TURN_RATE = 0.7 // rad/s once it hovers
const CIRCLE_RADIUS = 0.04
const CIRCLE_RATE = 1.3 // rad/s
const BOB_HEIGHT = 0.018
const BOB_RATE = 2.1 // rad/s

// The glow: a warm emissive. Unvisited trophies pulse on the room's shared beat
// (`beat.ts`), all in step; once opened, the pulse fades out over `SETTLE_MS` to a
// steady, dimmer glow. Opened trophies can still be opened again.
const GLOW = 0.08
const GLOW_VISITED = 0.006
const GLOW_SWING = 3
const GLOW_HOVER = 2.4
const GLOW_OPEN = 1.3
const GLOW_DIMMED = 0.2
const SETTLE_MS = 1000

// The polish: the studio reflection's strength, and how far the other trophies' reflection
// steps back while one is open (the room behind it is dimmed).
const SHINE = 0.75
const SHINE_DIMMED = 0.35
const ROUGHNESS = 0.16

const GOLD = new Color('#e6b84d')
const BRONZE = new Color('#9c6d2c')
const SILVER = new Color('#e6e9ee')
const PEWTER = new Color('#8b9099')

/** Height of the two-step plinth every trophy stands on. */
const PT = 0.055

export const TROPHY_IDS = [
  'vex',
  'scibowl',
  'tedx',
  'usaco',
  'half',
  'muscleup',
  'bench',
  'swim',
] as const
export type TrophyId = (typeof TROPHY_IDS)[number]

const dummy = new Object3D()
function xf(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1): Matrix4 {
  dummy.position.set(x, y, z)
  dummy.rotation.set(rx, ry, rz)
  dummy.scale.setScalar(s)
  dummy.updateMatrix()
  return dummy.matrix.clone()
}

/** A part of a trophy: placed, without UVs, non-indexed and carrying its vertex colour. */
function part(geo: BufferGeometry, color: Color, m?: Matrix4): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo
  if (m) g.applyMatrix4(m)
  g.deleteAttribute('uv')
  const n = g.getAttribute('position').count
  const c = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    c[i * 3] = color.r
    c[i * 3 + 1] = color.g
    c[i * 3 + 2] = color.b
  }
  g.setAttribute('color', new BufferAttribute(c, 3))
  return g
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false)
  if (!merged) throw new Error('trophies: geometry merge failed')
  return merged
}

/** Smooth across shallow angles, sharp across steep ones (a rounded bevel reads as one curve). */
function creased(geo: BufferGeometry, angle = 0.62): BufferGeometry {
  // toCreasedNormals welds vertices on a 1 cm grid: work in tenths of a millimetre instead
  geo.scale(1000, 1000, 1000)
  const out = toCreasedNormals(geo, angle)
  out.scale(0.001, 0.001, 0.001)
  return out
}

/** An extrusion centred on z with a three-step rounded bevel and creased normals. */
function extrude(shape: Shape, depth: number, bevel = 0.004, curveSegments = 12): BufferGeometry {
  const geo = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments,
  })
  geo.translate(0, 0, -depth / 2)
  return creased(geo)
}

/**
 * A lathe whose interior profile corners are rounded: each corner becomes a short chamfer with
 * a flat-normal point either side, so flat faces stay flat and the edge carries the highlight.
 */
function lathe(
  pts: readonly (readonly [number, number])[],
  seg: number,
  bevel = 0.0025,
): LatheGeometry {
  const out: Vector2[] = []
  const a = new Vector2()
  const b = new Vector2()
  pts.forEach(([r, y], i) => {
    const p = new Vector2(r, y)
    const prev = pts[i - 1]
    const next = pts[i + 1]
    if (!prev || !next) {
      out.push(p)
      return
    }
    a.set(prev[0] - r, prev[1] - y)
    b.set(next[0] - r, next[1] - y)
    const e = Math.min(bevel, a.length() / 5, b.length() / 5)
    a.normalize()
    b.normalize()
    out.push(
      p.clone().addScaledVector(a, e * 2),
      p.clone().addScaledVector(a, e),
      p.clone().addScaledVector(b, e),
      p.clone().addScaledVector(b, e * 2),
    )
  })
  return new LatheGeometry(out, seg)
}

/** A box with rounded edges (radius `r`, clamped to the smallest half-size). */
function rbox(w: number, h: number, d: number, r = 0.003): BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * 0.999)
}

function roundPlinth(color: Color, seg: number): BufferGeometry[] {
  return [
    part(
      lathe(
        [
          [0, 0],
          [0.09, 0],
          [0.085, 0.03],
          [0.072, 0.03],
          [0.066, PT],
          [0, PT],
        ],
        seg,
        0.003,
      ),
      color,
    ),
  ]
}

function boxPlinth(color: Color, w: number, d: number): BufferGeometry[] {
  return [
    part(rbox(w, 0.03, d, 0.004), color, xf(0, 0.015, 0)),
    part(rbox(w - 0.03, PT - 0.03, d - 0.03, 0.004), color, xf(0, 0.03 + (PT - 0.03) / 2, 0)),
  ]
}

function gearShape(inner: number, outer: number, teeth: number, hole: number): Shape {
  const shape = new Shape()
  const w = (Math.PI * 2) / teeth
  for (let i = 0; i < teeth; i++) {
    const a = i * w
    const pts: [number, number][] = [
      [a, inner],
      [a + w * 0.14, outer],
      [a + w * 0.44, outer],
      [a + w * 0.58, inner],
    ]
    for (const [ang, r] of pts) {
      if (i === 0 && r === inner && ang === 0) shape.moveTo(r, 0)
      else shape.lineTo(Math.cos(ang) * r, Math.sin(ang) * r)
    }
  }
  shape.closePath()
  const bore = new Path()
  bore.absarc(0, 0, hole, 0, Math.PI * 2, true)
  shape.holes.push(bore)
  return shape
}

function starShape(outer: number, inner: number): Shape {
  const shape = new Shape()
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? inner : outer
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  shape.closePath()
  return shape
}

/** A cup with two handles and a gear standing in its mouth. */
function vex(seg: number): BufferGeometry[] {
  const cup = lathe(
    [
      [0, PT],
      [0.05, PT],
      [0.045, 0.07],
      [0.016, 0.085],
      [0.013, 0.12],
      [0.03, 0.135],
      [0.062, 0.17],
      [0.075, 0.235],
      [0.069, 0.237],
      [0.057, 0.175],
      [0.028, 0.146],
      [0, 0.143],
    ],
    seg,
  )
  const parts = [...roundPlinth(BRONZE, seg), part(cup, GOLD)]
  for (const side of [-1, 1])
    parts.push(
      part(
        new TorusGeometry(0.034, 0.006, 6, 14, Math.PI),
        GOLD,
        xf(side * 0.064, 0.195, 0, 0, 0, (-side * Math.PI) / 2),
      ),
    )
  parts.push(part(extrude(gearShape(0.043, 0.058, 10, 0.016), 0.018), GOLD, xf(0, 0.283, 0)))
  return parts
}

/** A wide bowl with an atom over it: a nucleus, three tilted orbits and their electrons. */
function scibowl(seg: number): BufferGeometry[] {
  const bowl = lathe(
    [
      [0, PT],
      [0.04, PT],
      [0.035, 0.07],
      [0.014, 0.085],
      [0.014, 0.105],
      [0.05, 0.115],
      [0.085, 0.14],
      [0.105, 0.185],
      [0.099, 0.187],
      [0.08, 0.148],
      [0.045, 0.126],
      [0, 0.122],
    ],
    seg,
  )
  const cy = 0.265
  const parts = [
    ...roundPlinth(BRONZE, seg),
    part(bowl, GOLD),
    part(new CylinderGeometry(0.004, 0.004, cy - 0.122, 6), GOLD, xf(0, (cy + 0.122) / 2, 0)),
    part(new SphereGeometry(0.027, 14, 10), GOLD, xf(0, cy, 0)),
  ]
  const squash = new Matrix4().makeScale(1, 0.4, 1)
  const tilt = new Matrix4().makeRotationX(0.3)
  for (let i = 0; i < 3; i++) {
    const m = new Matrix4()
      .makeTranslation(0, cy, 0)
      .multiply(new Matrix4().makeRotationZ((i * Math.PI) / 3 + 0.26))
      .multiply(tilt)
    parts.push(
      part(new TorusGeometry(0.085, 0.0055, 6, seg + 8), GOLD, m.clone().multiply(squash)),
      part(
        new SphereGeometry(0.011, 8, 6),
        GOLD,
        m.clone().multiply(new Matrix4().makeTranslation(i % 2 ? -0.085 : 0.085, 0, 0)),
      ),
    )
  }
  return parts
}

/** A microphone on a stand. The red disc it stands on is a separate, non-metal mesh. */
const DISC_H = 0.028
function tedx(seg: number): BufferGeometry[] {
  const mic = new Matrix4()
    .makeTranslation(0, 0.245, 0)
    .multiply(new Matrix4().makeRotationZ(-0.55))
  const at = (y: number): Matrix4 => mic.clone().multiply(new Matrix4().makeTranslation(0, y, 0))
  return [
    part(new CylinderGeometry(0.036, 0.044, 0.012, seg), GOLD, xf(0, DISC_H + 0.006, 0)),
    part(new CylinderGeometry(0.006, 0.006, 0.21, 8), GOLD, xf(0, DISC_H + 0.105, 0)),
    part(new CylinderGeometry(0.014, 0.01, 0.08, 12), GOLD, at(0.005)),
    part(new CylinderGeometry(0.019, 0.019, 0.008, 12), GOLD, at(0.047)),
    part(new SphereGeometry(0.028, 14, 10), GOLD, at(0.07)),
  ]
}

/** A medal hanging by its ribbon from a T-shaped stand, in silver. */
function usaco(seg: number): BufferGeometry[] {
  const my = 0.165
  const parts = [
    ...roundPlinth(PEWTER, seg),
    part(new CylinderGeometry(0.008, 0.008, 0.33 - PT, 8), SILVER, xf(0, (0.33 + PT) / 2, -0.012)),
    part(
      new CylinderGeometry(0.007, 0.007, 0.13, 8),
      SILVER,
      xf(0, 0.326, -0.012, 0, 0, Math.PI / 2),
    ),
    part(new CylinderGeometry(0.07, 0.07, 0.014, seg + 8), SILVER, xf(0, my, 0.012, Math.PI / 2)),
    part(new TorusGeometry(0.065, 0.006, 6, seg + 8), SILVER, xf(0, my, 0.012)),
    part(new TorusGeometry(0.011, 0.004, 5, 10), SILVER, xf(0, my + 0.076, 0.012)),
  ]
  for (const side of [-1, 1]) {
    parts.push(
      part(extrude(starShape(0.045, 0.019), 0.004, 0.003), SILVER, xf(0, my, 0.012 + side * 0.01)),
      part(
        rbox(0.026, 0.105, 0.004, 0.0015),
        SILVER,
        xf(side * 0.026, 0.283, 0, 0, 0, -side * 0.5),
      ),
    )
  }
  return parts
}

/** A running shoe, heel raised, on a long plinth. */
function half(): BufferGeometry[] {
  const upper = new Shape()
  upper.moveTo(-0.12, 0.02)
  upper.lineTo(0.1, 0.02)
  upper.quadraticCurveTo(0.136, 0.02, 0.13, 0.045)
  upper.quadraticCurveTo(0.11, 0.07, 0.04, 0.085)
  upper.lineTo(0.0, 0.126)
  upper.lineTo(-0.022, 0.118)
  upper.quadraticCurveTo(-0.045, 0.084, -0.075, 0.1)
  upper.lineTo(-0.116, 0.12)
  upper.quadraticCurveTo(-0.136, 0.07, -0.12, 0.02)
  const sole = new Shape()
  sole.moveTo(-0.13, 0)
  sole.lineTo(0.105, 0)
  sole.lineTo(0.146, 0.02)
  sole.lineTo(0.14, 0.034)
  sole.lineTo(-0.132, 0.036)
  sole.closePath()
  const pose = xf(0.01, PT + 0.027, 0, 0, 0, -0.2, 1.15)
  const laces = [
    [0.036, 0.094],
    [0.022, 0.108],
    [0.008, 0.122],
  ] as const
  return [
    ...boxPlinth(BRONZE, 0.33, 0.13),
    part(extrude(upper, 0.064, 0.011, 14), GOLD, pose),
    part(extrude(sole, 0.086, 0.003), BRONZE, pose),
    ...laces.map(([x, y]) =>
      part(rbox(0.02, 0.007, 0.07, 0.003), BRONZE, pose.clone().multiply(xf(x, y, 0, 0, 0, -0.78))),
    ),
    part(new CylinderGeometry(0.008, 0.008, 0.055, 8), GOLD, xf(-0.115, PT + 0.0275, 0)),
  ]
}

/** Gymnast rings hanging by straps from a small frame. */
function muscleup(seg: number): BufferGeometry[] {
  const parts = [
    ...boxPlinth(BRONZE, 0.28, 0.11),
    part(new CylinderGeometry(0.008, 0.008, 0.25, 8), GOLD, xf(0, 0.33, 0, 0, 0, Math.PI / 2)),
  ]
  for (const side of [-1, 1])
    parts.push(
      part(rbox(0.014, 0.335 - PT, 0.014, 0.004), GOLD, xf(side * 0.11, (0.335 + PT) / 2, 0)),
      part(rbox(0.009, 0.105, 0.003, 0.0012), BRONZE, xf(side * 0.046, 0.2775, 0)),
      part(
        new TorusGeometry(0.036, 0.0075, 8, seg),
        GOLD,
        xf(side * 0.046, 0.19, 0, 0, side * 0.3),
      ),
    )
  return parts
}

/** A loaded barbell resting on a rack over a bench. */
function bench(seg: number): BufferGeometry[] {
  const barY = 0.225
  const barZ = -0.02
  const parts = [
    ...boxPlinth(BRONZE, 0.3, 0.19),
    part(new CylinderGeometry(0.0055, 0.0055, 0.37, 8), GOLD, xf(0, barY, barZ, 0, 0, Math.PI / 2)),
    // the bench: a pad on two legs, pointing at the viewer
    part(rbox(0.058, 0.018, 0.17, 0.005), GOLD, xf(0, 0.118, 0.005)),
    part(rbox(0.044, 0.109 - PT, 0.012, 0.003), BRONZE, xf(0, (0.109 + PT) / 2, -0.06)),
    part(rbox(0.044, 0.109 - PT, 0.012, 0.003), BRONZE, xf(0, (0.109 + PT) / 2, 0.07)),
  ]
  const plates = [
    [0.122, 0.066, 0.013],
    [0.138, 0.066, 0.013],
    [0.153, 0.048, 0.011],
    [0.168, 0.013, 0.014],
  ] as const
  for (const side of [-1, 1]) {
    parts.push(
      part(
        rbox(0.012, barY - PT, 0.012, 0.003),
        GOLD,
        xf(side * 0.078, (barY + PT) / 2 - 0.004, barZ - 0.013),
      ),
      part(rbox(0.012, 0.008, 0.03, 0.0025), GOLD, xf(side * 0.078, barY - 0.01, barZ)),
      part(rbox(0.012, 0.02, 0.006, 0.0025), GOLD, xf(side * 0.078, barY, barZ + 0.012)),
    )
    for (const [x, r, w] of plates)
      parts.push(
        part(
          new CylinderGeometry(r, r, w, r > 0.03 ? seg : 10),
          r > 0.03 ? GOLD : BRONZE,
          xf(side * x, barY, barZ, 0, 0, Math.PI / 2),
        ),
      )
  }
  return parts
}

/** A curling wave crest with a smaller swell behind it. */
function swim(): BufferGeometry[] {
  const wave = new Shape()
  wave.moveTo(-0.13, 0)
  wave.quadraticCurveTo(-0.02, 0.03, 0.02, 0.2)
  wave.quadraticCurveTo(0.05, 0.25, 0.1, 0.21)
  wave.quadraticCurveTo(0.136, 0.185, 0.125, 0.14)
  wave.quadraticCurveTo(0.11, 0.175, 0.075, 0.17)
  wave.quadraticCurveTo(0.03, 0.16, 0.035, 0.09)
  wave.quadraticCurveTo(0.04, 0.03, 0.13, 0)
  wave.closePath()
  return [
    ...boxPlinth(BRONZE, 0.32, 0.12),
    part(extrude(wave, 0.04, 0.006), GOLD, xf(0, PT, 0.012, 0, 0, 0, 1.1)),
    part(extrude(wave, 0.03, 0.005), BRONZE, xf(-0.045, PT, -0.03, 0, 0, 0, 0.72)),
  ]
}

function build(id: TrophyId, seg: number): BufferGeometry {
  switch (id) {
    case 'vex':
      return merge(vex(seg))
    case 'scibowl':
      return merge(scibowl(seg))
    case 'tedx':
      return merge(tedx(seg))
    case 'usaco':
      return merge(usaco(seg))
    case 'half':
      return merge(half())
    case 'muscleup':
      return merge(muscleup(seg))
    case 'bench':
      return merge(bench(seg))
    case 'swim':
      return merge(swim())
  }
}

/** Where each trophy stands: `row` 0 is the lower shelf, `col` runs left to right as seen. */
const SPOTS: Record<TrophyId, { row: 0 | 1; col: number }> = {
  vex: { row: 1, col: 0 },
  scibowl: { row: 1, col: 1 },
  usaco: { row: 1, col: 2 },
  muscleup: { row: 1, col: 3 },
  // the disc lies flat, so it goes below eye level where its face shows
  tedx: { row: 0, col: 0 },
  half: { row: 0, col: 1 },
  bench: { row: 0, col: 2 },
  swim: { row: 0, col: 3 },
}

function buildCase(): BufferGeometry {
  const parts: BufferGeometry[] = []
  const box = (w: number, h: number, d: number, x: number, y: number, z: number): void => {
    const geo = new BoxGeometry(w, h, d)
    geo.translate(x, y, z)
    parts.push(geo)
  }
  const depth = FRONT_X - BACK_X
  const midX = (FRONT_X + BACK_X) / 2
  const inner = CASE_W - 0.08
  // back panel, sides, the two shelves, the top with a small overhang
  box(0.035, TOP_Y - SHELF_Y[0], inner, BACK_X + 0.0175, (TOP_Y + SHELF_Y[0]) / 2, CASE_Z)
  for (const side of [-1, 1])
    box(
      depth,
      TOP_Y - FLOOR_Y,
      0.04,
      midX,
      (TOP_Y + FLOOR_Y) / 2,
      CASE_Z + side * (CASE_W / 2 - 0.02),
    )
  for (const y of SHELF_Y) box(depth - 0.01, 0.035, inner, midX - 0.005, y - 0.0175, CASE_Z)
  box(depth + 0.04, 0.045, CASE_W + 0.08, midX + 0.02, TOP_Y + 0.0225, CASE_Z)
  // the cupboard below the lower shelf: carcass, kick board, two doors with a pull each
  const cupTop = SHELF_Y[0] - 0.035
  box(
    depth - 0.03,
    cupTop - FLOOR_Y - 0.06,
    inner,
    midX - 0.015,
    (cupTop + FLOOR_Y + 0.06) / 2,
    CASE_Z,
  )
  box(depth - 0.07, 0.06, inner, midX - 0.035, FLOOR_Y + 0.03, CASE_Z)
  for (const side of [-1, 1]) {
    box(
      0.018,
      cupTop - FLOOR_Y - 0.12,
      inner / 2 - 0.035,
      FRONT_X - 0.024,
      (cupTop + FLOOR_Y + 0.06) / 2,
      CASE_Z + side * (inner / 4 + 0.003),
    )
    box(0.022, 0.09, 0.022, FRONT_X - 0.006, (cupTop + FLOOR_Y + 0.06) / 2, CASE_Z + side * 0.06)
  }
  const merged = mergeGeometries(parts, false)
  if (!merged) throw new Error('trophies: case merge failed')
  return merged
}

interface Trophy {
  id: TrophyId
  mesh: Mesh
  material: MeshStandardMaterial
  home: Vector3
  height: number
  /** `state.time` when it was first seen visited; null while unvisited. */
  visitedAt: number | null
  /** Visited, not yet stamped with a time: the next `update` does that. */
  fresh: boolean
}

/**
 * The trophies' own reflection: three's neutral studio room with a warm key panel, so flat gold
 * faces catch bright gradients and a warm edge. `size` matches the scene's PMREM so the metal
 * keeps the shader program it was compiled with.
 */
function studio(renderer: WebGLRenderer, size: number): Texture {
  const room = new RoomEnvironment()
  let i = 0
  room.traverse((o) => {
    if (!(o instanceof Mesh)) return
    // darker walls and boxes: grazing reflections stay deep and the panels carry the shine
    if (o.material instanceof MeshStandardMaterial) o.material.color.setScalar(0.22)
    if (!(o.material instanceof MeshLambertMaterial)) return
    // the panels in order: -x right, -x left, +x, +z, -z, +y
    if (i === 3) o.material.emissive.set('#ffd9a0')
    else if (i === 2) o.material.emissive.set('#ffe6c4')
    else if (i === 5) o.material.emissive.set('#ffeccf')
    i++
  })
  const pmrem = new PMREMGenerator(renderer)
  const target = pmrem.fromScene(room, 0.02, 0.1, 100, { size })
  pmrem.dispose()
  room.dispose()
  return target.texture
}

const UP = new Vector3(0, 1, 0)

export function createTrophies(mats: Materials, quality: Quality): WorldPart & Interactive {
  const group = new Group()
  const seg = quality.tier === 'high' ? 40 : 28

  const caseMesh = new Mesh(buildCase(), mats.woodDark)
  caseMesh.castShadow = true
  caseMesh.receiveShadow = true
  group.add(caseMesh)

  // White base colour: the vertex colours carry the metal's tint. Each trophy gets its own
  // instance (one shader program between them) so its glow can be driven alone. `envMap` is set
  // once the studio reflection exists (see `studio`); until then the scene's sky stands in.
  const metal = new MeshStandardMaterial({
    metalness: 1,
    roughness: ROUGHNESS,
    envMapIntensity: SHINE,
    vertexColors: true,
    emissive: new Color('#ffc861'),
    emissiveIntensity: GLOW,
  })
  const red = new MeshStandardMaterial({ color: new Color('#b3261e'), roughness: 0.8 })
  const pickGeo = new BoxGeometry(0.34, 0.38, 0.24)
  pickGeo.translate(0, 0.19, 0)
  // Never drawn (the renderer skips a material that is not visible) but still hit by a ray.
  const pickMat = new MeshBasicMaterial({ visible: false })

  let gl: WebGLRenderer | null = null
  let env: Texture | null = null
  let envSize = 256

  const slot = (CASE_W - 0.08) / 4
  const trophies: Trophy[] = []
  const pickables: Pickable[] = []
  TROPHY_IDS.forEach((id) => {
    const geo = build(id, seg)
    geo.computeBoundingBox()
    const material = metal.clone()
    // silver keeps its colour: the same glow, without the amber
    if (id === 'usaco') material.emissive.set('#d9d4cc')
    const mesh = new Mesh(geo, material)
    mesh.castShadow = false
    mesh.receiveShadow = false
    const spot = SPOTS[id]
    // Seen from the room, left is +z.
    const home = new Vector3(TROPHY_X, SHELF_Y[spot.row], CASE_Z + (1.5 - spot.col) * slot)
    mesh.position.copy(home)
    mesh.rotation.y = SHELF_YAW
    if (id === 'tedx') {
      const disc = new Mesh(new CylinderGeometry(0.115, 0.115, DISC_H, seg + 12), red)
      disc.position.y = DISC_H / 2
      disc.castShadow = false
      disc.receiveShadow = false
      mesh.add(disc)
    }
    // The studio reflection needs the renderer, which only a draw hands over: note it here and
    // build the reflection in the next `update`, outside any render.
    mesh.onBeforeRender = (renderer, scene) => {
      if (env || gl) return
      gl = renderer
      const h = (scene.environment?.image as { height?: unknown } | undefined)?.height
      envSize = typeof h === 'number' && h > 0 ? h / 4 : 256
    }
    const target = new Mesh(pickGeo, pickMat)
    mesh.add(target)
    group.add(mesh)
    trophies.push({
      id,
      mesh,
      material,
      home,
      height: geo.boundingBox?.max.y ?? 0.3,
      visitedAt: null,
      fresh: false,
    })
    pickables.push({ id, kind: 'trophy', object: target })
  })

  let hovered: string | null = null
  let open: OpenState | null = null
  let reduced = false
  let portrait = false
  const eye = new Vector3()
  const dir = new Vector3(-1, 0, 0)
  const right = new Vector3()
  const hover = new Vector3()

  function rest(t: Trophy): void {
    t.mesh.position.copy(t.home)
    t.mesh.rotation.y = SHELF_YAW
    t.mesh.scale.setScalar(1)
  }

  /** Shelf to hover point: a closed form of `k` and `since`, nothing carried between frames. */
  function fly(t: Trophy, k: number, since: number): void {
    const s = since / 1000
    const scale = portrait ? HOVER_SCALE_PORTRAIT : HOVER_SCALE
    hover.copy(eye).addScaledVector(dir, HOVER_DIST)
    if (portrait) hover.y += HOVER_RISE_PORTRAIT
    else hover.addScaledVector(right, -HOVER_LEFT)
    // the mesh's origin is its base: centre the body on the point
    hover.y -= (t.height * scale) / 2
    let yaw = 0
    let lift = 0
    if (!reduced) {
      hover
        .addScaledVector(right, CIRCLE_RADIUS * Math.cos(s * CIRCLE_RATE))
        .addScaledVector(dir, CIRCLE_RADIUS * Math.sin(s * CIRCLE_RATE))
      hover.y += BOB_HEIGHT * Math.sin(s * BOB_RATE)
      // several quick turns that ease out as it arrives, then a slow turn on its own axis
      yaw = SPIN_TURNS * Math.PI * 2 * (1 - (1 - k) * (1 - k)) + k * TURN_RATE * s
      lift = ARC_HEIGHT * Math.sin(Math.PI * k)
    }
    t.mesh.position.lerpVectors(t.home, hover, k)
    t.mesh.position.y += lift
    // turn from facing the room to facing the camera, the short way round
    const face = Math.atan2(-dir.x, -dir.z)
    const turn = Math.atan2(Math.sin(face - SHELF_YAW), Math.cos(face - SHELF_YAW))
    t.mesh.rotation.y = SHELF_YAW + turn * k + yaw
    t.mesh.scale.setScalar(1 + (scale - 1) * k)
  }

  return {
    group,
    pickables,
    setHover(id) {
      hovered = id
    },
    setVisited(ids) {
      for (const t of trophies) if (t.visitedAt === null && ids.has(t.id)) t.fresh = true
    },
    setOpen(next, camera: PerspectiveCamera) {
      open = next && next.k > 0 ? { id: next.id, k: Math.min(1, next.k), since: next.since } : null
      eye.copy(camera.position)
      dir.set(0, 0, -1).applyQuaternion(camera.quaternion)
      right.crossVectors(dir, UP).normalize()
      portrait = camera.aspect < 1
    },
    update(state: SceneState) {
      reduced = state.reduced
      if (gl && !env) {
        env = studio(gl, envSize)
        for (const t of trophies) t.material.envMap = env
      }
      const mine = open !== null && trophies.some((t) => t.id === open?.id)
      for (const t of trophies) {
        const isOpen = open !== null && t.id === open.id
        if (isOpen && open) fly(t, open.k, open.since)
        else rest(t)
        if (t.fresh) {
          t.visitedAt = state.time
          t.fresh = false
        }
        // 1 while unvisited, easing to 0 over a second once visited (at once under reduced motion)
        let live = 1
        if (t.visitedAt !== null) {
          const u = reduced ? 1 : Math.min(1, Math.max(0, (state.time - t.visitedAt) / SETTLE_MS))
          live = 1 - u * u * (3 - 2 * u)
        }
        let glow = GLOW_VISITED + (GLOW - GLOW_VISITED) * live
        if (!reduced) glow *= 1 + GLOW_SWING * live * (beat(state.time) - 0.25)
        if (t.id === hovered) glow = Math.max(glow, GLOW) * GLOW_HOVER
        let shine = SHINE
        if (open && mine) {
          glow *= isOpen ? 1 + (GLOW_OPEN - 1) * open.k : 1 - (1 - GLOW_DIMMED) * open.k
          if (!isOpen) shine *= 1 - (1 - SHINE_DIMMED) * open.k
        }
        t.material.emissiveIntensity = glow
        t.material.envMapIntensity = shine
      }
    },
  }
}
