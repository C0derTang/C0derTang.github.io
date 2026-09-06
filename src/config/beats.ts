import { clamp01 } from '../util/math'

/** Beat boundaries as fractions of total scroll. Single source of truth for timing. */
export const BEATS = {
  exterior: [0.0, 0.15],
  enter: [0.15, 0.32],
  /** the look-around inside the house: a full pan across its four faces */
  turn: [0.32, 0.5],
  doors: [0.5, 0.58],
  paddy: [0.58, 0.76],
  dive: [0.76, 0.85],
  underwater: [0.85, 1.0],
} as const satisfies Record<string, readonly [number, number]>

export type BeatId = keyof typeof BEATS
export const BEAT_IDS = Object.keys(BEATS) as BeatId[]

/** Local 0..1 progress inside a beat range. */
export const local = (t: number, range: readonly [number, number]): number =>
  clamp01((t - range[0]) / (range[1] - range[0]))

export function beatAt(t: number): BeatId {
  let current: BeatId = 'exterior'
  for (const id of BEAT_IDS) if (t >= BEATS[id][0]) current = id
  return current
}

/** Design canvas every layer is authored on. VP = the point all layers scale about. */
export const DESIGN = { w: 1600, h: 1200, vp: { x: 800, y: 700 } } as const
/** Focal length in design px (P in the projection). */
export const FOCAL = 1000

/** Total scroll length in vh per quality tier. */
export const SCROLL_LEN_VH = { high: 1000, low: 750 } as const

/** Camera path keys [t, value] in design px; interpolated with a monotone cubic. */
export const CAM_Z_KEYS = [
  [0, 0],
  [0.04, 0],
  [0.15, 400],
  [0.3, 1400],
  [0.5, 1400],
  [0.58, 2000],
  [0.68, 3000],
  [0.76, 3400],
  [0.78, 3400],
  [1, 3400],
] as const
export const CAM_Y_KEYS = [
  [0, 0],
  [0.76, 0],
  [0.85, 520],
  [1, 560],
] as const
export const CAM_X_KEYS = [
  [0, -40],
  [0.3, 0],
  [1, 0],
] as const

/** Overlay slot windows: [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd] in t. */
export const SLOTS = [
  { id: 'exterior', window: [0.02, 0.06, 0.11, 0.14] },
  { id: 'interior', window: [0.385, 0.395, 0.415, 0.425] },
  { id: 'paddy', window: [0.66, 0.7, 0.74, 0.77] },
  { id: 'underwater', window: [0.89, 0.93, 1.5, 2] },
] as const satisfies readonly { id: string; window: readonly [number, number, number, number] }[]

export type SlotId = (typeof SLOTS)[number]['id']
