import { animate } from 'animejs'
import { AIR } from '../../config/layers'
import type { Quality } from '../../config/quality'
import {
  aoGrad,
  cedarDefs,
  cedarFar,
  cyl,
  ellipse,
  f,
  fadeGrad,
  fogRect,
  folds,
  linGrad,
  path,
  polygon,
  radGrad,
  rect,
  riceClump,
  shadow,
  texRect,
  v,
  wobbly,
} from '../draw'
import { PADDY } from '../geometry'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'
import { attrWrite } from '../../util/dom'
import { mulberry32 } from '../../util/math'

const VP = { x: 800, y: PADDY.horizonY }

/**
 * Far paddies at the horizon, a two-faced shed, a scarecrow with a folded coat, five far cedars,
 * and their reflections in the near water (mirrored in this same layer so they stay registered
 * under parallax), broken into eight drifting ripple bands and faded by a Fresnel gradient.
 * Live: the bands animate.
 */
export function paddyFarLayer(quality: Quality, staticBands = false): Layer {
  const H = 700
  const squash = 0.55
  // Mirror about the water line with a vertical squash; the mirrored groups are drawn through
  // eight horizontal clip bands that drift sideways (ripple distortion), then faded.
  const mirror = `<g transform="translate(0 ${f(H * (1 + squash))}) scale(1 ${f(-squash)})"><use href="#pd-objs"/><use href="#pd-props"/></g>`
  let bands = ''
  for (let i = 0; i < 8; i++) {
    bands += `<clipPath id="pd-rb${i}"><rect x="-500" y="${f(H + i * 22)}" width="2600" height="22"/></clipPath>`
    bands += `<g class="rband" data-i="${i}" clip-path="url(#pd-rb${i})" opacity=".7">${mirror}</g>`
  }
  let rstreaks = ''
  for (let i = 0; i < 8; i++)
    rstreaks += ellipse(
      -100 + i * 300 + (i % 3) * 60,
      H + 10 + i * 16,
      140 + (i % 4) * 40,
      1.5 + (i % 2),
      v('sky-low'),
      'opacity=".45"',
    )
  // Base water under the reflections: the near water plane is transparent at its horizon band so
  // this far reflective strip shows through it.
  const reflection = `${rect(-500, H, 2600, 400, 'url(#pd-reflBase)')}${bands}${rect(-500, H, 2600, 176, 'url(#pd-reflFade)')}${rstreaks}`
  const band = (y: number, h: number, fill: string, seed: number) =>
    path(
      wobbly(
        [
          [-500, y],
          [2100, y],
          [2100, y + h],
          [-500, y + h],
        ],
        3,
        seed,
      ),
      fill,
    )
  const inner = `<defs>${linGrad('pd-bandW', [
    [0, '#9fb1ad'],
    [1, '#86988f'],
  ])}${linGrad('pd-bandG', [
    [0, '#6c8763'],
    [1, '#55704f'],
  ])}${fadeGrad('pd-overhang', v('ao-cool'), 0.45, 0)}${cyl('pd-pole', v('wood-dark'), v('wood-mid'), v('wood-lit'), 0.3)}${folds(
    'pd-coat',
    v('indigo-cloth'),
    '#4a5678',
    '#2f3852',
    3,
  )}${aoGrad('pd-ao', v('ao-cool'), 0.5)}${cedarDefs('pdfar', true)}${radGrad('pd-mist', [
    [0, v('mist'), 0.22],
    [1, v('mist'), 0],
  ])}${linGrad('pd-reflFade', [
    [0, v('paddy-water'), 0.1],
    [1, v('paddy-water'), 0.85],
  ])}${linGrad('pd-reflBase', [
    [0, v('paddy-reflect')],
    [1, v('paddy-water')],
  ])}</defs>
    <g id="pd-objs">
    ${[1160, 1250, 1340, 1430, 1520].map((x, i) => cedarFar(x, 642, 0.32 + (i % 2) * 0.06, 90 + i, 'pdfar')).join('')}
    ${band(640, 24, 'url(#pd-bandW)', 51)}${band(662, 18, 'url(#pd-bandG)', 52)}${band(678, 20, 'url(#pd-bandW)', 53)}${band(696, 14, 'url(#pd-bandG)', 54)}
    </g>
    ${reflection}
    <use href="#pd-objs"/>
    ${shadow(1035, 701, 70, 6, 'pd-ao', 0.6)}
    <g id="pd-props">
    ${rect(990, 640, 90, 60, v('plaster-shadow'))}
    ${polygon(
      [
        [976, 648],
        [990, 642],
        [990, 700],
        [982, 700],
      ],
      v('wood-dark'),
    )}
    ${rect(990, 640, 90, 12, 'url(#pd-overhang)')}
    ${polygon(
      [
        [975, 645],
        [1035, 608],
        [1095, 645],
      ],
      '#6f7a74',
    )}
    <path d="M975 645L1035 608" stroke="#8a948f" stroke-width="2"/>
    ${rect(1025, 664, 22, 36, v('paper-cool'))}${ellipse(1036, 682, 6, 10, v('lamp'), 'opacity=".35"')}
    ${shadow(700, 701, 26, 5, 'pd-ao', 0.5)}
    ${rect(696, 630, 8, 70, 'url(#pd-pole)')}${rect(670, 646, 60, 6, v('wood-mid'))}
    ${polygon(
      [
        [684, 650],
        [716, 650],
        [712, 690],
        [688, 690],
      ],
      'url(#pd-coat)',
    )}
    ${ellipse(700, 636, 20, 4, '#6f6238')}${ellipse(700, 632, 20, 7, '#a08f5a')}
    </g>
    ${fogRect('fog', -500, 590, 2600, 130)}`
  const mist = `${ellipse(300, 760, 700, 26, 'url(#pd-mist)')}${ellipse(1000, 775, 900, 30, 'url(#pd-mist)')}${ellipse(1500, 755, 700, 28, 'url(#pd-mist)')}`
  const animated = !quality.reducedMotion && !staticBands
  const layer = makeSvgLayer('paddy-far', { ...AIR.paddyFar, live: animated }, [
    { part: 'horizon', inner },
    { part: 'mist', inner: mist },
  ])
  if (animated) {
    for (const g of layer.el.querySelectorAll('.rband')) {
      const i = Number((g as HTMLElement).dataset.i ?? 0)
      animate(g, {
        translateX: [-(2 + 0.3 * i), 2 + 0.3 * i],
        duration: 1800 + 140 * i,
        loop: true,
        alternate: true,
        ease: 'inOutSine',
      })
    }
  }
  const fog = layer.el.querySelector('.fog')
  layer.update = (state) => {
    if (fog) {
      attrWrite(fog, 'opacity', (state.grade.fogMid * 0.7).toFixed(3))
      attrWrite(fog, 'fill', state.grade.fogColor)
    }
  }
  return layer
}

