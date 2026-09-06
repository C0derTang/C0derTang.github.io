import { AIR } from '../../config/layers'
import { animate } from 'animejs'
import type { Quality } from '../../config/quality'
import { banded, ellipse, fogPath, linGrad, path, radGrad, rect, v, wobbly } from '../draw'
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

/** Far ridge, drifting clouds with shaded undersides, scud, mist band (live: clouds drift). */
export function mtnFarLayer(quality: Quality): Layer {
  const ridge = wobbly(
    [
      [-500, 720],
      [-60, 700],
      [300, 560],
      [760, 520],
      [1200, 590],
      [1660, 640],
      [2100, 660],
      [2100, 1500],
      [-500, 1500],
    ],
    14,
    31,
  )
  const cloud = (cx: number, cy: number, rx: number, ry: number) =>
    ellipse(cx, cy + 28, rx * 0.85, ry * 0.7, '#aab4bb', 'opacity=".22"') +
    ellipse(cx, cy, rx, ry, 'url(#ex-cloud)')
  const defs = `<defs>${banded('ex-mtnA', '#98a8b1', '#8798a3', 20)}${linGrad('ex-mistA', [
    [0, v('mist'), 0],
    [1, v('mist'), 0.8],
  ])}${radGrad('ex-cloud', [
    [0, v('mist'), 0.55],
    [0.6, v('mist'), 0.25],
    [1, v('mist'), 0],
  ])}</defs>`
  const layer = makeSvgLayer('mtn-far', { ...AIR.mtnFar, live: !quality.reducedMotion }, [
    { part: 'ridge', inner: `${defs}${path(ridge, 'url(#ex-mtnA)')}${fogPath('fog fogc', ridge)}` },
    {
      part: 'clouds',
      inner: `<g class="clouds">${cloud(420, 500, 340, 70)}${cloud(1180, 540, 420, 90)}${cloud(800, 470, 260, 50)}${ellipse(800, 440, 600, 14, v('mist'), 'opacity=".3"')}</g>`,
    },
    { part: 'mist', inner: rect(-500, 640, 2600, 140, 'url(#ex-mistA)') },
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

/** Nearer ridge with two low mist clouds hugging it. */
export function mtnNearLayer(): Layer {
  const ridge = wobbly(
    [
      [-500, 780],
      [-60, 760],
      [200, 660],
      [620, 700],
      [1000, 640],
      [1400, 690],
      [1660, 720],
      [2100, 740],
      [2100, 1500],
      [-500, 1500],
    ],
    12,
    32,
  )
  const defs = `<defs>${banded('ex-mtnB', '#7a8e94', '#6c7f86', 20)}${linGrad('ex-mistB', [
    [0, v('mist'), 0],
    [1, v('mist'), 0.8],
  ])}${radGrad('ex-cloud2', [
    [0, v('mist'), 0.5],
    [0.6, v('mist'), 0.2],
    [1, v('mist'), 0],
  ])}</defs>`
  const layer = makeSvgLayer('mtn-near', AIR.mtnNear, [
    { part: 'ridge', inner: `${defs}${path(ridge, 'url(#ex-mtnB)')}${fogPath('fog fogc', ridge)}` },
    {
      part: 'mist',
      inner: `${ellipse(300, 600, 340, 70, 'url(#ex-cloud2)')}${ellipse(1300, 640, 420, 90, 'url(#ex-cloud2)')}${rect(-500, 720, 2600, 110, 'url(#ex-mistB)')}`,
    },
  ])
  fogHook('fog', (g) => g.fogMid)(layer)
  return layer
}
