import { AIR } from '../../config/layers'
import { ellipse, fogRect, polygon, rect, v, wobbly, path } from '../draw'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'
import { attrWrite } from '../../util/dom'
import { mulberry32 } from '../../util/math'

/** Distant tree band at the horizon behind the house, plus a bamboo grove on the right. */
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
        v('green-deep'),
      )
    }
    spears += polygon(
      [
        [x - 6, base - 240],
        [x, top],
        [x + 6, base - 240],
      ],
      v('green-deep'),
    )
  }
  let blobs = ''
  for (let i = 0; i < 4; i++) {
    const x = 200 + i * 420 + rnd() * 100
    const w = 160 + rnd() * 60
    blobs +=
      ellipse(x, 720, w / 2, w / 3, v('green-deep')) +
      ellipse(x + w / 4, 700, w / 3, w / 4, v('green-mid'), 'opacity=".6"')
  }
  let bamboo = ''
  for (let i = 0; i < 7; i++) {
    const x = 1290 + i * 34
    bamboo += rect(x, 540 + (i % 2) * 20, 6, 300, '#5a7d5a')
    for (let y = 560; y < 820; y += 40) bamboo += rect(x - 1, y, 8, 2, v('green-deep'))
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
  const inner = `${rect(-500, 800, 2600, 400, v('green-deep'))}${blobs}${spears}${bamboo}${fogRect('fog fogc', -500, 500, 2600, 700)}`
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
