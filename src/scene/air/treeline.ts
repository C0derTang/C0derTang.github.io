import { AIR } from '../../config/layers'
import {
  cedarDefs,
  cedarFar,
  cyl,
  ellipse,
  fogRect,
  foliage,
  linGrad,
  polygon,
  radGrad,
  rect,
  v,
} from '../draw'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'
import { attrWrite } from '../../util/dom'
import { mulberry32 } from '../../util/math'

/**
 * Distant tree band at the horizon: lighter and bluer than the near trees (aerial perspective),
 * a bamboo grove on the right with cylinder-shaded culms, and a static ground-mist band.
 */
export function treelineLayer(): Layer {
  const rnd = mulberry32(41)
  let spears = ''
  for (let i = 0; i < 16; i++) {
    const x = -120 + i * 118 + rnd() * 40
    spears += cedarFar(x, 800, 0.55 + rnd() * 0.25, 41 + i * 5, 'exfar')
  }
  let blobs = ''
  for (let i = 0; i < 4; i++) {
    const x = 200 + i * 420 + rnd() * 100
    blobs += foliage(x, 740, 170 + rnd() * 60, 43 + i, 'exfar')
  }
  let bamboo = ''
  for (let i = 0; i < 7; i++) {
    const x = 1290 + i * 34
    const y0 = 540 + (i % 2) * 20
    bamboo += rect(x, y0, 6, 300, 'url(#ex-bamboo)')
    for (let y = 560; y < 820; y += 40) {
      bamboo +=
        rect(x - 1, y, 8, 3, '#3f5e42') + rect(x - 1, y + 3, 8, 1, '#8fb08a', 'opacity=".7"')
    }
    for (let k = 0; k < 3; k++) {
      const y = 580 + k * 70 + (i % 3) * 10
      bamboo +=
        polygon(
          [
            [x + 3, y],
            [x + 34, y - 14],
            [x + 40, y - 4],
          ],
          v('green-light'),
          'opacity=".8"',
        ) +
        polygon(
          [
            [x + 3, y + 6],
            [x - 28, y - 6],
            [x - 34, y + 4],
          ],
          v('green-light'),
          'opacity=".8"',
        )
    }
  }
  const inner = `<defs>${linGrad('ex-far', [
    [0, v('green-far')],
    [1, '#4e6a64'],
  ])}${cedarDefs('exfar', true)}${cyl('ex-bamboo', '#3f5e42', '#5a7d5a', '#8fb08a', 0.3)}${radGrad(
    'ex-gmist',
    [
      [0, v('mist'), 0.25],
      [1, v('mist'), 0],
    ],
  )}</defs>
    ${rect(-500, 800, 2600, 400, '#4e6a64')}${blobs}${spears}${bamboo}
    ${ellipse(300, 820, 800, 50, 'url(#ex-gmist)')}${ellipse(1000, 840, 900, 60, 'url(#ex-gmist)')}${ellipse(1600, 815, 700, 40, 'url(#ex-gmist)')}
    ${fogRect('fog fogc', -500, 500, 2600, 700)}`
  const layer = makeSvgLayer('treeline', AIR.treeline, inner)
  const fog = layer.el.querySelector('.fog')
  layer.update = (state) => {
    if (fog) {
      attrWrite(fog, 'opacity', (state.grade.fogMid * 0.6).toFixed(3))
      attrWrite(fog, 'fill', state.grade.fogColor)
    }
  }
  return layer
}
