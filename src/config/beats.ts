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

/** Total scroll length in vh per quality tier. */
export const SCROLL_LEN_VH = { high: 1000, low: 750 } as const

/** Overlay slot windows: [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd] in t. */
export const SLOTS = [
  { id: 'exterior', window: [0.02, 0.06, 0.11, 0.14] },
  { id: 'interior', window: [0.385, 0.395, 0.415, 0.425] },
  { id: 'paddy', window: [0.66, 0.7, 0.74, 0.77] },
  { id: 'underwater', window: [0.89, 0.93, 1.5, 2] },
] as const satisfies readonly { id: string; window: readonly [number, number, number, number] }[]

export type SlotId = (typeof SLOTS)[number]['id']
