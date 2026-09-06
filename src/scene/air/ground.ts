import { AIR } from '../../config/layers'
import { ellipse, fadeGrad, linGrad, path, polygon, rect, v, wobbly, type P2 } from '../draw'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'
import { mulberry32 } from '../../util/math'

/** Foreground meadow in front of the house (restCz 0): wet grass, puddles reflecting the sky and the lit window. */
export function groundLayer(): Layer {
  const rnd = mulberry32(21)
  const top: P2[] = []
  for (let x = -400; x <= 2000; x += 120) top.push([x, 950 + (rnd() - 0.5) * 24])
  const meadow = wobbly([...top, [2000, 1600], [-400, 1600]], 8, 22)
  let blades = ''
  for (let i = 0; i < 40; i++) {
    const x = -300 + rnd() * 2200
    const y = 940 + rnd() * 120
    const h = 40 + rnd() * 50
    const lean = (rnd() - 0.5) * 30
    const c = i % 9 === 0 ? v('green-light') : i % 2 ? v('green-deep') : v('green-mid')
    blades += polygon(
      [
        [x - 4, y],
        [x + lean, y - h],
        [x + 4, y],
      ],
      c,
    )
  }
  const inner = `<defs>${linGrad('ex-meadow', [
    [0, v('green-mid')],
    [1, v('green-deep')],
  ])}${fadeGrad('ex-grassSheen', v('rim'), 0.12, 0)}${linGrad('ex-puddle', [
    [0, v('sky-low')],
    [1, v('sky-mid')],
  ])}${fadeGrad('ex-puddleWin', v('paper-lit'), 0.4, 0)}</defs>
    ${path(meadow, 'url(#ex-meadow)')}
    ${rect(-400, 950, 2400, 40, 'url(#ex-grassSheen)')}
    ${ellipse(880, 1040, 260, 44, 'url(#ex-puddle)', 'opacity=".85"')}
    ${ellipse(880, 1040, 260, 44, 'none', `stroke="${v('wet')}" stroke-width="6" opacity=".3"`)}
    ${ellipse(880, 1036, 140, 16, '#b7c0c4', 'opacity=".5"')}
    ${ellipse(1120, 1010, 180, 30, 'url(#ex-puddle)', 'opacity=".8"')}
    ${ellipse(1120, 1010, 180, 30, 'none', `stroke="${v('wet')}" stroke-width="5" opacity=".3"`)}
    ${ellipse(1090, 1006, 26, 40, 'url(#ex-puddleWin)')}
    ${rect(1070, 996, 30, 3, v('sky-low'))}${rect(1074, 1012, 30, 3, v('sky-low'))}
    ${blades}`
  return makeSvgLayer('ground', AIR.ground, inner)
}
