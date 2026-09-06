import { AIR } from '../../config/layers'
import { INK, brush, contour, granulated, hatchField, inkStyle, v, wash, washRect } from '../draw'
import type { InkStyle, P2 } from '../draw'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'

/** One geta sandal, seen from above: a washed sole contour and a crossed ink thong. */
function geta(x: number, y: number, w: number, seed: number, ink: InkStyle): string {
  const sole: readonly P2[] = [
    [x - w / 2, y],
    [x - w * 0.28, y - w * 0.2],
    [x + w * 0.28, y - w * 0.2],
    [x + w / 2, y],
    [x + w * 0.3, y + w * 0.18],
    [x - w * 0.3, y + w * 0.18],
  ]
  return (
    wash(sole, v('wood-wash-dark'), { seed, amp: w * 0.06, opacity: 0.55, rim: 1 }) +
    contour(sole, ink.w * 0.6, seed + 1, ink.color, ink.opacity) +
    brush(
      [
        [x, y - w * 0.18],
        [x - w * 0.14, y],
        [x, y + w * 0.14],
      ],
      { w: ink.w * 0.35, seed: seed + 2, wobble: 0.6, color: ink.color, opacity: ink.opacity },
    ) +
    brush(
      [
        [x, y - w * 0.18],
        [x + w * 0.14, y],
        [x, y + w * 0.14],
      ],
      { w: ink.w * 0.35, seed: seed + 3, wobble: 0.6, color: ink.color, opacity: ink.opacity },
    )
  )
}

/**
 * Back porch seen from the shoji, ink and wash (restCz 2600): the eave underside as long rafter
 * strokes over a granulated dark-thatch wash, wet floorboards as plank-seam strokes with a
 * grain-hatch wash and a paper sheen band at the front, and a near post in ink outline over a
 * wood wash with two geta sandals in ink.
 */
