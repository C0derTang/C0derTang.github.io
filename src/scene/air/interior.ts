import { animate } from 'animejs'
import { AIR } from '../../config/layers'
import type { Quality } from '../../config/quality'
import {
  aoGrad,
  circle,
  cyl,
  ellipse,
  fadeGrad,
  linGrad,
  type P2,
  path,
  polygon,
  radGrad,
  rect,
  shadow,
  texRect,
  v,
} from '../draw'
import { LAMP } from '../geometry'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'

/** Near ring of the room: posts, big beam, roof void, doma. Lit from the lamp on the right. */
export function interiorFrameLayer(): Layer {
  const post = (x: number) =>
    rect(x, -220, 64, 1640, 'url(#in-post)') + rect(x, -220, 6, 1640, v('wood-mid'), 'opacity=".5"')
  const rafters = [500, 800, 1100]
    .map((x) =>
      polygon(
        [
          [x - 14, 150],
          [x + 14, 150],
          [800 + (x - 800) * 0.15, -400],
        ],
        v('wood-mid'),
        'opacity=".35"',
      ),
    )
    .join('')
  const inner = `<defs>${linGrad('in-void', [
    [0, '#0d0906'],
    [1, '#1e1512'],
  ])}${radGrad('in-beamGlow', [
    [0, v('lamp-glow'), 0.2],
    [1, v('lamp-glow'), 0],
  ])}${cyl('in-post', v('wood-dark'), v('wood-mid'), v('wood-lit'), 0.62)}${linGrad('in-doma', [
    [0, '#6a5d50'],
    [1, '#4a3f36'],
  ])}</defs>
    ${rect(-280, -220, 2160, 370, 'url(#in-void)')}
    ${rafters}
    ${path('M-280 150H1880V262Q800 296 -280 262Z', v('wood-dark'))}
    <clipPath id="in-beamClip"><path d="M-280 150H1880V262Q800 296 -280 262Z"/></clipPath>
    <g clip-path="url(#in-beamClip)">${texRect('wood', -280, 150, 2160, 150, 512, 0.35, 256)}</g>
    ${rect(-280, 150, 2160, 20, v('wood-mid'))}
    <path d="M-280 200H1880M-280 228H1880M-280 250Q800 262 1880 250" stroke="${v('wood-mid')}" stroke-width="1.5" opacity=".2" fill="none"/>
    ${ellipse(1080, 200, 380, 120, 'url(#in-beamGlow)')}
    ${post(40)}${post(1496)}
    ${rect(-280, 1040, 2160, 20, v('wood-light'))}
    ${rect(-280, 1060, 2160, 400, 'url(#in-doma)')}`
  return makeSvgLayer('interior-frame', AIR.interiorFrame, inner)
}

/**
 * Tatami (each mat shaded toward its far edge, warm/cool split from the lamp), irori hearth,
 * kettle, cushion, shelf, the lamp and its glow, object shadows falling away from the lamp.
 */
