import { animate } from 'animejs'
import { AIR } from '../../config/layers'
import type { Quality } from '../../config/quality'
import { brush, contour, ellipsePts, f, inkStyle, pivot, v, wash, washRect } from '../draw'
import { DOORWAY } from '../geometry'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'
import { attrWrite } from '../../util/dom'
import { smoothstep } from '../../util/math'

/**
 * Split indigo curtain in the doorway lintel, ink and wash: an indigo wash with a paler bloom,
 * vertical brush-stroke cloth folds, a wet darker hem wash and a paper-white brush-ring crest.
 * The door-pass-through slide (`layer.update`) and the ambient sway (`animate`) are unchanged.
 */
export function norenLayer(quality: Quality): Layer {
  const top = DOORWAY.y
  const h = 118
  const gap = 8
  const w = DOORWAY.w / 2 - gap
  const ink = inkStyle(AIR.noren.depth)

  const panel = (x: number, cls: string, px: number, seed: number): string => {
    const folds = Array.from({ length: 5 }, (_, i) => {
      const fx = x + ((i + 0.5) / 5) * w
      const jog = i % 2 ? 3 : -3
      return brush(
        [
          [fx, top + 3],
          [fx + jog, top + h * 0.5],
          [fx, top + h - 8],
        ],
        {
          w: ink.w * 0.45,
          seed: seed + 10 + i,
          wobble: 1.5,
          color: ink.color,
          opacity: ink.opacity * 0.75,
        },
      )
    }).join('')
    return pivot(
      px,
      top,
      cls,
      wash(
        [
          [x, top],
          [x + w / 2, top],
          [x + w, top],
          [x + w, top + h / 2],
          [x + w, top + h],
          [x + w / 2, top + h],
          [x, top + h],
          [x, top + h / 2],
        ],
        v('indigo-wash'),
        {
          seed,
          amp: 5,
          opacity: 0.6,
          rim: 1.2,
          bloom: { color: '#5c6a94', scale: 0.55, opacity: 0.3, dy: -h * 0.15 },
        },
      ) +
        folds +
        washRect(x, top + h - 22, w, 22, '#1f2748', {
          seed: seed + 20,
          amp: 4,
          opacity: 0.55,
          rim: 1,
        }) +
        contour(ellipsePts(px, top + 62, 22, 22, 16), 3, seed + 30, v('paper'), 0.85),
    )
  }

  const inner =
    washRect(DOORWAY.x - 6, top - 10, DOORWAY.w + 12, 12, v('wood-wash-dark'), {
      seed: 5,
      amp: 3,
      opacity: 0.6,
      rim: 1,
    }) +
    `<g class="part-l">${panel(DOORWAY.x + 4, 'noren-l', DOORWAY.x + 4 + w / 2, 10)}</g>` +
    `<g class="part-r">${panel(
      DOORWAY.x + DOORWAY.w / 2 + gap / 2,
      'noren-r',
      DOORWAY.x + DOORWAY.w / 2 + gap / 2 + w / 2,
      40,
    )}</g>`
  const layer = makeSvgLayer('noren', { ...AIR.noren, live: !quality.reducedMotion }, inner)
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
