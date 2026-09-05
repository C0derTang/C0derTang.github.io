import { animate } from 'animejs'
import { AIR } from '../../config/layers'
import type { Quality } from '../../config/quality'
import { circle, ellipse, linGrad, path, polygon, radGrad, rect, v, type P2 } from '../draw'
import { LAMP } from '../geometry'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'

/** Near ring of the room: posts, big beam, roof void, doma (authored for restCz 1000). */
export function interiorFrameLayer(): Layer {
  const post = (x: number) =>
    rect(x, -220, 64, 1640, v('wood-dark')) + rect(x, -220, 8, 1640, v('wood-mid'))
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
  const inner = `
    ${rect(-280, -220, 2160, 370, '#1e1512')}
    ${rafters}
    ${path('M-280 150H1880V262Q800 296 -280 262Z', v('wood-dark'))}
    ${rect(-280, 150, 2160, 20, v('wood-mid'))}
    <path d="M-280 200H1880M-280 228H1880M-280 250Q800 262 1880 250" stroke="${v('wood-mid')}" stroke-width="1.5" opacity=".2" fill="none"/>
    ${post(40)}${post(1496)}
    ${rect(-280, 1040, 2160, 20, v('wood-light'))}
    ${rect(-280, 1060, 2160, 400, '#5a4d42')}`
  return makeSvgLayer('interior-frame', AIR.interiorFrame, inner)
}

/** Tatami, irori hearth, kettle, lamp and its glow (authored for restCz 1000, floor line y 800). */
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
      const fill = (c + ri) % 2 ? '#ada468' : v('tatami')
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
    }
  })

  const lampX = LAMP.x
  const lampY = LAMP.y
  const inner = `<defs>
    ${linGrad('in-paperLit', [
      [0, v('paper-lit')],
      [1, '#efcf98'],
    ])}
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
  </defs>
    ${rect(-280, 180, 2160, 50, v('wood-dark'))}
    ${rect(-280, 180, 2160, 8, v('wood-mid'))}
    ${mats}
    ${circle(1080, 1000, 420, 'url(#in-floorGlow)')}
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
      '#8c877c',
    )}
    ${circle(800, 955, 90, 'url(#in-ember)')}
    ${ellipse(800, 958, 40, 16, v('ember'))}${ellipse(778, 952, 14, 8, v('lamp'))}
    <path d="M800 230V840" stroke="#2a2a2a" stroke-width="3"/>
    ${path('M760 640c20-14 60-14 80 0-20 12-60 12-80 0zM840 640l22-10v20z', v('wood-mid'))}
    ${rect(735, 780, 130, 90, '#262626', 'rx="30"')}
    ${ellipse(800, 782, 60, 12, '#1a1a1a')}
    ${path('M865 810c30 0 40 10 40 30', 'none', `stroke="#262626" stroke-width="10" stroke-linecap="round"`)}
    ${path('M745 780c10-40 100-40 110 0', 'none', `stroke="#262626" stroke-width="6"`)}
    <g class="steam">${path('M780 770c-10-30 10-50 0-80', 'none', `stroke="${v('paper')}" stroke-width="10" stroke-linecap="round" opacity=".18"`)}${path('M822 766c8-26-8-46 2-72', 'none', `stroke="${v('paper')}" stroke-width="8" stroke-linecap="round" opacity=".16"`)}</g>
    </g>
    ${rect(1000, 950, 150, 50, v('indigo-cloth'), 'rx="8"')}
    ${rect(1000, 950, 150, 50, 'none', `rx="8" stroke="#55628a" stroke-width="2"`)}
    ${rect(200, 620, 170, 12, v('wood-mid'))}
    ${rect(220, 580, 40, 40, '#6b6f66', 'rx="6"')}${rect(275, 588, 36, 32, '#8c7a5a', 'rx="6"')}
    ${circle(lampX, lampY, 460, 'url(#in-lampGlow)')}
    <path d="M${lampX} 230V${lampY - 60}" stroke="#2a2a2a" stroke-width="2"/>
    ${rect(lampX - 40, lampY - 60, 80, 120, 'url(#in-paperLit)', 'rx="18"')}
    <path d="M${lampX - 14} ${lampY - 56}v112M${lampX} ${lampY - 56}v112M${lampX + 14} ${lampY - 56}v112" stroke="${v('wood-dark')}" stroke-width="2" opacity=".6"/>
    <g class="lamp-core">${circle(lampX, lampY, 40, 'url(#in-lampCore)')}</g>
    ${rect(lampX - 44, lampY - 66, 88, 10, v('wood-dark'), 'rx="4"')}`
  const layer = makeSvgLayer('interior-room', AIR.interiorRoom, inner)
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
