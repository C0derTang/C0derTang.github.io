import { AIR } from '../../config/layers'
import {
  INK,
  brush,
  circle,
  contour,
  ellipsePts,
  granulated,
  hatch,
  hatchField,
  inkEdges,
  inkHydrangea,
  inkStyle,
  v,
  wash,
  washRect,
  type P2,
} from '../draw'
import { DOORWAY, HOUSE } from '../geometry'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'
import { attrWrite } from '../../util/dom'
import { mulberry32 } from '../../util/math'

const deg = (d: number): number => (d * Math.PI) / 180

function rectPts(x: number, y: number, w: number, h: number): P2[] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]
}

/**
 * The farmhouse front (restCz 0), ink and wash. Three depths: plaster walls with a bicycle
 * under the eave, a thatch roof of a silhouette wash and pitched hatch strands, and a nearer
 * yard of posts, a gravel path, a stone lantern, hydrangeas and a telephone pole with sagging
 * wires. The doorway (DOORWAY) stays unpainted in every part so the interior/noren show through.
 */
export function houseLayer(): Layer {
  const H = HOUSE
  const ink = inkStyle(AIR.house.depth)

  /** Ink frame for a straight-edged polygon (rect, trapezoid, triangle): `inkEdges` at the
   * layer's ink colour/opacity. */
  const frame = (pts: readonly P2[], width: number, seed: number): string =>
    inkEdges(pts, width, seed, ink.color, ink.opacity)

  /** Porch board band: identical markup in `walls` and `posts` so their seam self-hides. */
  const porchBand = (seed: number): string =>
    washRect(H.left, H.wallBottom, H.sideRight - H.left, 22, v('wood-wash'), {
      seed,
      amp: 3,
      opacity: 0.6,
      rim: 1,
    }) +
    brush(
      [
        [H.left - 14, H.wallBottom + 1],
        [H.sideRight + 14, H.wallBottom + 2],
      ],
      {
        w: ink.w * 0.7,
        seed: seed + 1,
        wobble: 2,
        color: ink.color,
        opacity: ink.opacity,
      },
    ) +
    brush(
      [
        [H.left - 14, H.wallBottom + 21],
        [H.sideRight + 14, H.wallBottom + 20],
      ],
      {
        w: ink.w * 0.55,
        seed: seed + 2,
        wobble: 2,
        color: ink.color,
        opacity: ink.opacity * 0.8,
      },
    ) +
    hatchField(
      H.left + 6,
      H.wallBottom + 3,
      H.sideRight - H.left - 12,
      17,
      16 * INK.detail,
      Math.PI / 2,
      15,
      seed + 3,
      { w: 1.3, color: ink.color, opacity: 0.45, jitter: 0.1, lenJitter: 0.3 },
    )

  // ---------------- walls ----------------

  const wallPiece = (x0: number, x1: number, side: 'l' | 'r', seed: number): string => {
    const dadoY = 724
    // Two separate strokes (top edge, outer side edge) rather than one path through the
    // corner: brush() Catmull-Rom-smooths its points, and a sharp 90deg turn between two long
    // segments overshoots into a wide rounded bulge instead of a crisp corner.
    const outerX = side === 'l' ? x0 : x1
    const silhouette =
      brush(
        [
          [x0, H.wallTop],
          [x1, H.wallTop],
        ],
        { w: ink.w, seed: seed + 5, wobble: 2.5, color: ink.color, opacity: ink.opacity },
      ) +
      brush(
        [
          [outerX, H.wallTop],
          [outerX, H.wallBottom - 6],
        ],
        { w: ink.w, seed: seed + 6, wobble: 2.5, color: ink.color, opacity: ink.opacity },
      )
    return (
      granulated(`hs-wall-${side}`, x0, H.wallTop, x1 - x0, dadoY - H.wallTop, v('plaster'), {
        seed,
        amp: 6,
        opacity: 0.55,
        rim: 1,
      }) +
      wash(
        [
          [x0 + (x1 - x0) * 0.12, H.wallTop + 18],
          [x0 + (x1 - x0) * 0.5, H.wallTop + 8],
          [x0 + (x1 - x0) * 0.86, H.wallTop + 34],
          [x0 + (x1 - x0) * 0.66, dadoY - 26],
          [x0 + (x1 - x0) * 0.22, dadoY - 14],
        ],
        v('paper'),
        { seed: seed + 1, amp: 10, opacity: 0.22, rim: 0 },
      ) +
      washRect(x0, dadoY, x1 - x0, H.wallBottom - dadoY, v('wood-wash-dark'), {
        seed: seed + 2,
        amp: 3,
        opacity: 0.6,
        rim: 1,
      }) +
      hatchField(
        x0 + 6,
        dadoY + 4,
        x1 - x0 - 12,
        H.wallBottom - dadoY - 10,
        11 * INK.detail,
        -Math.PI / 2,
        H.wallBottom - dadoY - 10,
        seed + 3,
        { w: 1.3, color: ink.color, opacity: 0.4, jitter: 0.06, lenJitter: 0.15 },
      ) +
      brush(
        [
          [x0, dadoY],
          [x1, dadoY],
        ],
        {
          w: ink.w * 0.55,
          seed: seed + 4,
          wobble: 1.5,
          color: ink.color,
          opacity: ink.opacity * 0.7,
        },
      ) +
      // Dark wet glaze along the base of the wall, above the porch.
      wash(
        [
          [x0, H.wallBottom - 40],
          [x1, H.wallBottom - 40],
          [x1, H.wallBottom],
          [x0, H.wallBottom],
        ],
        v('wood-wash-dark'),
        { seed: seed + 7, amp: 4, opacity: 0.3, rim: 0 },
      ) +
      silhouette
    )
  }

  const winMark = (x: number, y: number, w: number, h: number, seed: number): string => {
    const pts = rectPts(x, y, w, h)
    return (
      wash(pts, v('window-amber'), {
        seed,
        amp: 4,
        opacity: 0.6,
        rim: 1.2,
        bloom: { color: v('lamp-core'), scale: 0.55, opacity: 0.5 },
      }) +
      frame(pts, ink.w * 0.55, seed + 1) +
      brush(
        [
          [x + w / 2, y - 3],
          [x + w / 2, y + h + 3],
        ],
        {
          w: ink.w * 0.4,
          seed: seed + 2,
          wobble: 1,
          color: ink.color,
          opacity: ink.opacity,
        },
      ) +
      brush(
        [
          [x - 3, y + h / 2],
          [x + w + 3, y + h / 2],
        ],
        {
          w: ink.w * 0.4,
          seed: seed + 3,
          wobble: 1,
          color: ink.color,
          opacity: ink.opacity,
        },
      )
    )
  }

  const leanTo = (seed: number): string =>
    washRect(1172, 556, 90, 254, v('wood-wash-dark'), { seed, amp: 4, opacity: 0.6, rim: 1 }) +
    brush(
      [
        [1172, 556],
        [1262, 568],
      ],
      {
        w: ink.w * 0.8,
        seed: seed + 1,
        wobble: 1.5,
        color: ink.color,
        opacity: ink.opacity,
      },
    ) +
    Array.from({ length: 6 }, (_, i) => {
      const x = 1180 + i * 13
      return brush(
        [
          [x, 600],
          [x + 1, 808],
        ],
        {
          w: 3,
          seed: seed + 2 + i,
          wobble: 1,
          color: v('ink'),
          opacity: 0.9,
        },
      )
    }).join('')

  const bicycle = (cx: number, seed: number): string => {
    const rnd = mulberry32(seed)
    const r = 44
    const rearX = cx
    const frontX = cx + 92
    const hubY = H.wallBottom - r - 2
    const wheel = (x: number, sd: number): string => {
      let spokes = ''
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + rnd() * 0.3
        spokes += hatch(x, hubY, r * 0.84, a, 0.9, ink.color, 0.6)
      }
      return (
        wash(ellipsePts(x, hubY, r * 0.82, r * 0.82, 10, rnd() * 6), v('tyre'), {
          seed: sd,
          amp: r * 0.12,
          opacity: 0.35,
          rim: 0,
        }) +
        contour(ellipsePts(x, hubY, r, r, 20), 3, sd + 1, ink.color, ink.opacity) +
        spokes +
        circle(x, hubY, 4, ink.color)
      )
    }
    const seatX = rearX + 16
    const seatY = hubY - r * 0.98
    const barX = frontX - 8
    const barY = hubY - r * 1.08
    const frame =
      brush(
        [
          [rearX, hubY],
          [seatX, seatY],
        ],
        {
          w: 2.6,
          seed: seed + 20,
          wobble: 1,
          color: v('bicycle'),
          opacity: 0.9,
        },
      ) +
      brush(
        [
          [seatX, seatY],
          [barX, barY],
        ],
        {
          w: 2.2,
          seed: seed + 21,
          wobble: 1,
          color: v('bicycle'),
          opacity: 0.9,
        },
      ) +
      brush(
        [
          [rearX, hubY],
          [barX - 4, barY + 10],
        ],
        {
          w: 2,
          seed: seed + 22,
          wobble: 1,
          color: v('bicycle'),
          opacity: 0.85,
        },
      ) +
      brush(
        [
          [seatX, seatY],
          [frontX, hubY],
        ],
        {
          w: 2,
          seed: seed + 23,
          wobble: 1,
          color: v('bicycle'),
          opacity: 0.85,
        },
      ) +
      brush(
        [
          [barX, barY],
          [frontX, hubY],
        ],
        {
          w: 2.2,
          seed: seed + 24,
          wobble: 1,
          color: v('bicycle'),
          opacity: 0.9,
        },
      ) +
      brush(
        [
          [seatX - 9, seatY - 5],
          [seatX + 9, seatY - 7],
        ],
        {
          w: 5,
          seed: seed + 25,
          color: ink.color,
          opacity: 0.9,
        },
      )
    const basket =
      wash(
        [
          [barX - 20, barY - 26],
          [barX + 12, barY - 26],
          [barX + 8, barY - 4],
          [barX - 16, barY - 4],
        ],
        v('wood-wash'),
        { seed: seed + 30, amp: 3, opacity: 0.6, rim: 1 },
      ) +
      hatch(barX - 18, barY - 24, 30, deg(6), 1, ink.color, 0.6) +
      hatch(barX - 18, barY - 16, 26, deg(-4), 1, ink.color, 0.6) +
      hatch(barX - 16, barY - 24, 20, deg(95), 1, ink.color, 0.5)
    return wheel(rearX, seed + 1) + wheel(frontX, seed + 40) + frame + basket
  }

  const walls = `
    ${washRect(-400, 838, 2400, 162, v('hedge'), { seed: 60, amp: 8, opacity: 0.42, rim: 0 })}
    ${leanTo(70)}
    ${wallPiece(H.left, DOORWAY.x, 'l', 80)}
    ${winMark(470, 626, 92, 72, 90)}
    ${bicycle(500, 900)}
    ${wallPiece(DOORWAY.x + DOORWAY.w, H.right, 'r', 100)}
    ${winMark(1012, 616, 148, 176, 110)}
    ${brush(
      [
        [DOORWAY.x, DOORWAY.y],
        [DOORWAY.x, DOORWAY.y + DOORWAY.h - 2],
      ],
      { w: ink.w, seed: 120, wobble: 2, color: ink.color, opacity: ink.opacity },
    )}${brush(
      [
        [DOORWAY.x + DOORWAY.w, DOORWAY.y],
        [DOORWAY.x + DOORWAY.w, DOORWAY.y + DOORWAY.h - 2],
      ],
      { w: ink.w, seed: 121, wobble: 2, color: ink.color, opacity: ink.opacity },
    )}
    ${porchBand(130)}
  `

  // ---------------- roof ----------------

  // Trapezoid edge at height y between the ridge (560,350)-(1090,350) and the eave corners
  // (300,H.eaveY)-(1330,H.eaveY): shared by the thatch strands, the course lines and the
  // eave-shadow band so none of them stray outside the roof silhouette.
  const slopeX = (y: number): readonly [number, number] => {
    const t = (y - H.ridgeY) / (H.eaveY - H.ridgeY)
    return [560 + (300 - 560) * t, 1090 + (1330 - 1090) * t]
  }

  // Strands run down the pitch (angle PI/2, +-0.12 rad hand tremor) and fan a little toward
  // each hip the further they sit from the ridge centre (x 800). Sampled by their centre so a
  // strand's own length never pushes it above the ridge or below the eave.
  const thatchStrands = (() => {
    const rnd = mulberry32(8)
    const n = Math.round(700 * INK.detail)
    const maxLen = 95
    const span = H.eaveY - H.ridgeY
    let out = ''
    for (let i = 0; i < n; i++) {
      const cy = H.ridgeY + maxLen / 2 + rnd() * (span - maxLen)
      const [xLeft, xRight] = slopeX(cy)
      const cx = xLeft + rnd() * (xRight - xLeft)
      const fan = ((cx - 800) / 1600) * 0.25
      const jitter = (rnd() - 0.5) * 0.24
      const angle = Math.PI / 2 + fan + jitter
      const len = 45 + rnd() * 50
      const sx = cx - Math.cos(angle) * (len / 2)
      const sy = cy - Math.sin(angle) * (len / 2)
      out += hatch(sx, sy, len, angle, 1, v('ink-mid'), 0.45)
    }
    return out
  })()

  // Three faint coursing lines across the thatch layers, and a dark shadow band pooling under
  // the eave (the bottom 60px of the slope) for depth.
  const courseLines = [430, 490, 550]
    .map((y, i) => {
      const [xLeft, xRight] = slopeX(y)
      return brush(
        [
          [xLeft + 12, y],
          [xRight - 12, y],
        ],
        {
          w: 1,
          seed: 15 + i,
          wobble: 3,
          color: v('ink-mid'),
          opacity: 0.35,
        },
      )
    })
    .join('')
  const eaveShadowY = H.eaveY - 60
  const [eaveShadowL, eaveShadowR] = slopeX(eaveShadowY)

  const roof = `
    ${wash(
      [
        [300, H.eaveY],
        [560, 350],
        [1090, 350],
        [1330, H.eaveY],
      ],
      v('thatch-wash'),
      { seed: 2, amp: 8, opacity: 0.6, rim: 1 },
    )}
    ${wash(
      [
        [eaveShadowL, eaveShadowY],
        [eaveShadowR, eaveShadowY],
        [1330, H.eaveY],
        [300, H.eaveY],
      ],
      v('thatch-wash-dark'),
      { seed: 3, amp: 6, opacity: 0.9, bleed: 6, rim: 0 },
    )}
    ${brush(
      [
        [558, 347],
        [1092, 347],
      ],
      {
        w: ink.w * 2.2,
        seed: 4,
        wobble: 3,
        color: ink.color,
        opacity: ink.opacity,
        taper: [0.3, 0.3],
        peak: 0.5,
      },
    )}
    ${brush(
      [
        [560, 350],
        [300, H.eaveY],
      ],
      {
        w: ink.w * 1.3,
        seed: 5,
        wobble: 2.5,
        color: ink.color,
        opacity: ink.opacity,
      },
    )}
    ${brush(
      [
        [1090, 350],
        [1330, H.eaveY],
      ],
      {
        w: ink.w * 1.3,
        seed: 6,
        wobble: 2.5,
        color: ink.color,
        opacity: ink.opacity,
      },
    )}
    ${brush(
      [
        [300, H.eaveY],
        [1330, H.eaveY],
      ],
      {
        w: ink.w * 1.1,
        seed: 7,
        wobble: 2,
        color: ink.color,
        opacity: ink.opacity,
        taper: [0.2, 0.2],
        peak: 0.5,
      },
    )}
    ${thatchStrands}
    ${courseLines}
    ${wash(
      [
        [1030, 418],
        [1150, 418],
        [1090, 362],
      ],
      v('thatch-wash-dark'),
      {
        seed: 9,
        amp: 4,
        opacity: 0.55,
        rim: 1,
      },
    )}
    ${frame(
      [
        [1030, 418],
        [1150, 418],
        [1090, 362],
      ],
      ink.w * 0.5,
      10,
    )}
    ${hatch(1060, 418, 33, deg(-90), 1.4, ink.color, 0.7)}${hatch(1090, 418, 52, deg(-90), 1.4, ink.color, 0.7)}${hatch(1120, 418, 33, deg(-90), 1.4, ink.color, 0.7)}${hatch(1045, 402, 90, deg(0), 1.2, ink.color, 0.6)}
    ${hatchField(300, 588, 1030, 24, 50 * INK.detail, deg(4), 26, 11, {
      w: 1.2,
      color: ink.color,
      opacity: 0.4,
      jitter: 0.2,
      lenJitter: 0.3,
    })}
  `

  // ---------------- posts ----------------

  const postShape = (x: number, seed: number): string =>
    washRect(x, H.wallTop + 20, 22, H.wallBottom - H.wallTop - 20, v('wood-wash'), {
      seed,
      amp: 2,
      opacity: 0.6,
      rim: 1,
    }) +
    brush(
      [
        [x, H.wallBottom],
        [x, H.wallTop + 20],
      ],
      {
        w: ink.w * 0.6,
        seed: seed + 1,
        wobble: 1.5,
        color: ink.color,
        opacity: ink.opacity,
      },
    ) +
    brush(
      [
        [x + 22, H.wallBottom],
        [x + 22, H.wallTop + 20],
      ],
      {
        w: ink.w * 0.5,
        seed: seed + 2,
        wobble: 1.5,
        color: ink.color,
        opacity: ink.opacity * 0.85,
      },
    )

  const stepStone = (seed: number): string =>
    washRect(818, 838, 104, 16, v('stone-wall'), { seed, amp: 3, opacity: 0.6, rim: 1 }) +
    frame(
      [
        [818, 838],
        [922, 838],
        [918, 854],
        [822, 854],
      ],
      ink.w * 0.6,
      seed + 1,
    )

  const gravel = (seed: number): string =>
    granulated('hs-gravel', 290, 846, 1050, 24, v('stone-wall'), {
      seed,
      amp: 3,
      opacity: 0.5,
      rim: 1,
      grain: 0.4,
    }) +
    hatchField(292, 848, 1046, 20, 50 * INK.detail, 0, 8, seed + 1, {
      w: 3,
      color: ink.color,
      opacity: 0.3,
      jitter: 6.28,
      lenJitter: 0.5,
    })

  const lantern = (x: number, seed: number): string => {
    const baseY = 862
    return (
      washRect(x - 34, baseY - 16, 68, 20, v('stone-wall'), {
        seed,
        amp: 3,
        opacity: 0.55,
        rim: 1,
      }) +
      frame(
        [
          [x - 34, baseY - 16],
          [x + 34, baseY - 16],
          [x + 30, baseY + 4],
          [x - 30, baseY + 4],
        ],
        ink.w * 0.6,
        seed + 1,
      ) +
      washRect(x - 10, baseY - 78, 20, 62, v('stone-wall'), {
        seed: seed + 2,
        amp: 2,
        opacity: 0.5,
        rim: 1,
      }) +
      brush(
        [
          [x - 10, baseY - 16],
          [x - 9, baseY - 78],
        ],
        {
          w: ink.w * 0.5,
          seed: seed + 3,
          color: ink.color,
          opacity: ink.opacity,
        },
      ) +
      brush(
        [
          [x + 10, baseY - 16],
          [x + 9, baseY - 78],
        ],
        {
          w: ink.w * 0.5,
          seed: seed + 4,
          color: ink.color,
          opacity: ink.opacity,
        },
      ) +
      washRect(x - 26, baseY - 108, 52, 30, v('stone-wall-dark'), {
        seed: seed + 5,
        amp: 3,
        opacity: 0.6,
        rim: 1,
      }) +
      frame(
        [
          [x - 26, baseY - 108],
          [x + 26, baseY - 108],
          [x + 20, baseY - 78],
          [x - 20, baseY - 78],
        ],
        ink.w * 0.6,
        seed + 6,
      ) +
      contour(
        ellipsePts(x, baseY - 108, 24, 14, 12),
        ink.w * 0.7,
        seed + 7,
        ink.color,
        ink.opacity,
      ) +
      contour(ellipsePts(x, baseY - 132, 9, 9, 10), ink.w * 0.5, seed + 8, ink.color, ink.opacity)
    )
  }

  const pole = (x: number, seed: number): string => {
    const topY = 230
    const baseY = 860
    const armY = 262
    const armW = 150
    let insulators = ''
    for (const i of [-1, 0, 1]) {
      insulators += contour(
        ellipsePts(x + i * (armW / 2.4), armY - 14, 6, 9, 10),
        1.4,
        seed + 5 + i,
        ink.color,
        ink.opacity,
      )
    }
    // The pole is the visible attachment point (highest, smallest y); each wire droops toward
    // the frame edges, staying well above the ridge at y 350 (cap the sag under y 330).
    let wires = ''
    for (let i = 0; i < 3; i++) {
      const crossY = armY + i * 14
      const edgeY = 300 + i * 14
      wires += brush(
        [
          [-400, edgeY],
          [x, crossY],
          [2000, edgeY],
        ],
        {
          w: 1.1,
          seed: seed + 10 + i,
          wobble: 3,
          color: v('ink-mid'),
          opacity: 0.7,
          taper: [0.6, 0.6],
          peak: 0.5,
        },
      )
    }
    return (
      washRect(x - 7, topY, 14, baseY - topY, v('wood-wash-dark'), {
        seed,
        amp: 3,
        opacity: 0.6,
        rim: 1,
      }) +
      brush(
        [
          [x - 7, baseY],
          [x - 6, topY],
        ],
        {
          w: 2.4,
          seed: seed + 1,
          wobble: 2,
          color: ink.color,
          opacity: ink.opacity,
        },
      ) +
      brush(
        [
          [x + 7, baseY],
          [x + 6, topY],
        ],
        {
          w: 2,
          seed: seed + 2,
          wobble: 2,
          color: ink.color,
          opacity: ink.opacity * 0.85,
        },
      ) +
      washRect(x - armW / 2, armY - 6, armW, 10, v('wood-wash'), {
        seed: seed + 3,
        amp: 2,
        opacity: 0.6,
        rim: 1,
      }) +
      brush(
        [
          [x - armW / 2, armY - 1],
          [x + armW / 2, armY - 1],
        ],
        {
          w: 2,
          seed: seed + 4,
          wobble: 1,
          color: ink.color,
          opacity: ink.opacity,
        },
      ) +
      insulators +
      wires
    )
  }

  const hydrangeaColors = [v('hydrangea-blue'), v('hydrangea-violet'), v('hydrangea-pink')]
  const bush = (x: number, y: number, count: number, seed: number): string => {
    const rnd = mulberry32(seed)
    let out = ''
    for (let i = 0; i < count; i++) {
      const hx = x + (rnd() - 0.5) * 96
      const hy = y - rnd() * 56
      const r = 26 + rnd() * 14
      out += inkHydrangea(hx, hy, r, seed + i * 9 + 1, {
        ink,
        detail: INK.detail,
        color: hydrangeaColors[i % hydrangeaColors.length] ?? v('hydrangea-blue'),
        florets: 3,
        leaves: false,
      })
    }
    return out
  }

  const posts = `
    ${postShape(H.left, 300)}${postShape(DOORWAY.x - 22, 310)}${postShape(DOORWAY.x + DOORWAY.w, 320)}${postShape(H.right - 22, 330)}
    ${porchBand(340)}
    ${stepStone(350)}
    ${gravel(360)}
    ${pole(1230, 400)}
    ${lantern(1450, 420)}
    ${bush(440, 812, 6, 500)}${bush(1090, 812, 6, 520)}${bush(1400, 822, 5, 540)}
    <rect class="fog" x="-400" y="-400" width="2400" height="2000" fill="${v('fog-color')}" opacity="0"/>
  `

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
