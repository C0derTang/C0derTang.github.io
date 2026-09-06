import { AIR } from '../../config/layers'
import { aoGrad, cyl, fadeGrad, linGrad, path, rect, shadow, v, wobbly } from '../draw'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'

/** Back porch seen from the shoji: eave underside, wet floorboards with a sky sheen, a shaded post (restCz 2600). */
export function paddyEngawaLayer(): Layer {
  const rafters = Array.from({ length: 12 }, (_, i) =>
    rect(-200 + i * 190, -220, 16, 340, v('wood-mid'), 'opacity=".55"'),
  ).join('')
  const inner = `<defs>${linGrad('pd-eave', [
    [0, '#3a3128'],
    [1, '#5a4d3c'],
  ])}${fadeGrad('pd-rafterAO', v('ao-cool'), 0.4, 0)}${fadeGrad('pd-floorSheen', v('water-sheen'), 0.28, 0)}${fadeGrad(
    'pd-postRefl',
    v('wood-dark'),
    0.22,
    0,
  )}${cyl('pd-post', v('wood-dark'), v('wood-mid'), v('wood-lit'), 0.3)}${aoGrad('pd-ao', v('ao-cool'), 0.5)}</defs>
    ${path(
      wobbly(
        [
          [-280, -220],
          [1880, -220],
          [1880, 120],
          [-280, 120],
        ],
        6,
        81,
      ),
      'url(#pd-eave)',
    )}
    ${rafters}
    ${rect(-280, 100, 2160, 26, v('wood-dark'))}
    ${rect(-280, 126, 2160, 30, 'url(#pd-rafterAO)')}
    ${rect(-280, 1000, 2160, 420, v('wood-mid'))}
    <path d="M-280 1080H1880M-280 1160H1880M-280 1240H1880M-280 1320H1880" stroke="${v('wood-dark')}" stroke-width="2" opacity=".5"/>
    ${rect(-280, 1000, 2160, 90, 'url(#pd-floorSheen)')}
    ${rect(60, 1000, 64, 190, 'url(#pd-postRefl)')}
    ${rect(-280, 1000, 2160, 8, v('wet'), 'opacity=".35"')}
    ${rect(60, -220, 64, 1640, 'url(#pd-post)')}${rect(60, -220, 6, 1640, v('wood-mid'), 'opacity=".5"')}
    ${shadow(240, 1074, 40, 8, 'pd-ao', 0.6)}${shadow(310, 1070, 40, 8, 'pd-ao', 0.6)}
    ${rect(210, 1050, 60, 24, v('wood-mid'), 'rx="10"')}${rect(280, 1046, 60, 24, v('wood-mid'), 'rx="10"')}
    <path d="M240 1050v-8M310 1046v-8" stroke="${v('indigo-cloth')}" stroke-width="4"/>`
  return makeSvgLayer('paddy-engawa', AIR.paddyEngawa, inner)
}
