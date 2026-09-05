import { animate } from 'animejs'
import { AIR } from '../../config/layers'
import type { Quality } from '../../config/quality'
import { circle, f, path, pivot, rect, v } from '../draw'
import { DOORWAY } from '../geometry'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'
import { attrWrite } from '../../util/dom'
import { smoothstep } from '../../util/math'

/** Split indigo curtain in the doorway lintel; sways on a time-based anime loop. */
export function norenLayer(quality: Quality): Layer {
  const top = DOORWAY.y
  const h = 118
  const gap = 8
  const w = DOORWAY.w / 2 - gap
  const panel = (x: number, cls: string, px: number) =>
    pivot(
      px,
      top,
      cls,
      rect(x, top, w, h, v('indigo-cloth')) +
        rect(x, top, w, 10, '#2f3852') +
        path(`M${x} ${top + h}q${w / 4} 8 ${w / 2} 0t${w / 2} 0`, v('indigo-cloth')) +
        circle(
          px,
          top + 62,
          22,
          'none',
          `stroke="${v('paper')}" stroke-width="4" opacity=".8" stroke-dasharray="118 22"`,
        ),
    )
  const inner =
    rect(DOORWAY.x - 6, top - 6, DOORWAY.w + 12, 10, v('wood-dark')) +
    `<g class="part-l">${panel(DOORWAY.x + 4, 'noren-l', DOORWAY.x + 4 + w / 2)}</g>` +
    `<g class="part-r">${panel(
      DOORWAY.x + DOORWAY.w / 2 + gap / 2,
      'noren-r',
      DOORWAY.x + DOORWAY.w / 2 + gap / 2 + w / 2,
    )}</g>`
  const layer = makeSvgLayer('noren', AIR.noren, inner)
  // The curtain parts as the camera approaches it (pure in zr), then dissolves.
  const partL = layer.el.querySelector('.part-l')
  const partR = layer.el.querySelector('.part-r')
  layer.update = (_state, p) => {
    const part = smoothstep(0.3, 0.7, p.zr) * 190
    if (partL) attrWrite(partL, 'transform', `translate(${f(-part)} 0) skewX(${f(-part * 0.05)})`)
    if (partR) attrWrite(partR, 'transform', `translate(${f(part)} 0) skewX(${f(part * 0.05)})`)
  }
  if (!quality.reducedMotion) {
    const l = layer.el.querySelector('.noren-l')
    const r = layer.el.querySelector('.noren-r')
    if (l)
      animate(l, {
        rotate: [-1.6, 1.6],
        duration: 3600,
        loop: true,
        alternate: true,
        ease: 'inOutSine',
      })
    if (r)
      animate(r, {
        rotate: [1.2, -1.4],
        duration: 4100,
        loop: true,
        alternate: true,
        ease: 'inOutSine',
      })
  }
  return layer
}
