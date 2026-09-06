import { AIR } from '../../config/layers'
import {
  INK,
  brush,
  ellipsePts,
  fogRect,
  granulated,
  hatch,
  inkFoliage,
  inkStyle,
  v,
  wash,
} from '../draw'
import type { P2 } from '../draw'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'
import { attrWrite } from '../../util/dom'
import { mulberry32 } from '../../util/math'

/**
 * Distant tree band at the horizon, ink and wash: a green wash band under a row of thin
 * far-cedar crown strokes and a few rounder foliage masses, a fainter telephone pole and its
 * wires further off, a bamboo grove of thin culm strokes with node marks and leaf flicks, and a
 * lineless mist band nearest the camera. `ink` is `inkStyle` at this depth: weight 1.2, `--ink-far`
 * at .7.
 */
export function treelineLayer(): Layer {
  const ink = inkStyle(AIR.treeline.depth)
  const rnd = mulberry32(41)

  // -- band: a wobbly-topped wash, a row of crown-zigzag strokes, foliage masses, a telephone pole --
  const crownCount = 20
  let crowns = ''
  for (let i = 0; i < crownCount; i++) {
    const x = -420 + (i * 2420) / (crownCount - 1) + (rnd() - 0.5) * 40
    const y = 800 - rnd() * 90
    const w = 66 + rnd() * 38
    const h = 55 + rnd() * 48
    const zig: P2[] = [
      [x - w * 0.5, y + h * 0.35],
      [x - w * 0.3, y - h * 0.1],
      [x - w * 0.1, y + h * 0.1],
      [x + w * 0.05, y - h * 0.5],
      [x + w * 0.22, y + h * 0.05],
      [x + w * 0.42, y - h * 0.2],
      [x + w * 0.5, y + h * 0.3],
    ]
    crowns += brush(zig, {
      w: ink.w,
      seed: 200 + i,
      wobble: 1.5,
      color: ink.color,
      opacity: ink.opacity,
      taper: [0.6, 0.6],
      peak: 0.5,
    })
  }
  let masses = ''
  for (let i = 0; i < 6; i++) {
    const x = -260 + i * 400 + rnd() * 90
    masses += inkFoliage(x, 748, 140 + rnd() * 55, 220 + i, {
      ink,
      detail: INK.detail,
      wash: v('hills'),
    })
  }
  // Clear of the bamboo grove's backdrop wash (x 1256..1528): a pole there would be hidden behind it.
  const poleX = 1560
  const pw = ink.w
  const pole =
    brush(
      [
        [poleX, 636],
        [poleX + 2, 760],
      ],
      { w: pw * 1.6, seed: 61, wobble: 0.6, color: ink.color, opacity: ink.opacity * 0.75 },
    ) +
    brush(
      [
        [poleX - 26, 652],
        [poleX + 26, 648],
      ],
      { w: pw * 1.1, seed: 62, wobble: 0.4, color: ink.color, opacity: ink.opacity * 0.7 },
    ) +
    brush(
      [
        [-420, 636],
        [poleX - 24, 653],
        [poleX + 340, 662],
        [2000, 674],
      ],
      {
        w: pw * 0.9,
        seed: 63,
        wobble: 3,
        color: ink.color,
        opacity: ink.opacity * 0.55,
        taper: [0.6, 0.6],
        peak: 0.5,
      },
    ) +
    brush(
      [
        [-420, 660],
        [poleX - 24, 648],
        [poleX + 340, 640],
        [2000, 652],
      ],
      {
        w: pw * 0.9,
        seed: 64,
        wobble: 3,
        color: ink.color,
        opacity: ink.opacity * 0.55,
        taper: [0.6, 0.6],
        peak: 0.5,
      },
    )
  const bandPart =
    granulated('tl-band', -500, 700, 2600, 460, v('hills'), {
      seed: 40,
      amp: 18,
      opacity: 0.6,
      rim: 1,
    }) +
    crowns +
    masses +
    pole

  // -- bamboo: a soft backdrop wash (an organic mass, not a hard rect), thin culm strokes, node
  // marks, a few leaf flicks --
  const bambooX0 = 1290
  const bambooX1 = bambooX0 + 6 * 34
  const bambooCx = (bambooX0 + bambooX1) / 2
  let bamboo = wash(ellipsePts(bambooCx, 690, bambooCx - bambooX0 + 60, 175, 12, 0.6), v('hedge'), {
    seed: 70,
    amp: 26,
    opacity: 0.4,
    rim: 0,
  })
  for (let i = 0; i < 7; i++) {
    const x = bambooX0 + i * 34
    const y0 = 540 + (i % 2) * 20
    const y1 = 840
    bamboo += brush(
      [
        [x, y1],
        [x + 3, (y0 + y1) / 2],
        [x + 1, y0],
      ],
      {
        w: ink.w * 1.8,
        seed: 71 + i,
        wobble: 1,
        color: ink.color,
        opacity: ink.opacity,
        taper: [0.35, 0.05],
        peak: 0.35,
      },
    )
    for (let y = y0 + 36; y < y1; y += 42) {
      bamboo += hatch(x - 5, y, 10, 0, ink.w * 0.6, ink.color, ink.opacity * 0.8)
    }
    const leaves = Math.round(3 * INK.detail)
    for (let k = 0; k < leaves; k++) {
      const ly = y0 + 20 + k * 30 + rnd() * 10
      const dir = k % 2 === 0 ? 1 : -1
      bamboo += brush(
        [
          [x, ly],
          [x + dir * 26, ly - 10 - rnd() * 6],
        ],
        {
          w: ink.w * 0.9,
          seed: 80 + i * 5 + k,
          wobble: 1,
          color: ink.color,
          opacity: ink.opacity * 0.85,
          taper: [0.15, 0.02],
        },
      )
    }
  }

  // -- mist: lineless pale ground-mist hugging the base (below the crown row), plus the
  // weather-fog overlay the update() hook drives --
  const mistPart =
    wash(
      [
        [-500, 800],
        [400, 770],
        [1200, 800],
        [2100, 780],
        [2100, 950],
        [-500, 950],
      ],
      v('cloud'),
      { seed: 90, amp: 20, opacity: 0.35, rim: 0 },
    ) + fogRect('fog fogc', -500, 500, 2600, 700)

  const layer = makeSvgLayer('treeline', AIR.treeline, [
    { part: 'band', inner: bandPart },
    { part: 'bamboo', inner: bamboo },
    { part: 'mist', inner: mistPart },
  ])
  const fog = layer.el.querySelector('.fog')
  layer.update = (state) => {
    if (fog) {
      attrWrite(fog, 'opacity', (state.grade.fogMid * 0.6).toFixed(3))
      attrWrite(fog, 'fill', state.grade.fogColor)
    }
  }
  return layer
}
