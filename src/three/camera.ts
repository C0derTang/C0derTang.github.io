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
  [T.doors[1], 64],
  [T.paddy[0] + 0.04, 58],
  [1, 58],
])
/** Long eased turns between exact holds, so wheel gestures cannot flick past a room face. */
const faces = track([
  [T.turn[0], 0],
  [0.329, 0],
  [0.357, 1],
  [0.371, 1],
  [0.401, 2],
  [0.419, 2],
  [0.449, 3],
  [0.463, 3],
  [0.492, 4],
  [T.turn[1], 4],
])

export const turnFaces = (t: number): number => (t < T.turn[0] || t > T.turn[1] ? 0 : faces(t))

export function cameraPose(t: number): Pose {
  const x = px(t)
  const y = py(t)
  const z = pz(t)
  let lx = tx(t)
  let ly = ty(t)
  let lz = tz(t)
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
