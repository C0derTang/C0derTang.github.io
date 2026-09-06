import { AIR } from '../../config/layers'
import {
  INK,
  brush,
  ellipsePts,
  hatch,
  hatchField,
  inkFoliage,
  inkHydrangea,
  inkStyle,
  v,
  wash,
  type InkStyle,
  type P2,
} from '../draw'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'
import { mulberry32 } from '../../util/math'

/**
 * Foreground wet path in front of the house (restCz 0), ink and wash: a grey road wash tapering
 * up to the doorway between wet-grass verges, two puddles with squashed reflections of the lit
 * window and the hydrangeas broken by ripple strokes, and two larger hydrangea bushes flanking
 * the path in the foreground's heavier ink weight.
 */
export function groundLayer(): Layer {
  const ink = inkStyle(AIR.ground.depth)
  const heavy: InkStyle = { w: 6, color: v('ink'), opacity: 1 }

  const grassFlicks = (
    x0: number,
    x1: number,
    y0: number,
    h: number,
    count: number,
    seed: number,
  ): string =>
    hatchField(x0, y0, x1 - x0, h, count * INK.detail, -Math.PI / 2, Math.min(30, h * 0.4), seed, {
      w: 1.6,
      color: v('leaf'),
      opacity: 0.55,
      jitter: 0.8,
      lenJitter: 0.5,
    })

  const road: readonly P2[] = [
    [520, 940],
    [1080, 940],
    [1460, 1600],
    [140, 1600],
  ]

  /** A thin band of colour parallel to a road edge, `side` px normal to it (1 = left-hand
   * normal, -1 = right-hand) offset outward into the grass. Used for the road-edge grass
   * density and the wet-sheen glaze so both hug the actual diagonal edge. */
  const edgeNormal = (x0: number, y0: number, x1: number, y1: number, side: 1 | -1): P2 => {
    const dx = x1 - x0
    const dy = y1 - y0
    const len = Math.hypot(dx, dy) || 1
    return [(-dy / len) * side, (dx / len) * side]
  }

  const edgeGrass = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    side: 1 | -1,
    count: number,
    seed: number,
  ): string => {
    const rnd = mulberry32(seed)
    const [nx, ny] = edgeNormal(x0, y0, x1, y1, side)
    const n = Math.round(count * INK.detail)
    let out = ''
    for (let i = 0; i < n; i++) {
      const t = rnd()
      const px = x0 + (x1 - x0) * t
      const py = y0 + (y1 - y0) * t
      const off = 6 + rnd() * 30
      const a = -Math.PI / 2 + (rnd() - 0.5) * 0.8
      const l = 14 + rnd() * 16
      out += hatch(px + nx * off, py + ny * off, l, a, 1.6, v('leaf'), 0.6)
    }
    return out
  }

  const sheenBand = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    side: 1 | -1,
    width: number,
    seed: number,
  ): string => {
    const [nx, ny] = edgeNormal(x0, y0, x1, y1, side)
    const pts: P2[] = [
      [x0 + nx * 4, y0 + ny * 4],
      [x1 + nx * 4, y1 + ny * 4],
      [x1 + nx * (4 + width), y1 + ny * (4 + width)],
      [x0 + nx * (4 + width), y0 + ny * (4 + width)],
    ]
    return wash(pts, v('water-sheen'), { seed, amp: 8, opacity: 0.3, rim: 0 })
  }

  /** Long horizontal tonal glazes breaking up the flat lawn green. */
  const streaks = Array.from({ length: 7 }, (_, i) => {
    const y = 970 + i * 95
    const op = 0.25 + (i % 3) * 0.05
    return wash(
      [
        [-400, y - 16],
        [600, y + 10],
        [1300, y - 12],
        [2000, y + 14],
      ],
      v('green-deep'),
      { seed: 56 + i, amp: 14, opacity: op, rim: 0 },
    )
  }).join('')

  /** Low clipped hedge along the far edge of the lawn, under the porch. */
  const hedge =
    inkFoliage(180, 930, 200, 65, { ink, detail: INK.detail }) +
    inkFoliage(800, 928, 220, 66, { ink, detail: INK.detail }) +
    inkFoliage(1380, 930, 200, 67, { ink, detail: INK.detail })

  const puddle = (x: number, y: number, rx: number, ry: number, seed: number): string =>
    wash(ellipsePts(x, y, rx, ry, 12, 0), v('puddle'), {
      seed,
      amp: rx * 0.08,
      opacity: 0.6,
      rim: 1.2,
    })

  const reflection = (
    x: number,
    y: number,
    rx: number,
    ry: number,
    color: string,
    seed: number,
  ): string =>
    wash(ellipsePts(x, y, rx, ry, 10, 0), color, { seed, amp: rx * 0.1, opacity: 0.25, rim: 0 })

  const ripple = (x: number, y: number, w: number, seed: number): string =>
    brush(
      [
        [x - w / 2, y],
        [x, y + (seed % 2 ? 2 : -2)],
        [x + w / 2, y],
      ],
      {
        w: 1.4,
        seed,
        wobble: 1.5,
        color: ink.color,
        opacity: 0.4,
      },
    )

  const hydrangeaColors = [v('hydrangea-blue'), v('hydrangea-violet'), v('hydrangea-pink')]
  const bush = (x: number, y: number, seed: number): string => {
    const rnd = mulberry32(seed)
    let out = ''
    for (let i = 0; i < 4; i++) {
      const hx = x + (rnd() - 0.5) * 140
      const hy = y - rnd() * 70
      const r = 40 + rnd() * 20
      out += inkHydrangea(hx, hy, r, seed + i * 11 + 3, {
        ink: heavy,
        detail: INK.detail,
        color: hydrangeaColors[i % hydrangeaColors.length] ?? v('hydrangea-blue'),
        florets: 3,
        leaves: false,
      })
    }
    return out
  }

  const inner = `
    ${wash(
      [
        [-400, 900],
        [2000, 900],
        [2000, 1600],
        [-400, 1600],
      ],
      v('hedge'),
      { seed: 20, amp: 16, opacity: 0.5, rim: 0 },
    )}
    ${wash(
      [
        [-400, 1000],
        [300, 980],
        [1300, 980],
        [2000, 1000],
        [2000, 1600],
        [-400, 1600],
      ],
      v('leaf'),
      { seed: 25, amp: 20, opacity: 0.25, rim: 0 },
    )}
    ${streaks}
    ${hedge}
    ${grassFlicks(-400, 280, 910, 680, 130, 50)}
    ${grassFlicks(1480, 2000, 910, 680, 130, 51)}
    ${grassFlicks(300, 500, 905, 90, 36, 52)}
    ${grassFlicks(1100, 1300, 905, 90, 36, 53)}
    ${edgeGrass(520, 940, 140, 1600, 1, 70, 54)}
    ${edgeGrass(1080, 940, 1460, 1600, -1, 70, 55)}
    ${wash(road, v('road'), { seed: 21, amp: 20, opacity: 0.6, rim: 1.4 })}
    ${brush(
      [
        [520, 940],
        [140, 1600],
      ],
      {
        w: ink.w,
        seed: 22,
        wobble: 4,
        color: ink.color,
        opacity: ink.opacity * 0.8,
      },
    )}
    ${brush(
      [
        [1080, 940],
        [1460, 1600],
      ],
      {
        w: ink.w,
        seed: 23,
        wobble: 4,
        color: ink.color,
        opacity: ink.opacity * 0.8,
      },
    )}
    ${sheenBand(520, 940, 140, 1600, 1, 22, 57)}
    ${sheenBand(1080, 940, 1460, 1600, -1, 22, 58)}
    ${puddle(880, 1040, 150, 34, 30)}
    ${reflection(860, 1030, 70, 16, v('window-amber'), 31)}
    ${ripple(880, 1020, 200, 32)}
    ${ripple(880, 1038, 220, 33)}
    ${ripple(880, 1054, 180, 34)}
    ${puddle(1120, 1010, 110, 26, 40)}
    ${reflection(1130, 1002, 55, 13, v('hydrangea-violet'), 41)}
    ${ripple(1120, 996, 150, 42)}
    ${ripple(1120, 1012, 170, 43)}
    ${bush(240, 1085, 200)}
    ${bush(1360, 1095, 220)}
  `
  return makeSvgLayer('ground', AIR.ground, inner)
}
