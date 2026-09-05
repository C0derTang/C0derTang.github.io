import { AIR } from '../../config/layers'
import { ellipse, fogRect, linGrad, path, polygon, rect, riceClump, v, wobbly } from '../draw'
import { PADDY } from '../geometry'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'
import { attrWrite } from '../../util/dom'
import { mulberry32 } from '../../util/math'

const VP = { x: 800, y: PADDY.horizonY }

/** Far paddies at the horizon, a shed, a scarecrow (restCz 2600). */
export function paddyFarLayer(): Layer {
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
  const inner = `
    ${band(640, 24, '#8fa39f', 51)}${band(662, 18, '#5f7a5c', 52)}${band(678, 20, '#8fa39f', 53)}${band(696, 14, '#5f7a5c', 54)}
    ${rect(990, 640, 90, 60, v('wood-dark'))}
    ${polygon(
      [
        [975, 645],
        [1035, 608],
        [1095, 645],
      ],
      '#5a6560',
    )}
    ${rect(1025, 664, 22, 36, v('paper-cool'))}
    ${rect(696, 630, 8, 70, v('wood-mid'))}${rect(670, 646, 60, 6, v('wood-mid'))}
    ${ellipse(700, 632, 20, 7, '#a08f5a')}
    ${polygon(
      [
        [684, 650],
        [716, 650],
        [712, 690],
        [688, 690],
      ],
      v('indigo-cloth'),
    )}
    ${fogRect('fog', -500, 590, 2600, 130)}`
  const layer = makeSvgLayer('paddy-far', AIR.paddyFar, inner)
  const fog = layer.el.querySelector('.fog')
  layer.update = (state) => {
    if (fog) {
      attrWrite(fog, 'opacity', (state.grade.fogMid * 0.7).toFixed(3))
      attrWrite(fog, 'fill', state.grade.fogColor)
    }
  }
  return layer
}

/** The flooded field: water plane, dikes, eight rice rows converging on the vanishing point. */
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
      rows += riceClump(x, y, h, 61 + k * 31 + Math.round(t * 100))
      if (t > 0.5)
        reflections += ellipse(
          x,
          y + h * 0.12,
          h * 0.35,
          h / 3 / 2,
          v('paddy-water-deep'),
          'opacity=".35"',
        )
    }
  }
  let streaks = ''
  for (let i = 0; i < 6; i++)
    streaks += ellipse(
      200 + i * 260 + rnd() * 80,
      720 + rnd() * 80,
      100 + rnd() * 100,
      3 + rnd() * 4,
      '#b7c1bf',
      'opacity=".3"',
    )
  const inner = `<defs>${linGrad('pd-water', [
    [0, v('paddy-reflect')],
    [0.25, v('paddy-water')],
    [1, v('paddy-water-deep')],
  ])}</defs>
    ${rect(-300, VP.y, 2200, 1060, 'url(#pd-water)')}
    ${streaks}
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
        [1640, 1200],
        [1720, 1200],
      ],
      v('mud-light'),
    )}
    <path d="${dashes}" stroke="${v('green-mid')}" stroke-width="3" stroke-dasharray="3 5" opacity=".7" fill="none"/>
    ${reflections}
    ${rows}`
  return makeSvgLayer('paddy-plane', AIR.paddyPlane, inner)
}

/** Big rice clumps at the frame edges (restCz 2600). */
export function paddyRiceNearLayer(): Layer {
  const inner = `
    ${riceClump(180, 1150, 210, 71, 9)}
    ${riceClump(1420, 1120, 190, 72, 7)}
    ${riceClump(760, 1230, 170, 73, 6)}
    ${ellipse(196, 1010, 3, 4, '#e6eef0', 'opacity=".8"')}${ellipse(1436, 990, 3, 4, '#e6eef0', 'opacity=".8"')}`
  return makeSvgLayer('paddy-rice-near', AIR.paddyRiceNear, inner)
}
