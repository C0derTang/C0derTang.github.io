import { BEATS } from '../config/beats'
import { monotoneCubic, type Key } from '../util/math'

/**
 * The camera path in metres (+y up, the house doorway at the origin, the camera starts at +z
 * looking toward -z). Position and look target are monotone cubics per axis keyed by t (flat
 * key pairs are exact holds, no overshoot), so the pose is a pure function of t. During the
 * turn the look direction is rotated about +y by the yaw track instead of following the target.
 */
export interface Pose {
  x: number
  y: number
  z: number
  tx: number
  ty: number
  tz: number
  fov: number
  /** yaw in degrees during the turn (0 = facing the back shoji, 90 = right wall) */
  yaw: number
}

const T = BEATS
const track = (keys: readonly Key[]) => monotoneCubic(keys)

const px = track([
  [0, -0.8],
  [T.exterior[1], 0],
  [T.enter[0] + 0.055, 0],
  // Step beside the hearth so the centered kettle and chain stay clear of the walking line.
  [T.enter[1] - 0.04, -0.95],
  [T.doors[0] + 0.05, -0.95],
  [T.doors[1], 0],
  [1, 0],
])
const py = track([
  [0, 1.7],
  [T.exterior[1], 1.55],
  [T.enter[1], 1.45],
  [T.doors[1], 1.45],
  [T.paddy[1], 1.3],
  [0.785, 0.7],
  [0.8, -0.45],
  [T.dive[1], -1.3],
  [1, -1.5],
])
const pz = track([
  [0, 18],
  [T.exterior[1], 9],
  [T.enter[1], -3.2],
  [T.turn[1], -3.2],
  [T.doors[1], -5.6],
  [T.paddy[1], -22],
  [T.dive[1], -25],
  [1, -34],
])
const tx = track([
  [0, 0],
  [T.enter[1] - 0.04, 0],
  [T.enter[1], -0.95],
  [T.turn[1], -0.95],
  [T.doors[1], 0],
  [1, 0],
])
const ty = track([
  [0, 1.4],
  [T.doors[1], 1.4],
  [T.paddy[1], 1.0],
  [0.79, 0.1],
  [0.805, -1.0],
  [T.dive[1], -1.5],
  [1, -1.6],
])
const tz = track([
  [0, 0],
  [T.exterior[1], 0],
  [T.enter[0] + 0.03, -7],
  [T.doors[1], -7],
  [T.paddy[0] + 0.02, -60],
  [T.paddy[1], -60],
  [0.8, -30],
  [T.dive[1], -60],
  [1, -60],
])
const fov = track([
  [0, 55],
  [T.exterior[1], 55],
  [T.enter[1], 64],
  // A touch wider at the banner hold, so the 4.4 m of banners fits a portrait phone from 4.5 m.
  [0.329, 64],
  [0.357, 66],
  [0.371, 66],
  [0.401, 64],
  [T.doors[1], 64],
  [T.paddy[0] + 0.04, 58],
  [1, 58],
])
/**
 * The walk around the hearth during the turn, as offsets from the standing point beside it
 * (-0.95, -3.2). They move the position and the look target together, so the yaw track alone
 * sets the view direction and every hold faces its wall squarely:
 * - banner hold (yaw 90): east of the hearth at (0.7, -3.4), square to the middle of the +x
 *   wall with the kettle and its chain behind the camera; reached by passing behind the pit;
 * - front hold (yaw 180): the same spot;
 * - trophy hold (yaw 270): (-2.7, -4.9), about 2.4 m in front of the case on the -x wall,
 *   reached behind the pit again (z leads x, so the path clears the pit's far lip at z -4.08);
 * then straight back to the standing point, where the doors beat starts unchanged.
 */
const BANNER_HOLD = [0.357, 0.371] as const
const FRONT_HOLD = [0.401, 0.419] as const
const TROPHY_HOLD = [0.449, 0.463] as const
const walkX = track([
  [T.turn[0], 0],
  [0.329, 0],
  [BANNER_HOLD[0], 1.65],
  [FRONT_HOLD[1], 1.65],
  [TROPHY_HOLD[0], -1.75],
  [TROPHY_HOLD[1], -1.75],
  [T.turn[1], 0],
  [1, 0],
])
const walkZ = track([
  [T.turn[0], 0],
  [0.329, 0],
  [0.343, -1.3],
  [BANNER_HOLD[0], -0.2],
  [FRONT_HOLD[1], -0.2],
  [0.434, -1.7],
  [TROPHY_HOLD[1], -1.7],
  [T.turn[1], 0],
  [1, 0],
])
const inTurn = (t: number): boolean => t > T.turn[0] && t < T.turn[1]

/** Long eased turns between exact holds, so wheel gestures cannot flick past a room face. */
const faces = track([
  [T.turn[0], 0],
  [0.329, 0],
  [BANNER_HOLD[0], 1],
  [BANNER_HOLD[1], 1],
  [FRONT_HOLD[0], 2],
  [FRONT_HOLD[1], 2],
  [TROPHY_HOLD[0], 3],
  [TROPHY_HOLD[1], 3],
  [0.492, 4],
  [T.turn[1], 4],
])

export const turnFaces = (t: number): number => (t < T.turn[0] || t > T.turn[1] ? 0 : faces(t))

export function cameraPose(t: number): Pose {
  const ox = inTurn(t) ? walkX(t) : 0
  const oz = inTurn(t) ? walkZ(t) : 0
  const x = px(t) + ox
  const y = py(t)
  const z = pz(t) + oz
  let lx = tx(t) + ox
  let ly = ty(t)
  let lz = tz(t) + oz
  const yaw = turnFaces(t) * 90
  if (yaw > 0 && yaw < 360) {
    // Rotate the base look direction about +y: +90 faces +x (the right wall).
    const dx = lx - x
    const dz = lz - z
    const a = (-yaw * Math.PI) / 180
    const rx = dx * Math.cos(a) + dz * Math.sin(a)
    const rz = -dx * Math.sin(a) + dz * Math.cos(a)
    lx = x + rx
    lz = z + rz
    ly = y + (ly - y)
  }
  return { x, y, z, tx: lx, ty: ly, tz: lz, fov: fov(t), yaw: yaw % 360 }
}
