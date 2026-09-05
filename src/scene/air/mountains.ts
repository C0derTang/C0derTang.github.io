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
  const inner = `<defs>${banded('ex-mtnA', '#98a8b1', '#8798a3', 20)}${linGrad('ex-mistA', [
    [0, v('mist'), 0],
    [1, v('mist'), 0.8],
  ])}${radGrad('ex-cloud', [
    [0, v('mist'), 0.55],
    [0.6, v('mist'), 0.25],
    [1, v('mist'), 0],
  ])}</defs>
    ${path(ridge, 'url(#ex-mtnA)')}
    <g class="clouds">${ellipse(420, 500, 340, 70, 'url(#ex-cloud)')}${ellipse(1180, 540, 420, 90, 'url(#ex-cloud)')}${ellipse(800, 470, 260, 50, 'url(#ex-cloud)')}</g>
    ${rect(-500, 640, 2600, 140, 'url(#ex-mistA)')}
    ${fogPath('fog fogc', ridge)}`
  const layer = makeSvgLayer('mtn-far', AIR.mtnFar, inner)
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
  const inner = `<defs>${banded('ex-mtnB', '#7a8e94', '#6c7f86', 20)}${linGrad('ex-mistB', [
    [0, v('mist'), 0],
    [1, v('mist'), 0.8],
  ])}</defs>
    ${path(ridge, 'url(#ex-mtnB)')}
    ${rect(-500, 720, 2600, 110, 'url(#ex-mistB)')}
    ${fogPath('fog fogc', ridge)}`
  const layer = makeSvgLayer('mtn-near', AIR.mtnNear, inner)
  fogHook('fog', (g) => g.fogMid)(layer)
  return layer
}
