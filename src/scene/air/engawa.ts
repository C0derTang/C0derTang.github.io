import { AIR } from '../../config/layers'
import { linGrad, path, rect, v, wobbly } from '../draw'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'

/** Back porch seen from the shoji: eave underside above, floorboards below, a post left (restCz 2600). */
export function paddyEngawaLayer(): Layer {
  const rafters = Array.from({ length: 8 }, (_, i) =>
    rect(-120 + i * 260, 226, 14, 22, v('wood-dark')),
  ).join('')
  const inner = `<defs>${linGrad('pd-eave', [
    [0, v('thatch-dark')],
    [1, '#2c241c'],
  ])}</defs>
    ${path(
      wobbly(
        [
          [-280, -220],
          [1880, -220],
          [1880, 250],
          [-280, 250],
        ],
        6,
        81,
      ),
      'url(#pd-eave)',
    )}
    ${rafters}
    ${rect(60, -220, 64, 1640, v('wood-dark'))}${rect(60, -220, 8, 1640, v('wood-mid'))}
    ${rect(-280, 1000, 2160, 420, v('wood-light'))}
    ${rect(-280, 1000, 2160, 12, '#b08a5e', 'opacity=".5"')}
    <path d="M-280 1080H1880M-280 1160H1880M-280 1240H1880M-280 1320H1880" stroke="${v('wood-mid')}" stroke-width="2" opacity=".6"/>
    ${rect(210, 1050, 60, 24, v('wood-mid'), 'rx="10"')}${rect(280, 1046, 60, 24, v('wood-mid'), 'rx="10"')}
    <path d="M240 1050v-8M310 1046v-8" stroke="${v('indigo-cloth')}" stroke-width="4"/>`
  return makeSvgLayer('paddy-engawa', AIR.paddyEngawa, inner)
}
