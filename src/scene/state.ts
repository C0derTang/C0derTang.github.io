import { BEATS, BEAT_IDS, SLOTS, beatAt, local, type BeatId, type SlotId } from '../config/beats'
import { AIR } from '../config/layers'
import type { Quality } from '../config/quality'
import { gradeAt } from '../fx/grade'
import { easeInOutCubic, easeInOutSine, easeOutCubic, lerp, smoothstep } from '../util/math'
import { camera, designRectToScreen, designToScreen, project } from './camera'
import { DOORWAY, HOUSE, LAMP, PADDY, SHOJI, openingRect } from './geometry'
import type { Cam, Pt, Rect, SceneState, StageSize } from './types'

const slotOpacity = (t: number, w: readonly [number, number, number, number]): number =>
  smoothstep(w[0], w[1], t) * (1 - smoothstep(w[2], w[3], t))

/**
 * Pure: everything the DOM and canvases need for one frame, derived from t (plus time for the
 * time-based fx). Reduced motion snaps the camera to per-beat stills.
 */
export function computeState(
  t: number,
  time: number,
  dt: number,
  size: StageSize,
  quality: Quality,
): SceneState {
  const beat = beatAt(t)
  const u = {} as Record<BeatId, number>
  for (const id of BEAT_IDS) u[id] = local(t, BEATS[id])

  let cam: Cam = camera(t)
  let doors = easeInOutCubic(u.doors)
  const uDive = u.dive
  const uw = u.underwater

  if (quality.reducedMotion) {
    // Stills: hold each beat's end camera; boundaries fade through dark (see grade below).
    const [, end] = BEATS[beat]
    cam = camera(beat === 'exterior' ? 0.04 : Math.min(end, 0.74))
    doors = t >= BEATS.doors[0] + 0.02 ? 1 : 0
  }

  const H = size.h
  const wl = lerp(1.1 * H, -0.1 * H, easeInOutSine(uDive))
  const sinkTy = lerp(0.35 * H, 0, easeOutCubic(uDive))
  const airVisible = wl > -0.1 * H + 0.5
  const waterVisible = uDive > 0

  // Rain: outside = follows the front wall; inside = through openings; paddy = full.
  const houseP = project(AIR.house, cam, size.unit)
  const shojiP = project(AIR.shoji, cam, size.unit)
  const houseVisible = t <= AIR.house.range[1] && !houseP.hidden && houseP.opacity > 0.001
  const shojiVisible = t <= AIR.shoji.range[1] && !shojiP.hidden && shojiP.opacity > 0.001
  const portal = houseVisible ? designRectToScreen(DOORWAY, houseP, size) : null
  let rainAlpha: number
  let rainClip: Rect[] | null = null
  let groundY: number | null = null
  let eave: { x0: number; x1: number; y: number } | null = null
  if (!airVisible) {
    rainAlpha = 0
  } else if (houseVisible) {
    rainAlpha = houseP.opacity
    groundY = designToScreen({ x: 800, y: HOUSE.gravelY }, houseP, size).y
    const e0 = designToScreen({ x: 300, y: HOUSE.eaveY }, houseP, size)
    const e1 = designToScreen({ x: 1330, y: HOUSE.eaveY }, houseP, size)
    eave = { x0: e0.x, x1: e1.x, y: e0.y }
  } else if (shojiVisible && shojiP.opacity > 0.5) {
    rainAlpha = 1
    rainClip = [
      designRectToScreen(openingRect(doors), shojiP, size),
      designRectToScreen(SHOJI.sideWindow, shojiP, size),
    ]
  } else {
    rainAlpha = 1
  }

  // Ripples on the paddy water (only once the paddy layers exist and the air stage shows).
  const paddyP = project(AIR.paddyPlane, cam, size.unit)
  const paddyOn = airVisible && t >= AIR.paddyPlane.range[0] && !paddyP.hidden
  let polygon: Pt[] | null = null
  let horizonY = H
  if (paddyOn) {
    polygon = PADDY.water.map(([x, y]) => designToScreen({ x, y }, paddyP, size))
    horizonY = designToScreen({ x: 800, y: PADDY.horizonY }, paddyP, size).y
  }
  const rippleStrength = paddyOn ? (shojiVisible ? doors : 1) : 0

  // Grade + glow position.
  const grade = gradeAt(t)
  if (t < 0.52) {
    const roomP = project(AIR.interiorRoom, cam, size.unit)
    if (!roomP.hidden) {
      const lp = designToScreen(LAMP, roomP, size)
      grade.glowX = lp.x / size.w
      grade.glowY = lp.y / size.h
    }
  } else if (t < 0.74) {
    grade.glowX = size.vx / size.w
    grade.glowY = size.vy / size.h
  } else {
    grade.glowX = 0.5
    grade.glowY = 0.08
  }
  if (quality.reducedMotion) {
    // Fade through dark near beat boundaries so stills swap invisibly.
    let dark = 0
    for (const id of BEAT_IDS) {
      const edge = BEATS[id][0]
      if (edge > 0) dark = Math.max(dark, 1 - smoothstep(0, 0.02, Math.abs(t - edge)))
    }
    grade.vignette = Math.max(grade.vignette, dark)
    grade.strength = Math.max(grade.strength, dark)
    if (dark > 0.5) grade.tint = '#05080a'
  }

  const slots = {} as Record<SlotId, number>
  for (const s of SLOTS) slots[s.id] = slotOpacity(t, s.window)

  return {
    portal,
    t,
    time,
    dt,
    beat,
    u,
    cam,
    waterCam: { cz: lerp(0, 150, uw), cx: 0, cy: 0 },
    doors,
    rain: { alpha: rainAlpha, clip: rainClip, groundY, eave },
    ripples: { strength: rippleStrength, horizonY, polygon, clip: rainClip },
    wl,
    sinkTy,
    air: { visible: airVisible },
    water: {
      visible: waterVisible,
      grade: 0.35 * smoothstep(0, 0.6, uw),
      rays: smoothstep(0.05, 0.35, uw),
      fishReveal: [smoothstep(0.0, 0.3, uw), smoothstep(0.15, 0.5, uw)],
    },
    grade,
    slots,
    hint: 1 - smoothstep(0.03, 0.05, t),
    reduced: quality.reducedMotion,
  }
}
