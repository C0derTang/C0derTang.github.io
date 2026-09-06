import { AIR } from '../../config/layers'
import {
  aoGrad,
  circle,
  cyl,
  ellipse,
  fadeGrad,
  linGrad,
  path,
  polygon,
  radGrad,
  rect,
  shadow,
  shojiPanel,
  texRect,
  textured,
  v,
  wobbly,
} from '../draw'
import { DOORWAY, HOUSE } from '../geometry'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'
import { attrWrite } from '../../util/dom'

/**
 * The farmhouse front (restCz 0). One-point perspective centred on the doorway, so there is no
 * receding side wall: the wing at the right is a shadowed lean-to. The doorway is unpainted.
 * Light: overcast dome, brightest upper-left; cool shadows; deep shadow under the eave.
 */
export function houseLayer(): Layer {
  const H = HOUSE
  const defs = `<defs>
    ${linGrad('ex-thatch', [
      [0, v('thatch-light')],
      [0.3, v('thatch')],
      [0.75, '#5e5240'],
      [1, v('thatch-dark')],
    ])}
    ${linGrad(
      'ex-hipR',
      [
        [0, v('thatch-dark'), 0.35],
        [1, v('thatch-dark'), 0.75],
      ],
      0,
      0,
      1,
      0,
    )}
    ${linGrad(
      'ex-hipL',
      [
        [0, v('thatch-light'), 0.35],
        [1, v('thatch-light'), 0],
      ],
      0,
      0,
      1,
      0,
    )}
    ${fadeGrad('ex-eaveBand', v('thatch-dark'), 0, 0.5)}
    ${linGrad('ex-fascia', [
      [0, v('thatch-light')],
      [0.5, v('thatch')],
      [1, v('thatch-dark')],
    ])}
    ${fadeGrad('ex-ridgeLit', v('thatch-ridge'), 0.55, 0)}
    ${linGrad('ex-eaveShadow', [
      [0, v('ao-cool'), 0.7],
      [0.4, v('ao-cool'), 0.3],
      [1, v('ao-cool'), 0],
    ])}
    ${linGrad('ex-plasterShade', [
      [0, v('plaster-shadow'), 0.4],
      [0.45, v('plaster-shadow'), 0],
      [1, v('plaster-lit'), 0.12],
    ])}
    ${fadeGrad('ex-wet', v('wet'), 0, 0.35)}
    ${linGrad(
      'ex-aoUp',
      [
        [0, v('ao-cool'), 0.4],
        [1, v('ao-cool'), 0],
      ],
      0,
      1,
      0,
      0,
    )}
    ${fadeGrad('ex-aoDown', v('ao-cool'), 0.35, 0)}
    ${cyl('ex-post', v('wood-dark'), v('wood-mid'), v('wood-lit'), 0.3)}
    ${cyl('ex-slat', '#2f2219', v('wood-dark'), v('wood-mid'), 0.3)}
    ${linGrad('ex-porchTop', [
      [0, '#b39066'],
      [1, v('wood-light')],
    ])}
    ${fadeGrad('ex-sheen', v('water-sheen'), 0.28, 0)}
    ${linGrad('ex-paperLit', [
      [0, v('paper-lit')],
      [1, '#efcf98'],
    ])}
    ${radGrad('ex-paperGlow', [
      [0, '#fff3d6', 0.5],
      [1, '#fff3d6', 0],
    ])}
    ${radGrad('ex-spill', [
      [0, v('lamp-glow'), 0.14],
      [1, v('lamp-glow'), 0],
    ])}
    ${aoGrad('ex-ao', v('ao-cool'), 0.5)}
    ${cyl('ex-stoneCyl', v('stone-dark'), v('stone'), v('stone-light'), 0.3)}
    ${linGrad('ex-stepTop', [
      [0, '#8a8f8c'],
      [1, '#6e7370'],
    ])}
  </defs>`

  const post = (x: number) =>
    shadow(x + 11, H.wallBottom + 2, 22, 5, 'ex-ao', 0.8) +
    rect(x, H.wallTop + 20, 22, H.wallBottom - H.wallTop - 20, 'url(#ex-post)') +
    texRect(
      'woodV',
      x,
      H.wallTop + 20,
      22,
      H.wallBottom - H.wallTop - 20,
      22,
      0.3,
      H.wallBottom - H.wallTop - 20,
    ) +
    rect(x, H.wallBottom - 60, 22, 60, 'url(#ex-wet)')

  const joints = (x0: number, x1: number) => {
    let d = ''
    for (let x = x0 + 40; x < x1; x += 40) d += `M${x} 724V${H.wallBottom}`
    return `<path d="${d}" stroke="${v('wood-mid')}" stroke-width="1.5" opacity=".5"/>`
  }

  const wallPiece = (x0: number, x1: number, id: string) =>
    rect(x0, H.wallTop, x1 - x0, 724 - H.wallTop, v('plaster')) +
    texRect('plaster', x0, H.wallTop, x1 - x0, 724 - H.wallTop, 256, 0.45) +
    rect(x0, H.wallTop, x1 - x0, 724 - H.wallTop, 'url(#ex-plasterShade)') +
    textured(
      `ex-wains-${id}`,
      (fill) => rect(x0, 724, x1 - x0, H.wallBottom - 724, fill),
      v('wood-dark'),
      texRect('wood', x0, 724, x1 - x0, H.wallBottom - 724, 256, 0.35),
    ) +
    joints(x0, x1) +
    rect(x0, H.wallBottom - 50, x1 - x0, 50, 'url(#ex-wet)')

  const thatchStrokes = (() => {
    let d = ''
    for (let x = 620; x <= 1060; x += 48) d += `M${x} 392L${x - 18} 582`
    return `<path d="${d}" stroke="${v('thatch-dark')}" stroke-width="2.5" opacity=".2" fill="none" stroke-linecap="round"/>`
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
    for (let i = 0; i < 12; i++)
      out += rect(300 + i * 88 + (i % 4) * 9, 848 + (i % 3) * 3, 2, 1, v('rim'), 'opacity=".6"')
    return out
  })()

  const leanTo =
    polygon(
      [
        [1172, 556],
        [1262, 568],
        [1262, 600],
        [1172, 600],
      ],
      v('thatch-dark'),
    ) +
    Array.from({ length: 6 }, (_, i) => rect(1182 + i * 11.5, 600, 11, 210, 'url(#ex-slat)')).join(
      '',
    ) +
    rect(1180, 556, 72, 254, v('shade-cool'), 'opacity=".25"')

  const lantern =
    shadow(1450, 890, 40, 8, 'ex-ao', 0.9) +
    ellipse(1474, 896, 30, 6, v('ao-cool'), 'fill-opacity=".12"') +
    rect(1430, 870, 40, 20, v('stone-dark')) +
    rect(1442, 800, 16, 70, 'url(#ex-stoneCyl)') +
    rect(1428, 780, 26, 26, v('stone-light')) +
    rect(1454, 780, 18, 26, v('stone-dark')) +
    rect(1436, 786, 12, 14, '#2a2d2b') +
    polygon(
      [
        [1418, 782],
        [1450, 762],
        [1456, 782],
      ],
      v('stone-light'),
    ) +
    polygon(
      [
        [1456, 782],
        [1450, 762],
        [1482, 782],
      ],
      v('stone-dark'),
    ) +
    circle(1450, 758, 6, v('stone'))

  const porchBand =
    rect(H.left, H.wallBottom, H.sideRight - H.left, 22, 'url(#ex-porchTop)') +
    texRect('wood', H.left, H.wallBottom, H.sideRight - H.left, 22, 256, 0.3, 22) +
    rect(H.left, H.wallBottom, H.sideRight - H.left, 10, 'url(#ex-sheen)') +
    `<path d="M${H.left} 818H${H.sideRight}M${H.left} 826H${H.sideRight}" stroke="${v('wood-mid')}" stroke-width="1" opacity=".5"/>` +
    rect(H.left, 832, H.sideRight - H.left, 14, v('wood-dark'))

  // Three depths: walls (500) behind the roof (470) behind the posts and yard (462); the porch
  // band is drawn in both the walls and the posts part so the seam between them self-hides.
  const walls = `${defs}
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
    ${rect(290, 906, 1050, 30, 'url(#ex-aoDown)')}
    ${leanTo}
    ${wallPiece(H.left, DOORWAY.x, 'l')}
    ${rect(450, 610, 130, 110, 'url(#ex-spill)')}
    ${rect(470, 630, 90, 70, 'url(#ex-paperLit)')}
    ${rect(470, 630, 90, 70, 'url(#ex-paperGlow)')}
    <path d="M515 630V700M470 665H560" stroke="${v('wood-dark')}" stroke-width="3"/>
    ${wallPiece(DOORWAY.x + DOORWAY.w, H.right, 'r')}
    ${rect(990, 592, 190, 228, 'url(#ex-spill)')}
    ${shojiPanel(1010, 612, 150, 188, { lit: true, cols: 2, rows: 5, prefix: 'ex-' })}
    ${rect(1018, 620, 134, 172, 'url(#ex-paperGlow)')}
    ${rect(H.left, H.eaveY, H.sideRight - H.left, 90, 'url(#ex-eaveShadow)')}
    ${rect(H.left, 798, H.sideRight - H.left, 12, 'url(#ex-aoUp)')}
    ${porchBand}`

  const roof = `
    ${textured(
      'ex-roofClip',
      (fill) =>
        path(
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
          fill,
        ),
      'url(#ex-thatch)',
      texRect('thatch', 300, H.ridgeY, 1030, H.eaveY - H.ridgeY, 256, 0.55, 512),
    )}
    ${polygon(
      [
        [560, H.ridgeY],
        [300, H.eaveY],
        [430, H.eaveY],
      ],
      'url(#ex-hipL)',
    )}
    ${polygon(
      [
        [1090, H.ridgeY],
        [1330, H.eaveY],
        [1200, H.eaveY],
      ],
      'url(#ex-hipR)',
    )}
    ${polygon(
      [
        [334, 560],
        [1296, 560],
        [1330, H.eaveY],
        [300, H.eaveY],
      ],
      'url(#ex-eaveBand)',
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
    ${textured(
      'ex-fasciaClip',
      (fill) =>
        path(
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
          fill,
        ),
      'url(#ex-fascia)',
      texRect('thatchV', 300, 586, 1030, 26, 512, 0.5, 26),
    )}
    <path d="M310 591H1320" stroke="${v('thatch-light')}" stroke-width="2" opacity=".5"/>
    ${rect(540, 336, 570, 26, v('thatch-dark'), 'rx="12"')}
    ${rect(540, 362, 570, 20, 'url(#ex-ridgeLit)')}
    <path d="M552 342H1098" stroke="${v('thatch-light')}" stroke-width="3" opacity=".6"/>
    ${[600, 710, 820, 930, 1040].map((x) => rect(x - 4, 326, 8, 30, v('wood-dark'), 'rx="4"')).join('')}`

  const posts = `
    ${post(H.left)}${post(DOORWAY.x - 22)}${post(DOORWAY.x + DOORWAY.w)}${post(H.right - 22)}
    ${porchBand}
    ${rect(820, 840, 100, 14, 'url(#ex-stepTop)', 'rx="6"')}
    ${rect(820, 840, 100, 5, 'url(#ex-sheen)', 'rx="3"')}
    ${rect(290, 846, 1050, 22, '#6a6e6b', 'opacity=".8"')}
    ${texRect('stone', 290, 846, 1050, 22, 128, 0.4, 22)}
    ${rect(290, 846, 1050, 10, v('wet'), 'opacity=".25"')}
    ${pebbles}
    ${chain}
    ${lantern}
    <rect class="fog" x="-400" y="-400" width="2400" height="2000" fill="${v('fog-color')}" opacity="0"/>`

  const layer = makeSvgLayer('house', AIR.house, [
    { part: 'walls', inner: walls },
    { part: 'roof', inner: roof },
    { part: 'posts', inner: posts },
  ])

  const fog = layer.el.querySelector('.fog')
  layer.update = (state) => {
    if (fog) {
      attrWrite(fog, 'opacity', (state.grade.fogNear * 0.75).toFixed(3))
      attrWrite(fog, 'fill', state.grade.fogColor)
    }
  }
  return layer
}
