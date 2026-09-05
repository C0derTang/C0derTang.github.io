import { AIR } from '../../config/layers'
import { cedar, ellipse, path, v } from '../draw'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'

/** Foreground cedars framing the left side and one branch crossing the roof (in front of the screen plane). */
export function treesForeLayer(): Layer {
  const blob = (x: number, y: number, w: number) =>
    ellipse(x, y, w / 2, w / 3.2, v('green-deep')) +
    ellipse(x - w / 4, y + 8, w / 3, w / 4.5, v('green-deep')) +
    ellipse(x + w / 4, y + 6, w / 3, w / 4.5, v('green-mid'), 'opacity=".7"')
  const inner = `
    ${cedar(120, 1180, 1.7, 11)}
    ${cedar(-60, 1200, 1.9, 12)}
    ${cedar(430, 1160, 1.25, 13)}
    ${cedar(1650, 1200, 1.6, 14)}
    ${path('M200 60C360 120 560 200 760 300', 'none', `stroke="${v('wood-dark')}" stroke-width="9" stroke-linecap="round"`)}
    ${blob(330, 120, 200)}${blob(500, 190, 170)}${blob(660, 260, 150)}${blob(760, 300, 120)}`
  return makeSvgLayer('trees-fore', AIR.treesFore, inner)
}
