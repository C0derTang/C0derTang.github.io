import { BEATS } from '../config/beats'
import { WATER_Y, type SceneState } from '../three/state'
import { HEARTH_CENTER } from '../three/world/fire'
import { PUDDLES } from '../three/world/puddles'
import { clamp01, lerp, smoothstep } from '../util/math'

export type SoundLayer = 'foliage' | 'puddles' | 'roof' | 'field' | 'fire' | 'door' | 'bubbles'

export interface SoundMix {
  gains: Record<SoundLayer, number>
  lowpassHz: number
  master: number
}

const RAIN_LEVEL = 0.55

/** Pure spatial mix; the audio controller owns loop phases and the listener's volume. */
export function computeSoundMix(state: SceneState): SoundMix {
  const { x, y, z } = state.pose
  const entered = 1 - smoothstep(-1, 2, z)
  const exited = 1 - smoothstep(-9.5, -6, z)
  const sheltered = entered * (1 - exited)
  const yard = (1 - entered * 0.94) * (1 - exited)
  const roofApproach = 1 - smoothstep(-1, 17, z)
  const puddleDistance = Math.min(
    ...PUDDLES.map((puddle) => Math.hypot(x - puddle.x, z - puddle.z)),
  )
  const hearthDistance = Math.hypot(x - HEARTH_CENTER.x, y - 0.75, z - HEARTH_CENTER.z)

  // Cross the waterline smoothly rather than switching on the boolean underwater flag.
  const immersion = smoothstep(-0.12, 0.4, WATER_Y - y)
  const airborne = lerp(1, 0.35, immersion)

  // d(easeInOutCubic(u))/du = 12 * min(u, 1-u)^2. scrollVel is scene t per second.
  // This follows actual shoji speed in either direction and is exactly silent at rest or on seek.
  const doorDuration = BEATS.doors[1] - BEATS.doors[0]
  const doorU = clamp01((state.t - BEATS.doors[0]) / doorDuration)
  const doorRate = state.reduced
    ? 0
    : (12 * Math.min(doorU, 1 - doorU) ** 2 * Math.abs(state.scrollVel)) / doorDuration

  return {
    gains: {
      foliage: RAIN_LEVEL * 0.72 * yard * airborne,
      puddles: RAIN_LEVEL * 0.11 * yard * (1 - smoothstep(3, 18, puddleDistance)) * airborne,
      roof: RAIN_LEVEL * 0.72 * roofApproach * (1 - exited) * airborne,
      field: RAIN_LEVEL * (0.78 * exited + sheltered * (0.04 + 0.11 * state.doors)) * airborne,
      fire: 0.23 * sheltered * (1 - smoothstep(0.8, 6, hearthDistance)) * airborne,
      door: ((0.35 * doorRate) / (0.2 + doorRate)) * airborne,
      bubbles: 0.035 * immersion,
    },
    lowpassHz: 16000 * (480 / 16000) ** immersion,
    master: lerp(1, 0.42, immersion),
  }
}
