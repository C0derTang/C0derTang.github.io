import { AIR } from '../../config/layers'
import { cyl, ellipse, fogRect, linGrad, path, polygon, radGrad, rect, v, wobbly } from '../draw'
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
    const w = 90 + rnd() * 50
    const top = 560 + rnd() * 60
    const base = 820
    for (let t = 0; t < 5; t++) {
      const y0 = base - t * 48
      const tw = w * (1 - t * 0.16)
      spears += path(
        wobbly(
          [
            [x - tw / 2, y0],
            [x, y0 - 70],
            [x + tw / 2, y0],
          ],
          4,
          41 + i * 5 + t,
        ),
        'url(#ex-far)',
      )
    }
    spears += polygon(
      [
        [x - 6, base - 240],
        [x, top],
        [x + 6, base - 240],
      ],
      'url(#ex-far)',
    )
  }
  let blobs = ''
  for (let i = 0; i < 4; i++) {
    const x = 200 + i * 420 + rnd() * 100
    const w = 160 + rnd() * 60
    blobs +=
      ellipse(x, 720, w / 2, w / 3, 'url(#ex-far)') +
      ellipse(x + w / 4, 700, w / 3, w / 4, '#7c9a94', 'opacity=".5"')
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
  ])}${cyl('ex-bamboo', '#3f5e42', '#5a7d5a', '#8fb08a', 0.3)}${radGrad('ex-gmist', [
    [0, v('mist'), 0.25],
    [1, v('mist'), 0],
  ])}</defs>
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