export function interiorRoomLayer(quality: Quality): Layer {
  const far: [number, number] = [330, 1270]
  const near: [number, number] = [100, 1500]
  const yFar = 800
  const yMid = 905
  const yNear = 1100
  const xAt = (y: number, u: number) => {
    const t = (y - yFar) / (yNear - yFar)
    const l = far[0] + (near[0] - far[0]) * t
    const r = far[1] + (near[1] - far[1]) * t
    return l + (r - l) * u
  }
  let mats = ''
  const clipA: string[] = []
  const clipB: string[] = []
  const rows: [number, number][] = [
    [yFar, yMid],
    [yMid, yNear],
  ]
  rows.forEach(([y0, y1], ri) => {
    for (let c = 0; c < 3; c++) {
      const pts: P2[] = [
        [xAt(y0, c / 3), y0],
        [xAt(y0, (c + 1) / 3), y0],
        [xAt(y1, (c + 1) / 3), y1],
        [xAt(y1, c / 3), y1],
      ]
      const odd = (c + ri) % 2 === 1
      const fill = odd ? 'url(#in-matB)' : 'url(#in-matA)'
      ;(odd ? clipB : clipA).push(polygon(pts, 'none'))
      mats += polygon(pts, fill)
      let weave = ''
      for (let k = 1; k < 6; k++) {
        const y = y0 + ((y1 - y0) * k) / 6
        weave += `M${xAt(y, c / 3)} ${y}H${xAt(y, (c + 1) / 3)}`
      }
      mats += `<path d="${weave}" stroke="#3f3a3a" stroke-width="1" opacity=".12"/>`
      mats += polygon(
        pts,
        'none',
        `stroke="${v('tatami-border')}" stroke-width="6" opacity=".85" stroke-linejoin="round"`,
      )
      // lit rim inside the top/left, AO inside the bottom/right
      const [a, b, cc, d] = pts
      if (a && b && cc && d) {
        mats += `<path d="M${d[0] + 3} ${d[1] - 3}L${a[0] + 3} ${a[1] + 3}L${b[0] - 3} ${b[1] + 3}" stroke="${v('tatami-lit')}" stroke-width="1" opacity=".6" fill="none"/>`
        mats += `<path d="M${b[0] - 4} ${b[1] + 4}L${cc[0] - 4} ${cc[1] - 4}L${d[0] + 4} ${d[1] - 4}" stroke="${v('ao-warm')}" stroke-width="2" opacity=".3" fill="none"/>`
      }
    }
  })
  const weave =
    `<clipPath id="in-matsA">${clipA.join('')}</clipPath><clipPath id="in-matsB">${clipB.join('')}</clipPath>` +
    `<g clip-path="url(#in-matsA)">${texRect('tatamiH', near[0], yFar, near[1] - near[0], yNear - yFar, 512, 0.3, 256)}</g>` +
    `<g clip-path="url(#in-matsB)">${texRect('tatamiV', near[0], yFar, near[1] - near[0], yNear - yFar, 256, 0.3, 512)}</g>`
  const floorPoly: P2[] = [
    [far[0], yFar],
    [far[1], yFar],
    [near[1], yNear],
    [near[0], yNear],
  ]

  const lampX = LAMP.x
  const lampY = LAMP.y
  const inner = `<defs>
    ${linGrad('in-paperLit', [
      [0, v('paper-lit')],
      [1, '#efcf98'],
    ])}
    ${linGrad('in-matA', [
      [0, v('tatami-shadow')],
      [1, v('tatami-lit')],
    ])}
    ${linGrad('in-matB', [
      [0, '#8f8757'],
      [1, '#b8ae70'],
    ])}
    ${linGrad(
      'in-split',
      [
        [0, v('paper-cool'), 0.12],
        [0.45, v('paper-cool'), 0],
        [1, v('lamp-glow'), 0.18],
      ],
      0,
      0,
      1,
      0,
    )}
    ${radGrad('in-floorGlow', [
      [0, v('lamp-glow'), 0.3],
      [1, v('lamp-glow'), 0],
    ])}
    ${radGrad('in-lampGlow', [
      [0, v('lamp-glow'), 0.5],
      [0.4, v('lamp-glow'), 0.18],
      [1, v('lamp-glow'), 0],
    ])}
    ${radGrad('in-ember', [
      [0, v('lamp'), 0.35],
      [1, v('ember'), 0],
    ])}
    ${radGrad('in-lampCore', [
      [0, '#fff3d6', 0.9],
      [1, v('lamp'), 0],
    ])}
    ${aoGrad('in-ao', v('ao-warm'), 0.5)}
    ${linGrad('in-pit', [
      [0, '#2a2622'],
      [1, '#6a655a'],
    ])}
    ${fadeGrad('in-shelfAO', v('ao-warm'), 0.35, 0)}
    ${cyl('in-kettle', '#141414', '#2a2a2a', '#4a4a4a', 0.68)}
    ${linGrad(
      'in-lampBody',
      [
        [0, '#d9b88a'],
        [0.3, v('paper-lit')],
        [0.5, '#fff3d6'],
        [0.7, v('paper-lit')],
        [1, '#d9b88a'],
      ],
      0,
      0,
      1,
      0,
    )}
  </defs>
    ${rect(-280, 180, 2160, 50, v('wood-dark'))}
    ${rect(-280, 180, 2160, 8, v('wood-mid'))}
    ${mats}
    ${weave}
    ${polygon(floorPoly, 'url(#in-split)')}
    ${circle(1080, 1000, 420, 'url(#in-floorGlow)')}
    ${shadow(520, 1010, 90, 22, 'in-ao', 0.6)}${ellipse(520, 1010, 130, 30, v('ao-warm'), 'fill-opacity=".12"')}
    ${shadow(1075, 1004, 90, 14, 'in-ao', 0.7)}
    <g transform="translate(-230 0)">
    ${polygon(
      [
        [690, 900],
        [910, 900],
        [930, 1000],
        [670, 1000],
      ],
      v('wood-dark'),
    )}
    ${polygon(
      [
        [706, 916],
        [894, 916],
        [912, 984],
        [688, 984],
      ],
      'url(#in-pit)',
    )}
    ${circle(800, 955, 90, 'url(#in-ember)')}
    ${ellipse(800, 958, 40, 16, v('ember'))}${ellipse(778, 952, 14, 8, v('lamp'))}
    <path d="M800 230V840" stroke="#2a2a2a" stroke-width="3"/>
    ${path('M770 470c16-12 44-12 60 0-16 10-44 10-60 0zM830 470l18-9v18z', v('wood-mid'))}
    ${rect(735, 780, 130, 90, 'url(#in-kettle)', 'rx="30"')}
    <path d="M862 792c4 20 4 46 0 66" stroke="${v('rim-warm')}" stroke-width="2" opacity=".35" fill="none"/>
    ${ellipse(800, 782, 60, 12, '#1a1a1a')}
    ${path('M865 810c30 0 40 10 40 30', 'none', `stroke="#262626" stroke-width="10" stroke-linecap="round"`)}
    ${path('M745 780c10-40 100-40 110 0', 'none', `stroke="#262626" stroke-width="6"`)}
    <g class="steam">${path('M780 770c-10-30 10-50 0-80', 'none', `stroke="${v('paper')}" stroke-width="10" stroke-linecap="round" opacity=".18"`)}${path('M822 766c8-26-8-46 2-72', 'none', `stroke="${v('paper')}" stroke-width="8" stroke-linecap="round" opacity=".16"`)}</g>
    </g>
    ${rect(1000, 950, 150, 50, v('indigo-cloth'), 'rx="8"')}
    ${rect(1000, 950, 150, 50, 'none', `rx="8" stroke="#55628a" stroke-width="2"`)}
    ${rect(200, 632, 170, 8, 'url(#in-shelfAO)')}
    ${rect(200, 620, 170, 12, v('wood-mid'))}
    ${rect(220, 580, 40, 40, '#6b6f66', 'rx="6"')}${rect(275, 588, 36, 32, '#8c7a5a', 'rx="6"')}
    ${circle(lampX, lampY, 460, 'url(#in-lampGlow)')}
    <path d="M${lampX} 230V${lampY - 60}" stroke="#2a2a2a" stroke-width="2"/>
    ${rect(lampX - 40, lampY - 60, 80, 120, 'url(#in-lampBody)', 'rx="18"')}
    <path d="M${lampX - 14} ${lampY - 56}v112M${lampX} ${lampY - 56}v112M${lampX + 14} ${lampY - 56}v112" stroke="${v('wood-dark')}" stroke-width="2" opacity=".6"/>
    <g class="lamp-core">${circle(lampX, lampY, 40, 'url(#in-lampCore)')}</g>
    ${rect(lampX - 44, lampY - 66, 88, 10, v('wood-dark'), 'rx="4"')}`
  const layer = makeSvgLayer(
    'interior-room',
    { ...AIR.interiorRoom, live: !quality.reducedMotion },
    inner,
  )
  if (!quality.reducedMotion) {
    const core = layer.el.querySelector('.lamp-core')
    if (core)
      animate(core, {
        opacity: [1, 0.72, 0.95, 0.8, 1],
        duration: 2600,
        loop: true,
        ease: 'inOutSine',
      })
    const steam = layer.el.querySelector('.steam')
    if (steam)
      animate(steam, {
        translateY: [0, -24],
        opacity: [0.9, 0.2],
        duration: 4000,
        loop: true,
        ease: 'outSine',
      })
  }
  return layer
}