/** The flooded field: Fresnel water, aerial-perspective fog across the field, two-faced dikes, eight rice rows. */
export function paddyPlaneLayer(): Layer {
  const rnd = mulberry32(61)
  let rows = ''
  let reflections = ''
  let dashes = ''
  for (let k = 0; k < 8; k++) {
    const xk = 800 + (k - 3.5) * 190
    const xAtY = (y: number) => VP.x + (xk - VP.x) * ((y - VP.y) / 500)
    const y02 = VP.y + 500 * 0.04
    dashes += `M${VP.x} ${VP.y + 6}L${xAtY(y02).toFixed(1)} ${y02.toFixed(1)}`
    for (let t = 0.2; t <= 1.05; t += 0.08) {
      const y = VP.y + 500 * t * t
      const x = xAtY(y) + (rnd() - 0.5) * 10
      const h = 6 + 110 * t * t
      rows += riceClump(x, y, h, 61 + k * 31 + Math.round(t * 100), t < 0.5 ? 3 : 5)
      if (t > 0.5) {
        const w = h * 0.7
        reflections += polygon(
          [
            [x - w / 2, y],
            [x - w * 0.3, y + h * 0.27],
            [x, y + h * 0.45],
            [x + w * 0.3, y + h * 0.27],
            [x + w / 2, y],
          ],
          v('green-shadow'),
          'fill-opacity=".3"',
        )
      }
    }
  }
  let streaks = ''
  for (let i = 0; i < 12; i++)
    streaks += ellipse(
      100 + i * 140 + rnd() * 80,
      705 + rnd() * 70,
      90 + rnd() * 110,
      2 + rnd() * 4,
      '#b7c1bf',
      'opacity=".3"',
    )
  const inner = `<defs>${linGrad('pd-water', [
    [0, v('sky-low'), 0],
    [0.08, v('paddy-reflect'), 0.15],
    [0.25, v('paddy-water'), 1],
    [1, v('paddy-water-deep'), 1],
  ])}${linGrad('pd-gfog', [
    [0, v('fog-color'), 1],
    [1, v('fog-color'), 0],
  ])}</defs>
    ${rect(-300, VP.y, 2200, 1060, 'url(#pd-water)')}
    ${texRect('water', -300, VP.y, 2200, 560, 512, 0.5, 256)}
    ${streaks}
    <rect class="gfog" x="-300" y="${VP.y + 60}" width="2200" height="300" fill="url(#pd-gfog)" opacity="0"/>
    ${polygon(
      [
        [VP.x, VP.y],
        [-40, 1200],
        [40, 1200],
      ],
      v('mud-dark'),
      'fill-opacity=".2"',
    )}
    ${polygon(
      [
        [VP.x, VP.y],
        [1560, 1200],
        [1640, 1200],
      ],
      v('mud-dark'),
      'fill-opacity=".2"',
    )}
    ${polygon(
      [
        [VP.x, VP.y],
        [-120, 1200],
        [-40, 1200],
      ],
      v('mud-light'),
    )}
    ${polygon(
      [
        [VP.x, VP.y],
        [-40, 1200],
        [-10, 1200],
      ],
      v('mud-dark'),
    )}
    ${polygon(
      [
        [VP.x, VP.y],
        [1610, 1200],
        [1640, 1200],
      ],
      v('mud-dark'),
    )}
    ${polygon(
      [
        [VP.x, VP.y],
        [1640, 1200],
        [1720, 1200],
      ],
      v('mud-light'),
    )}
    <path d="${dashes}" stroke="${v('green-mid')}" stroke-width="3" stroke-dasharray="3 5" opacity=".7" fill="none"/>
    ${reflections}
    ${rows}`
  const layer = makeSvgLayer('paddy-plane', AIR.paddyPlane, inner)
  const gfog = [...layer.el.querySelectorAll<SVGRectElement>('.gfog')].map((el) => ({
    el,
    k: Number(el.dataset.k),
  }))
  layer.update = (state) => {
    for (const { el, k } of gfog) {
      attrWrite(el, 'opacity', (state.grade.fogMid * k).toFixed(3))
      attrWrite(el, 'fill', state.grade.fogColor)
    }
  }
  return layer
}

/** Big rice clumps at the frame edges with lit edges on the tallest blades (restCz 2600). */
export function paddyRiceNearLayer(): Layer {
  const inner = `
    ${riceClump(180, 1150, 210, 71, 9, true)}
    ${riceClump(1420, 1120, 190, 72, 7, true)}
    ${riceClump(760, 1230, 170, 73, 6, true)}
    ${ellipse(196, 1010, 3, 4, '#e6eef0', 'opacity=".8"')}${ellipse(1436, 990, 3, 4, '#e6eef0', 'opacity=".8"')}`
  return makeSvgLayer('paddy-rice-near', AIR.paddyRiceNear, inner)
}
