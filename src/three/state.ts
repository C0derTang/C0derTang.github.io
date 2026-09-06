import { BEATS, BEAT_IDS, SLOTS, beatAt, local, type BeatId, type SlotId } from '../config/beats'
import type { Quality } from '../config/quality'
import { clamp, easeInOutCubic, lerpColor, monotoneCubic, smoothstep } from '../util/math'
import { cameraPose, type Pose } from './camera'

/** Still-water surface height of the paddy (and the puddles). */
export const WATER_Y = -0.3

export interface SceneState {
  t: number
  time: number
  dt: number
  beat: BeatId
  u: Record<BeatId, number>
  pose: Pose
  doors: number
  /** 0 above the surface, growing with depth below it (metres) */
  depth: number
  underwater: boolean
  fog: { color: string; density: number }
  sun: { intensity: number; color: string }
  sky: number
  lamp: number
  focus: { distance: number; range: number; bokeh: number }
  grade: { tint: string; strength: number; vignette: number; saturation: number }
  rain: { alpha: number; speed: number; slant: number; windX: number; windZ: number }
  slots: Record<SlotId, number>
  hint: number
  reduced: boolean
  scrollVel: number
}

const slotOpacity = (t: number, w: readonly [number, number, number, number]): number =>
  smoothstep(w[0], w[1], t) * (1 - smoothstep(w[2], w[3], t))

const T = BEATS
const num = (keys: readonly (readonly [number, number])[]) => monotoneCubic(keys)
const col =
  (keys: readonly (readonly [number, string])[]) =>
  (t: number): string => {
    let a = keys[0]
    let b = keys[keys.length - 1]
    if (!a || !b) return '#000000'
    for (let i = 0; i < keys.length - 1; i++) {
      const p = keys[i]
      const q = keys[i + 1]
      if (p && q && t >= p[0] && t <= q[0]) {
        a = p
        b = q
        break
      }
    }
    const span = b[0] - a[0]
    return lerpColor(a[1], b[1], span > 0 ? clamp((t - a[0]) / span, 0, 1) : 0)
  }

// Atmosphere keys: outside a grey-blue rain haze, inside a faint warm haze, underwater teal.
const fogColor = col([
  [0, '#b9c3c6'],
  [T.enter[0], '#b9c3c6'],
  [T.enter[1], '#8d8378'],
  [T.doors[1], '#8d8378'],
  [T.paddy[0] + 0.03, '#b6c0c1'],
  [0.79, '#b6c0c1'],
  [0.81, '#2f6b6a'],
  [1, '#1e4f5a'],
])
const fogDensity = num([
  [0, 0.028],
  [T.enter[0], 0.028],
  [T.enter[1], 0.06],
  [T.doors[1], 0.06],
  [T.paddy[0] + 0.03, 0.022],
  [0.79, 0.022],
  [0.81, 0.16],
  [1, 0.18],
])
const sunIntensity = num([
  [0, 1.1],
  [T.enter[0], 1.1],
  [T.enter[1], 0.35],
  [T.doors[1], 0.35],
  [T.paddy[0] + 0.03, 1.2],
  [0.79, 1.2],
  [0.81, 0.25],
  [1, 0.2],
])
const skyIntensity = num([
  [0, 0.7],
  [T.enter[1], 0.35],
  [T.doors[1], 0.35],
  [T.paddy[0] + 0.03, 0.75],
  [0.79, 0.75],
  [0.81, 0.3],
  [1, 0.3],
])
const lamp = num([
  [0, 3],
  [T.exterior[1], 3],
  [T.enter[1], 9],
  [T.doors[1], 9],
  [T.paddy[0] + 0.04, 2],
  [1, 0],
])
const focusDistance = num([
  [0, 12],
  [T.exterior[1], 6],
  [T.enter[1], 3.4],
  [T.doors[1], 3],
  [T.paddy[0] + 0.03, 18],
  [0.79, 12],
  [0.81, 3],
  [1, 3],
])
const focusRange = num([
  [0, 10],
  [T.enter[1], 3],
  [T.doors[1], 3],
  [T.paddy[0] + 0.03, 20],
  [0.79, 14],
  [0.81, 2.5],
  [1, 2.5],
])
const bokeh = num([
  [0, 2.5],
  [T.enter[1], 3],
  [T.doors[1], 3],
  [T.paddy[0] + 0.03, 2],
  [0.79, 2],
  [0.81, 4],
  [1, 4],
])
const gradeTint = col([
  [0, '#6f8090'],
  [T.enter[0], '#6f8090'],
  [T.enter[1], '#8a6a4a'],
  [T.doors[1], '#8a6a4a'],
  [T.paddy[0] + 0.03, '#7f9a8c'],
  [0.79, '#7f9a8c'],
  [0.81, '#2f6b6a'],
  [1, '#1e4f5a'],
])
const gradeStrength = num([
  [0, 0.16],
  [T.enter[1], 0.22],
  [T.doors[1], 0.22],
  [T.paddy[0] + 0.03, 0.14],
  [0.79, 0.14],
  [0.81, 0.35],
  [1, 0.35],
])
const vignette = num([
  [0, 0.35],
  [T.enter[1], 0.5],
  [T.doors[1], 0.5],
  [T.paddy[0] + 0.03, 0.3],
  [0.79, 0.3],
  [0.81, 0.55],
  [1, 0.55],
])
const saturation = num([
  [0, 0.88],
  [0.79, 0.88],
  [0.81, 0.8],
  [1, 0.8],
])
const rainAlpha = num([
  [0, 1],
  [0.78, 1],
  [0.805, 0],
  [1, 0],
])