export function paddyEngawaLayer(): Layer {
  const eaveInk = inkStyle(2000) // 3 — eave and boards
  const postInk = inkStyle(600) // 4 — the near post, nearest of the three parts

  // -- eave: a granulated dark-thatch wash, long rafter strokes, one heavy drip-edge stroke,
  // and a straw-strand hatch along the underside --
  const rafterCount = 14
  let rafters = ''
  for (let i = 0; i < rafterCount; i++) {
    const x = -220 + i * 165
    rafters += brush(
      [
        [x, -240],
        [x + 3, -60],
        [x + 6, 130],
      ],
      {
        w: eaveInk.w * 1.3,
        seed: 810 + i,
        wobble: 1.5,
        color: eaveInk.color,
        opacity: eaveInk.opacity * 0.8,
        taper: [0.5, 0.5],
        peak: 0.5,
      },
    )
  }
  const eave =
    granulated('eg-eave', -400, -260, 2400, 400, v('thatch-wash-dark'), {
      seed: 800,
      amp: 16,
      opacity: 0.62,
      rim: 1,
      grain: 0.35,
    }) +
    rafters +
    brush(
      [
        [-400, 106],
        [500, 100],
        [1400, 104],
        [2000, 98],
      ],
      {
        w: eaveInk.w * 1.6,
        seed: 820,
        wobble: 3,
        color: eaveInk.color,
        opacity: eaveInk.opacity,
        taper: [0.05, 0.05],
        peak: 0.5,
      },
    ) +
    brush(
      [
        [-400, 128],
        [700, 124],
        [1600, 127],
        [2000, 123],
      ],
      {
        w: eaveInk.w * 0.7,
        seed: 823,
        wobble: 2,
        color: eaveInk.color,
        opacity: eaveInk.opacity * 0.7,
        taper: [0.2, 0.2],
        peak: 0.5,
      },
    ) +
    washRect(-400, 108, 2400, 34, v('thatch-wash-dark'), {
      seed: 821,
      amp: 6,
      opacity: 0.4,
      rim: 0,
    }) +
    hatchField(-400, -240, 2400, 340, Math.round(70 * INK.detail), Math.PI / 2, 30, 822, {
      w: 1.2,
      color: eaveInk.color,
      opacity: 0.5,
      jitter: 0.3,
      lenJitter: 0.5,
    })

  // -- boards: a granulated wet-wood wash, a darker pooled patch, plank-seam strokes,
  // a grain-hatch, and a pale paper-sheen band at the front (nearest the shoji) --
  const seamYs = [1050, 1110, 1170, 1230, 1290, 1350, 1400]
  let seams = ''
  for (const [i, y] of seamYs.entries()) {
    seams += brush(
      [
        [-400, y + (i % 2)],
        [700, y],
        [1600, y + 2],
        [2000, y],
      ],
      {
        w: eaveInk.w * 0.6,
        seed: 830 + i,
        wobble: 2,
        color: eaveInk.color,
        opacity: eaveInk.opacity * 0.7,
        taper: [0.15, 0.15],
        peak: 0.5,
      },
    )
  }
  const boards =
    granulated('eg-boards', -400, 1000, 2400, 440, v('wood-wash'), {
      seed: 840,
      amp: 14,
      opacity: 0.6,
      rim: 1,
      grain: 0.4,
    }) +
    washRect(-400, 1260, 2400, 180, v('wood-wash-dark'), {
      seed: 841,
      amp: 12,
      opacity: 0.28,
      rim: 0,
    }) +
    wash(
      [
        [140, 1180],
        [230, 1170],
        [260, 1220],
        [150, 1236],
      ],
      v('wood-wash-dark'),
      { seed: 844, amp: 10, opacity: 0.3, rim: 0 },
    ) +
    seams +
    hatchField(-400, 1000, 2400, 420, Math.round(160 * INK.detail), 0, 26, 842, {
      w: 1,
      color: eaveInk.color,
      opacity: 0.4,
      jitter: 0.15,
      lenJitter: 0.5,
    }) +
    washRect(-400, 1000, 2400, 60, v('water-sheen'), { seed: 843, amp: 8, opacity: 0.3, rim: 0 })

  // -- post: two ink edges over a wood wash with a pale reflection sliver, and two geta on the
  // boards at its foot --
  const postX0 = 60
  const postW = 64
  const post =
    washRect(postX0, -260, postW, 1680, v('wood-wash'), {
      seed: 850,
      amp: 4,
      opacity: 0.62,
      rim: 0,
    }) +
    washRect(postX0, -260, postW * 0.4, 1680, v('wood-wash-dark'), {
      seed: 851,
      amp: 3,
      opacity: 0.4,
      rim: 0,
    }) +
    brush(
      [
        [postX0, -260],
        [postX0 - 2, 1420],
      ],
      {
        w: postInk.w * 1.1,
        seed: 852,
        wobble: 1.2,
        color: postInk.color,
        opacity: postInk.opacity,
      },
    ) +
    brush(
      [
        [postX0 + postW, -260],
        [postX0 + postW + 3, 1420],
      ],
      {
        w: postInk.w * 0.9,
        seed: 853,
        wobble: 1.2,
        color: postInk.color,
        opacity: postInk.opacity,
      },
    ) +
    // corner braces where the post meets the eave
    brush(
      [
        [postX0, 118],
        [postX0 - 30, 96],
      ],
      {
        w: postInk.w * 0.5,
        seed: 854,
        wobble: 0.8,
        color: postInk.color,
        opacity: postInk.opacity,
      },
    ) +
    brush(
      [
        [postX0 + postW, 118],
        [postX0 + postW + 30, 96],
      ],
      {
        w: postInk.w * 0.5,
        seed: 855,
        wobble: 0.8,
        color: postInk.color,
        opacity: postInk.opacity,
      },
    ) +
    geta(220, 1080, 70, 860, postInk) +
    geta(320, 1055, 66, 862, postInk)

  return makeSvgLayer('paddy-engawa', AIR.paddyEngawa, [
    { part: 'eave', inner: eave },
    { part: 'boards', inner: boards },
    { part: 'post', inner: post },
  ])
}
