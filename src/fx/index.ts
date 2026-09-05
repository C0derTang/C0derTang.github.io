import type { Quality } from '../config/quality'
import type { SceneState, StageSize } from '../scene/types'
import { createBubbles } from './bubbles'
import { createCanvas2D } from './canvas'
import { createRain } from './rain'
import { createRipples } from './ripples'
import type { Fx } from './types'

/** The canvas systems: rain + ripples share the air canvas; bubbles draw on the water canvas. */
export function createFx(
  quality: Quality,
  airCanvas: HTMLCanvasElement,
  waterCanvas: HTMLCanvasElement,
): Fx {
  const air = createCanvas2D(airCanvas)
  const water = createCanvas2D(waterCanvas)
  const rain = createRain(air, quality)
  const ripples = createRipples(air, quality)
  const bubbles = createBubbles(water, quality)
  return {
    resize(size: StageSize) {
      air.resize(size)
      water.resize(size)
      rain.resize(size)
      ripples.resize(size)
      bubbles.resize(size)
    },
    update(state: SceneState) {
      air.clear()
      ripples.update(state)
      rain.update(state)
      bubbles.update(state)
    },
  }
}
