import { AIR } from '../../config/layers'
import { animate } from 'animejs'
import type { Quality } from '../../config/quality'
import {
  brush,
  ellipsePts,
  fogPath,
  granulated,
  inkStyle,
  v,
  wash,
  washRect,
  wobbly,
} from '../draw'
import type { P2 } from '../draw'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'
import { attrWrite } from '../../util/dom'

const fogHook = (
  cls: string,
  pick: (s: { fogFar: number; fogMid: number; fogNear: number }) => number,
  mul = 1,
) => {
  return (layer: Layer) => {
    const el = layer.el.querySelector(`.${cls}`)
    const colorEls = layer.el.querySelectorAll('.fogc')
    if (!el) return
    layer.update = (state) => {
      attrWrite(el, 'opacity', (pick(state.grade) * mul).toFixed(3))
      for (const c of colorEls) attrWrite(c, 'fill', state.grade.fogColor)
    }
  }
}

/** Farthest skyline (mtn-far's back wash band). */
const RIDGE_A: readonly P2[] = [
  [-500, 720],
  [-60, 700],
  [300, 560],
  [760, 520],
  [1200, 590],
  [1660, 640],
  [2100, 660],
]
/** Second skyline, a little lower/closer: its wash overlaps RIDGE_A's to deepen the band below it. */
const RIDGE_B: readonly P2[] = [
  [-500, 820],
  [-60, 800],
  [300, 700],
  [760, 660],
  [1200, 710],
  [1660, 750],
  [2100, 770],
]
/** mtn-near's single skyline. */
const RIDGE_NEAR: readonly P2[] = [
  [-500, 780],
  [-60, 760],
  [200, 660],
  [620, 700],
  [1000, 640],
  [1400, 690],
  [1660, 720],
  [2100, 740],
]

/** Close a skyline polyline down to the bottom bleed so it can fill the fog-shape path. */
const closeDown = (line: readonly P2[]): P2[] => [...line, [2100, 1500], [-500, 1500]]

/** A single open, thin ridge-line stroke tracing a skyline, fading to nothing at both bleed edges. */
const ridgeLine = (
  pts: readonly P2[],
  seed: number,
  w: number,
  color: string,
  opacity: number,
): string => brush(pts, { w, seed, wobble: 3, color, opacity, taper: [0.03, 0.03], peak: 0.5 })

/** A long, soft horizontal cloud band hugging a ridge (no rim: it must stay lineless). */
const cloudBand = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  opacity = 0.7,
): string => wash(ellipsePts(cx, cy, rx, ry, 12), v('cloud'), { seed, amp: 10, opacity, rim: 0 })

/**
 * Far ridge: two layered granulated wash bands (paper granulation shows through) each with one
 * thin ink skyline stroke, a `.clouds` group of drifting low cloud bands (kept live so the
 * existing drift animation still targets it), and a pale mist band. No gradients.
 */
export function mtnFarLayer(quality: Quality): Layer {
  const ink = inkStyle(AIR.mtnFar.depth)
  const ridgePart =
    granulated('mf-a', -500, 440, 2600, 300, v('ridge-far'), {
      seed: 31,
      amp: 16,
      opacity: 0.5,
      rim: 1,
    }) +
    ridgeLine(RIDGE_A, 31, ink.w, ink.color, ink.opacity) +
    granulated('mf-b', -500, 560, 2600, 300, v('ridge-far'), {
      seed: 32,
      amp: 16,
      opacity: 0.55,
      rim: 1,
    }) +
    ridgeLine(RIDGE_B, 32, ink.w, ink.color, ink.opacity) +
    fogPath('fog fogc', wobbly(closeDown(RIDGE_B), 14, 39))
  const cloudsPart = `<g class="clouds">${cloudBand(420, 560, 340, 46, 51)}${cloudBand(
    1180,
    595,
    420,
    50,
    52,
    0.65,
  )}${cloudBand(800, 545, 300, 34, 53, 0.55)}</g>`
  const mistPart = washRect(-500, 600, 2600, 220, v('cloud'), {
    seed: 54,
    amp: 14,
    opacity: 0.3,
    rim: 0,
  })
  const layer = makeSvgLayer('mtn-far', { ...AIR.mtnFar, live: !quality.reducedMotion }, [
    { part: 'ridge', inner: ridgePart },
    { part: 'clouds', inner: cloudsPart },
    { part: 'mist', inner: mistPart },
  ])
  fogHook('fog', (g) => g.fogFar)(layer)
  if (!quality.reducedMotion) {
    const clouds = layer.el.querySelector('.clouds')
    if (clouds)
      animate(clouds, {
        translateX: [-40, 40],
        duration: 40000,
        loop: true,
        alternate: true,
        ease: 'inOutSine',
      })
  }
  return layer
}

/**
 * Nearer, darker ridge: one granulated wash band with a single ink skyline stroke and two low
 * cloud bands crossing it, plus a pale mist band. No gradients.
 */
export function mtnNearLayer(): Layer {
  const ink = inkStyle(AIR.mtnNear.depth)
  const ridgePart =
    granulated('mn-a', -500, 580, 2600, 320, v('ridge-mid'), {
      seed: 33,
      amp: 14,
      opacity: 0.6,
      rim: 1,
    }) +
    ridgeLine(RIDGE_NEAR, 33, ink.w, ink.color, ink.opacity) +
    cloudBand(300, 660, 340, 40, 55, 0.6) +
    cloudBand(1300, 700, 420, 46, 56, 0.55) +
    fogPath('fog fogc', wobbly(closeDown(RIDGE_NEAR), 12, 40))
  const mistPart = washRect(-500, 660, 2600, 200, v('cloud'), {
    seed: 57,
    amp: 12,
    opacity: 0.28,
    rim: 0,
  })
  const layer = makeSvgLayer('mtn-near', AIR.mtnNear, [
    { part: 'ridge', inner: ridgePart },
    { part: 'mist', inner: mistPart },
  ])
  fogHook('fog', (g) => g.fogMid)(layer)
  return layer
}
