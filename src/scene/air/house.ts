import { AIR } from '../../config/layers'
import { circle, ellipse, f, linGrad, path, polygon, rect, shojiPanel, v, wobbly } from '../draw'
import { DOORWAY, HOUSE } from '../geometry'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'

/** The farmhouse front (restCz 0). The doorway is left unpainted: the interior shows through. */
export function houseLayer(): Layer {
  const H = HOUSE
  const defs = `<defs>
    ${linGrad('ex-thatch', [
      [0, v('thatch-light')],
      [0.55, v('thatch')],
      [0.6, '#66573f'],
      [1, v('thatch-dark')],
    ])}
    ${linGrad('ex-eaveShadow', [
      [0, '#3a2a22', 0.55],
      [1, '#3a2a22', 0],
    ])}
    ${linGrad('ex-paperLit', [
      [0, v('paper-lit')],
      [1, '#efcf98'],
    ])}
  </defs>`

  const post = (x: number) =>
    rect(x, H.wallTop, 22, H.wallBottom - H.wallTop, v('wood-dark')) +
    rect(x, H.wallTop, 4, H.wallBottom - H.wallTop, v('wood-mid'))

  const joints = (x0: number, x1: number) => {
    let d = ''
    for (let x = x0 + 40; x < x1; x += 40) d += `M${x} 724V${H.wallBottom}`
    return `<path d="${d}" stroke="${v('wood-mid')}" stroke-width="1.5" opacity=".5"/>`
  }

  const thatchStrokes = (() => {
    let d = ''
    for (let x = 620; x <= 1060; x += 48) d += `M${x} 392L${x - 18} 582`
    return `<path d="${d}" stroke="${v('thatch-dark')}" stroke-width="2.5" opacity=".3" fill="none" stroke-linecap="round"/>`
  })()

  const chain = (() => {
    let out = ''
    for (let y = 616; y <= 832; y += 24)
      out += circle(1318, y, 5, 'none', `stroke="#5c5f5a" stroke-width="2"`)
    return out + rect(1296, 832, 44, 24, '#5a5d58', 'rx="4"')
  })()

  const pebbles = (() => {
    let out = ''
    for (let i = 0; i < 20; i++)
      out += ellipse(310 + i * 52 + (i % 3) * 7, 852 + (i % 2) * 8, 6, 4, '#9a9d98')
    return out
  })()

  const lantern =
    rect(1430, 870, 40, 20, '#6e7370') +
    rect(1442, 800, 16, 70, '#6e7370') +
    rect(1442, 800, 5, 70, '#8a8f8c') +
    rect(1428, 780, 44, 26, '#6e7370') +
    rect(1436, 786, 12, 14, '#3a3f3c') +
    polygon(
      [
        [1418, 782],
        [1450, 762],
        [1482, 782],
      ],
      '#8a8f8c',
    ) +
    circle(1450, 758, 6, '#6e7370')

  const inner = `${defs}
    ${path(
      wobbly(
        [
          [-400, 846],
          [2000, 846],
          [2000, 1000],
          [-400, 1000],
        ],
        4,
        11,
      ),
      v('green-mid'),
    )}
    ${rect(H.right, H.wallTop, H.sideRight - H.right, H.wallBottom - H.wallTop, '#9d9279')}
    ${rect(H.right, 724, H.sideRight - H.right, H.wallBottom - 724, v('wood-dark'))}
    ${rect(H.left, H.wallTop, DOORWAY.x - H.left, 724 - H.wallTop, v('plaster'))}
    ${rect(H.left, 724, DOORWAY.x - H.left, H.wallBottom - 724, v('wood-dark'))}
    ${joints(H.left, DOORWAY.x)}
    ${rect(470, 630, 90, 70, 'url(#ex-paperLit)')}
    <path d="M515 630V700M470 665H560" stroke="${v('wood-dark')}" stroke-width="3"/>
    ${rect(DOORWAY.x + DOORWAY.w, H.wallTop, H.right - DOORWAY.x - DOORWAY.w, 724 - H.wallTop, v('plaster'))}
    ${rect(DOORWAY.x + DOORWAY.w, 724, H.right - DOORWAY.x - DOORWAY.w, H.wallBottom - 724, v('wood-dark'))}
    ${joints(DOORWAY.x + DOORWAY.w, H.right)}
    ${shojiPanel(1010, 612, 150, 188, { lit: true, cols: 2, rows: 5, prefix: 'ex-' })}
    ${post(H.left)}${post(DOORWAY.x - 22)}${post(DOORWAY.x + DOORWAY.w)}${post(H.right - 22)}
    ${rect(H.left, H.eaveY, H.sideRight - H.left, 60, 'url(#ex-eaveShadow)')}
    ${rect(H.left, H.wallBottom, H.sideRight - H.left, 22, v('wood-light'))}
    <path d="M${H.left} 818H${H.sideRight}M${H.left} 826H${H.sideRight}" stroke="${v('wood-mid')}" stroke-width="1" opacity=".5"/>
    ${rect(H.left, 832, H.sideRight - H.left, 14, v('wood-dark'))}
    ${rect(820, 840, 100, 14, '#6b6b66', 'rx="6"')}
    ${rect(290, 846, 1050, 22, '#7b7f7c', 'opacity=".7"')}
    ${pebbles}
    ${path(
      wobbly(
        [
          [300, H.eaveY],
          [560, H.ridgeY],
          [1090, H.ridgeY],
          [1330, H.eaveY],
        ],
        3,
        2,
      ),
      'url(#ex-thatch)',
    )}
    ${polygon(
      [
        [1090, H.ridgeY],
        [1330, H.eaveY],
        [1200, H.eaveY],
      ],
      v('thatch-dark'),
      'opacity=".6"',
    )}
    ${thatchStrokes}
    ${polygon(
      [
        [1030, 418],
        [1150, 418],
        [1090, 360],
      ],
      v('wood-dark'),
    )}
    <path d="M1060 418V385M1090 418V366M1120 418V385M1045 402H1135" stroke="${v('wood-light')}" stroke-width="1.5" opacity=".4"/>
    ${path(
      wobbly(
        [
          [300, 588],
          [1330, 588],
          [1330, 610],
          [300, 610],
        ],
        5,
        3,
      ),
      v('thatch-dark'),
    )}
    <path d="M310 591H1320" stroke="${v('thatch-light')}" stroke-width="2" opacity=".5"/>
    ${rect(540, 336, 570, 26, v('thatch-dark'), 'rx="12"')}
    <path d="M552 342H1098" stroke="${v('thatch-light')}" stroke-width="3" opacity=".6"/>
    ${[600, 710, 820, 930, 1040].map((x) => rect(x - 4, 326, 8, 30, v('wood-dark'), 'rx="4"')).join('')}
    ${chain}
    ${lantern}
    <rect class="dbg-edge" x="0" y="0" width="1600" height="1200" fill="none" stroke="#f0f" stroke-width="3" opacity="0"/>`

  return makeSvgLayer('house', AIR.house, inner)
}

export const HOUSE_DOOR_CENTER = { x: DOORWAY.x + DOORWAY.w / 2, y: f(DOORWAY.y + DOORWAY.h / 2) }
