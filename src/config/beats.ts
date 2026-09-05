import { clamp01 } from '../util/math'

/** Beat boundaries as fractions of total scroll. Single source of truth for timing. */
export const BEATS = {
  exterior: [0.0, 0.18],
  enter: [0.18, 0.42],
  doors: [0.42, 0.52],
  paddy: [0.52, 0.74],
  dive: [0.74, 0.84],
  underwater: [0.84, 1.0],
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

/** Total scroll length in vh per quality tier. */
export const SCROLL_LEN_VH = { high: 800, low: 600 } as const

/** Camera path keys [t, value] in design px; interpolated with a monotone cubic. */
export const CAM_Z_KEYS = [
  [0, 0],
  [0.05, 0],
  [0.18, 400],
  [0.42, 1500],
  [0.52, 2000],
  [0.64, 3000],
  [0.74, 3400],
  [0.76, 3400],
  [1, 3400],
] as const
export const CAM_Y_KEYS = [
  [0, 0],
  [0.74, 0],
  [0.84, 520],
  [1, 560],
] as const
export const CAM_X_KEYS = [
  [0, -40],
  [0.42, 0],
  [1, 0],
] as const

/** Overlay slot windows: [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd] in t. */
export const SLOTS = [
  { id: 'exterior', window: [0.02, 0.06, 0.13, 0.17] },
  { id: 'interior', window: [0.33, 0.37, 0.47, 0.51] },
  { id: 'paddy', window: [0.62, 0.66, 0.72, 0.76] },
  { id: 'underwater', window: [0.88, 0.92, 1.5, 2] },
] as const satisfies readonly { id: string; window: readonly [number, number, number, number] }[]

export type SlotId = (typeof SLOTS)[number]['id']