/** Camera z rate (m per t) for the apparent rain speed, by finite difference. */
const czRate = (t: number): number =>
  (cameraPose(Math.min(1, t + 1e-3)).z - cameraPose(Math.max(0, t - 1e-3)).z) / 2e-3

/**
 * Pure: everything the renderer and the DOM need for one frame, derived from t (plus time for
 * time-based motion and the scroll velocity for the apparent rain). Reduced motion snaps the
 * camera to per-beat stills.
 */
export function computeState(
  t: number,
  time: number,
  dt: number,
  scrollVel: number,
  quality: Quality,
): SceneState {
  const beat = beatAt(t)
  const u = {} as Record<BeatId, number>
  for (const id of BEAT_IDS) u[id] = local(t, BEATS[id])

  let poseT = t
  if (quality.reducedMotion) {
    const [, end] = BEATS[beat]
    poseT = beat === 'exterior' ? 0.04 : beat === 'turn' ? 0.405 : Math.min(end, BEATS.paddy[1])
  }
  const pose = cameraPose(poseT)
  const doors = quality.reducedMotion
    ? t >= BEATS.doors[0] + 0.02
      ? 1
      : 0
    : easeInOutCubic(u.doors)
  const depth = Math.max(0, WATER_Y - pose.y)
  const underwater = depth > 0.03

  // Apparent rain: scrolling toward the rain hurries and stretches it; the world wind blows
  // from the left of the yard view, so the slant follows the yaw during the turn.
  const yawRad = (pose.yaw * Math.PI) / 180
  const speed = 1 + clamp(Math.abs(scrollVel * czRate(t)) / 40, 0, 1.5)
  const slant = Math.cos(yawRad)
  const windStrength = 0.35 + 0.25 * smoothstep(BEATS.paddy[0], BEATS.paddy[1], t)

  const slots = {} as Record<SlotId, number>
  for (const s of SLOTS) slots[s.id] = slotOpacity(t, s.window)

  return {
    t,
    time,
    dt,
    beat,
    u,
    pose,
    doors,
    depth,
    underwater,
    fog: { color: fogColor(t), density: fogDensity(t) },
    sun: { intensity: sunIntensity(t), color: '#d7dde0' },
    sky: skyIntensity(t),
    lamp: lamp(t),
    focus: { distance: focusDistance(t), range: focusRange(t), bokeh: bokeh(t) },
    grade: {
      tint: gradeTint(t),
      strength: gradeStrength(t),
      vignette: vignette(t),
      saturation: saturation(t),
    },
    rain: {
      alpha: rainAlpha(t),
      speed,
      slant,
      windX: windStrength * slant,
      windZ: -0.1 * windStrength * Math.sin(yawRad),
    },
    slots,
    hint: 1 - smoothstep(0.03, 0.05, t),
    reduced: quality.reducedMotion,
    scrollVel,
  }
}
