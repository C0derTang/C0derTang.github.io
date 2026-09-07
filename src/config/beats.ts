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

/** Relative scroll distance per unit of scene progress. Exterior pacing stays unchanged. */
const SCROLL_WEIGHTS: Record<BeatId, number> = {
  exterior: 1,
  enter: 1.5,
  turn: 3,
  doors: 1.5,
  paddy: 1,
  dive: 1,
  underwater: 1,
}
const SCROLL_WEIGHT = BEAT_IDS.reduce(
  (sum, id) => sum + (BEATS[id][1] - BEATS[id][0]) * SCROLL_WEIGHTS[id],
  0,
)
let scrollCursor = 0
export const SCROLL_SEGMENTS = BEAT_IDS.map((id) => {
  const scene = BEATS[id]
  const start = scrollCursor
  scrollCursor += ((scene[1] - scene[0]) * SCROLL_WEIGHTS[id]) / SCROLL_WEIGHT
  return { id, scene, scroll: [start, scrollCursor] as const }
})

/** Scrollable distance plus one viewport, so unweighted exterior metres retain their pace. */
export const SCROLL_LEN_VH = {
  high: 100 + 900 * SCROLL_WEIGHT,
  low: 100 + 650 * SCROLL_WEIGHT,
} as const

/** Pure reversible mapping: the scene keeps its existing keyed t, including dev seeks. */
export function scrollToStory(progress: number): number {
  const p = clamp01(progress)
  for (const segment of SCROLL_SEGMENTS) {
    if (p <= segment.scroll[1])
      return segment.scene[0] + local(p, segment.scroll) * (segment.scene[1] - segment.scene[0])
  }
  return 1
}

export function storyToScroll(t: number): number {
  const p = clamp01(t)
  for (const segment of SCROLL_SEGMENTS) {
    if (p <= segment.scene[1])
      return segment.scroll[0] + local(p, segment.scene) * (segment.scroll[1] - segment.scroll[0])
  }
  return 1
}

/** Derivative dt / d(scroll progress), used for the apparent rain velocity. */
export const storyProgressRate = (t: number): number => SCROLL_WEIGHT / SCROLL_WEIGHTS[beatAt(t)]

/** Overlay slot windows: [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd] in t. */
export const SLOTS = [
  { id: 'exterior', window: [-0.02, 0, 0.08, 0.14] },
  { id: 'interior', window: [0.35, 0.375, 0.44, 0.465] },
  { id: 'paddy', window: [0.63, 0.66, 0.73, 0.76] },
  { id: 'underwater', window: [0.89, 0.93, 1.5, 2] },
] as const satisfies readonly { id: string; window: readonly [number, number, number, number] }[]

export type SlotId = (typeof SLOTS)[number]['id']
