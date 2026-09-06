import { AIR } from '../../config/layers'
import { cedar, cedarDefs, foliage, path, v } from '../draw'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'

/** Foreground cedars framing the left side and one bough crossing the roof (in front of the screen plane). */
export function treesForeLayer(): Layer {
  const inner = `<defs>${cedarDefs('ex')}</defs>
    ${cedar(120, 1180, 1.7, 11)}
    ${cedar(-60, 1200, 1.9, 12)}
    ${cedar(430, 1160, 1.25, 13)}
    ${cedar(1650, 1200, 1.6, 14)}
    ${path('M200 60C360 120 560 200 760 300', 'none', `stroke="${v('bark-dark')}" stroke-width="10" stroke-linecap="round"`)}
    ${path('M200 56C360 116 560 196 760 296', 'none', `stroke="${v('bark-light')}" stroke-width="3" stroke-linecap="round" opacity=".5"`)}
    ${foliage(330, 120, 200, 15)}${foliage(500, 190, 170, 16)}${foliage(660, 260, 150, 17)}${foliage(760, 300, 120, 18)}`
  return makeSvgLayer('trees-fore', AIR.treesFore, inner)
}
