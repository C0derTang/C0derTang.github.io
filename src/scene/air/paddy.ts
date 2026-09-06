import { animate } from 'animejs'
import { AIR } from '../../config/layers'
import type { Quality } from '../../config/quality'
import {
  INK,
  brush,
  circle,
  ellipsePts,
  f,
  fogRect,
  granulated,
  hatch,
  inkCedar,
  inkEdges,
  inkStyle,
  rect,
  v,
  wash,
  washRect,
} from '../draw'
import type { InkStyle, P2 } from '../draw'
import { PADDY } from '../geometry'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'
import { attrWrite } from '../../util/dom'
import { mulberry32 } from '../../util/math'

const VP = { x: 800, y: PADDY.horizonY }

/**
 * A tapered-blade rice clump: `blades` brush strokes fanned from the base, optionally pooled on
 * a `--rice-wash` wash. Blades read as green plants with ink accents: most are `--ink-mid` at
 * .75, and on an "accent" clump the first couple of blades go full `--ink` instead. Shared by
 * paddy-plane's near rows (one wash per row-group, not per clump) and paddy-rice-near's big
 * foreground clumps (each individually pooled).
 */
function riceBlades(
  x: number,
  y: number,
  h: number,
  seed: number,
  blades: number,
  washColor: string | null,
  accent: boolean,
  wRange: readonly [number, number] = [1.4, 2],
): string {
  const rnd = mulberry32(seed)
  let out = washColor
    ? wash(ellipsePts(x, y - h * 0.05, h * 0.34, h * 0.14, 6, rnd() * Math.PI), washColor, {
        seed: seed + 1,
        amp: h * 0.07,
        opacity: 0.5,
        rim: 0,
      })
    : ''
  const [wMin, wMax] = wRange
  for (let i = 0; i < blades; i++) {
    const black = accent && i < 2
    const a = ((i / Math.max(1, blades - 1) - 0.5) * 64 + (rnd() - 0.5) * 12) * (Math.PI / 180)
    const len = h * (0.8 + rnd() * 0.4)
    const bend = (rnd() - 0.5) * len * 0.3
    const tip: P2 = [x + Math.sin(a) * len + bend * 0.4, y - Math.cos(a) * len]
    const mid: P2 = [x + Math.sin(a) * len * 0.55 + bend, y - Math.cos(a) * len * 0.55]
    out += brush([[x, y], mid, tip], {
      w: wMin + (wMax - wMin) * rnd(),
      seed: seed + 10 + i,
      wobble: 0.8,
      taper: [0.55, 0.04],
      peak: 0.3,
      color: black ? v('ink') : v('ink-mid'),
      opacity: black ? 0.95 : 0.75,
    })
  }
  return out
}

// ---------- paddy-far terrain: a shallow-bowl hillside, sampled into curves ----------

/** Every terrace edge follows this curve: flat at the vanishing point, rising ~70px at the bleed. */
function hillY(y0: number, x: number): number {
  const dx = (x - 800) / 1300
  return y0 - 70 * dx * dx
}

/** Sample one edge curve every 100px across the full bleed. */
function hillCurve(y0: number): P2[] {
  const pts: P2[] = []
  for (let x = -500; x <= 2100; x += 100) pts.push([x, hillY(y0, x)])
  return pts
}

/** Closed band polygon between two curved edges (top curve left->right, bottom curve back). */
function bandPoly(y0Top: number, y0Bottom: number): readonly P2[] {
  return [...hillCurve(y0Top), ...hillCurve(y0Bottom).slice().reverse()]
}

/** Shelf heights and wall heights, near to far, stacked upward from the paddy-plane dike (y 700). */
const TERRACE_SIZES: readonly { shelfH: number; wallH: number }[] = [
  { shelfH: 72, wallH: 24 },
  { shelfH: 56, wallH: 19 },
  { shelfH: 42, wallH: 15 },
  { shelfH: 32, wallH: 11 },
]

/**
 * One terraced-paddy step, every edge a sampled hillside curve: a `--rice-bright` shelf with a
 * `--hedge` glaze along its back edge and a paper glaze along its front lip, one row of rice
 * marks following the curve, and a full-width `--stone-wall` wall below it — masonry drawn
 * cheaply as two offset rows of hatch marks plus a few darker `inkEdges` stone accents, not a
 * dense stone-by-stone fill.
 */
function terraceStep(
  y0ShelfTop: number,
  y0WallTop: number,
  y0WallBottom: number,
  ink: InkStyle,
  seed: number,
): string {
  const rnd = mulberry32(seed)
  const shelf = wash(bandPoly(y0ShelfTop, y0WallTop), v('rice-bright'), {
    seed,
    amp: 6,
    opacity: 0.6,
    rim: 1,
  })
  const backGlaze = wash(
    bandPoly(y0ShelfTop, y0ShelfTop + (y0WallTop - y0ShelfTop) * 0.4),
    v('hedge'),
    { seed: seed + 1, amp: 6, opacity: 0.26, rim: 0 },
  )
  const frontGlaze = wash(
    bandPoly(y0ShelfTop + (y0WallTop - y0ShelfTop) * 0.55, y0WallTop),
    v('paper-sky'),
    { seed: seed + 2, amp: 6, opacity: 0.3, rim: 0 },
  )
  const edge = brush(hillCurve(y0ShelfTop), {
    w: ink.w * 0.8,
    seed: seed + 3,
    wobble: 2,
    color: ink.color,
    opacity: ink.opacity * 0.8,
    taper: [0.05, 0.05],
    peak: 0.5,
  })
  let leaves = ''
  const riceY0 = y0ShelfTop + (y0WallTop - y0ShelfTop) * 0.35
  for (let x = -480; x <= 2080; x += 55) {
    leaves += hatch(x, hillY(riceY0, x), 7, -Math.PI / 2, 1, v('hedge'), 0.6)
  }
  const wallBase = wash(bandPoly(y0WallTop, y0WallBottom), v('stone-wall'), {
    seed: seed + 4,
    amp: 5,
    opacity: 0.55,
    rim: 0,
  })
  let masonry = ''
  const rowY0s: readonly [number, number][] = [
    [y0WallTop + (y0WallBottom - y0WallTop) * 0.32, 0],
    [y0WallTop + (y0WallBottom - y0WallTop) * 0.72, 24],
  ]
  for (const [ry0, offset] of rowY0s) {
    for (let i = 0; i < 45; i++) {
      const x = -480 + offset + i * ((2080 - -480) / 45)
      masonry += hatch(x, hillY(ry0, x), 10 + rnd() * 4, (rnd() - 0.5) * 0.08, 1, v('ink-mid'), 0.6)
    }
  }
  // A couple of darker stone accents (small quads, faceted `inkEdges` outline over a wash fill):
  // full stone-by-stone fill is what the masonry hatch rows already give cheaply, so only a few
  // stand out as accents (the coordinator's cedar skyline needed the wash headroom instead).
  let stones = ''
  for (let i = 0; i < 2; i++) {
    const x = 300 + i * 900 + rnd() * 200
    const yc = hillY((y0WallTop + y0WallBottom) / 2, x)
    const sw = 18 + rnd() * 6
    const sh = (y0WallBottom - y0WallTop) * (0.4 + rnd() * 0.2)
    const pts: readonly P2[] = [
      [x - sw / 2, yc - sh / 2],
      [x + sw / 2, yc - sh / 2 - rnd() * 3],
      [x + sw / 2 + rnd() * 2, yc + sh / 2],
      [x - sw / 2, yc + sh / 2 + rnd() * 3],
    ]
    stones += wash(pts, v('stone-wall-dark'), { seed: seed + 50 + i, amp: 2, opacity: 0.5, rim: 0 })
    stones += inkEdges(pts, ink.w * 0.7, seed + 60 + i, ink.color, ink.opacity * 0.8)
  }
  return shelf + backGlaze + frontGlaze + edge + leaves + wallBase + masonry + stones
}

/**
 * Far paddies at the horizon, ink and wash: terraced rice shelves on a shallow-bowl hillside
 * curve (every edge rises toward the bleed, not a flat stripe) over full-bleed dry-stone walls,
 * a two-faced shed and a scarecrow on the second shelf, a skyline of small cedars along the top
 * terrace covering the seam to the treeline layer, and their reflections in the near water
 * (mirrored in this same layer so they stay registered under parallax), broken into eight
 * drifting ripple bands. Live: the bands animate.
 */
export function paddyFarLayer(quality: Quality, staticBands = false): Layer {
  const ink = inkStyle(3500) // "paddy far" weight 2.2 per CLAUDE.md's table: the layer's own
  // depth (4100) falls one inkStyle bracket further out, so the boundary value is pinned here.
  const cedarInk = inkStyle(4100) // skyline cedars: a touch thinner, nearest the treeline
  const H = VP.y
  const squash = 0.55

  // Four terraces, near to far, stacked upward from the dike at y 700 (H).
  let y0: number = H
  let terraces = ''
  let secondShelfY0: [number, number] = [0, 0] // [top, bottom] of the shed/scarecrow's shelf
  let topShelfY0: number = H
  for (let i = 0; i < TERRACE_SIZES.length; i++) {
    const size = TERRACE_SIZES[i]
    if (!size) continue
    const y0WallBottom = y0
    const y0WallTop = y0WallBottom - size.wallH
    const y0ShelfTop = y0WallTop - size.shelfH
    terraces += terraceStep(y0ShelfTop, y0WallTop, y0WallBottom, ink, 400 + i * 20)
    if (i === 1) secondShelfY0 = [y0ShelfTop, y0WallTop]
    y0 = y0ShelfTop
    topShelfY0 = y0ShelfTop
  }

  // -- the shed on the second shelf: a gabled roof, a wall, a paper-lit window --
  const [shelf2Top, shelf2Bot] = secondShelfY0
  const shedCy = shelf2Top + (shelf2Bot - shelf2Top) * 0.62
  const shedH = (shelf2Bot - shelf2Top) * 0.72
  const roof: readonly P2[] = [
    [968, shedCy],
    [1035, shedCy - shedH * 0.62],
    [1102, shedCy],
    [1082, shedCy + shedH * 0.1],
    [1035, shedCy - shedH * 0.36],
    [988, shedCy + shedH * 0.1],
  ]
  const wallPts: readonly P2[] = [
    [986, shedCy],
    [1084, shedCy],
    [1084, shedCy + shedH * 0.55],
    [986, shedCy + shedH * 0.55],
  ]
  const shed =
    wash(roof, v('thatch-wash-dark'), { seed: 641, amp: 4, opacity: 0.6, rim: 1 }) +
    inkEdges(roof, ink.w, 642, ink.color, ink.opacity) +
    wash(wallPts, v('wood-wash'), { seed: 644, amp: 3, opacity: 0.55, rim: 1 }) +
    brush(
      [
        [986, shedCy],
        [986, shedCy + shedH * 0.55],
      ],
      { w: ink.w * 0.8, seed: 645, wobble: 1, color: ink.color, opacity: ink.opacity },
    ) +
    brush(
      [
        [1084, shedCy],
        [1084, shedCy + shedH * 0.55],
      ],
      { w: ink.w * 0.8, seed: 646, wobble: 1, color: ink.color, opacity: ink.opacity },
    ) +
    washRect(1022, shedCy + shedH * 0.16, 20, shedH * 0.26, v('paper-sky'), {
      seed: 647,
      amp: 2,
      opacity: 0.5,
      rim: 1,
    })

  // -- the scarecrow, also on the second shelf: a post, a crossbar, an indigo coat, a straw hat --
  const scY = shelf2Bot
  const coat: readonly P2[] = [
    [682, scY - shedH * 0.5],
    [718, scY - shedH * 0.5],
    [714, scY - shedH * 0.08],
    [686, scY - shedH * 0.08],
  ]
  const scarecrow =
    wash(coat, v('indigo-wash'), { seed: 651, amp: 3, opacity: 0.55, rim: 1 }) +
    inkEdges(coat, ink.w * 0.8, 652, ink.color, ink.opacity) +
    brush(
      [
        [700, scY],
        [700, scY - shedH * 0.9],
      ],
      { w: ink.w, seed: 653, wobble: 1.2, color: ink.color, opacity: ink.opacity },
    ) +
    brush(
      [
        [674, scY - shedH * 0.66],
        [726, scY - shedH * 0.7],
      ],
      {
        w: ink.w * 0.8,
        seed: 654,
        wobble: 1,
        color: ink.color,
        opacity: ink.opacity,
        taper: [0.2, 0.2],
        peak: 0.5,
      },
    ) +
    brush(ellipsePts(700, scY - shedH * 0.98, 14, 7, 8), {
      w: ink.w * 0.7,
      seed: 655,
      wobble: 1.5,
      close: true,
      color: ink.color,
      opacity: ink.opacity * 0.85,
    })

  // -- a skyline of small cedars along the top terrace, covering the seam to the treeline --
  const cedarXs = [-160, 220, 560, 980, 1420]
  const cedarRnd = mulberry32(495)
  const cedars = cedarXs
    .map((x, i) => {
      const scale = 0.22 + cedarRnd() * 0.16
      return inkCedar(x, hillY(topShelfY0, x) + 6, scale, 610 + i, {
        ink: cedarInk,
        detail: INK.detail,
        tiers: 4,
      })
    })
    .join('')

  const objs = terraces + shed + scarecrow + cedars

  // -- reflection: pf-objs mirrored about the horizon with a vertical squash, revealed through
  // eight horizontal clip bands that drift sideways (ripple distortion); the terrace colours
  // reappear as squashed glazes broken by pale ripple strokes just under the horizon, with a
  // second band of long, thin ink reflection strokes lower down. --
  const mirror = `<g transform="translate(0 ${f(H * (1 + squash))}) scale(1 ${f(-squash)})"><use href="#pf-objs"/></g>`
  let clips = ''
  let bands = ''
  for (let i = 0; i < 8; i++) {
    clips += `<clipPath id="pf-rb${i}">${rect(-500, H + i * 22, 2600, 22, 'none')}</clipPath>`
    bands += `<g class="rband" data-i="${i}" clip-path="url(#pf-rb${i})" opacity=".32">${mirror}</g>`
  }
  const terraceTones = [v('rice-wash'), v('rice-wash'), v('rice-bright'), v('rice-bright')]
  let terraceRefl = ''
  for (let i = 0; i < 4; i++) {
    terraceRefl += washRect(-450, H + 4 + i * 15, 2500, 12, terraceTones[i] ?? v('rice-wash'), {
      seed: 570 + i,
      amp: 8,
      opacity: 0.22,
      rim: 0,
    })
  }
  let whiteBreaks = ''
  for (let i = 0; i < 5; i++) {
    const y = H + 8 + i * 13
    whiteBreaks += brush(
      [
        [-450 + i * 80, y],
        [800, y + (i % 2 ? 2 : -2)],
        [2050 - i * 60, y],
      ],
      {
        w: 2.2,
        seed: 575 + i,
        wobble: 2,
        color: v('paper-sky'),
        opacity: 0.5,
        taper: [0.05, 0.05],
        peak: 0.5,
      },
    )
  }
  let reflLines = ''
  for (let i = 0; i < 7; i++) {
    const y = H + 90 + i * 24
    reflLines += brush(
      [
        [100 + i * 260, y],
        [500 + i * 220, y - 2],
        [1300 - i * 90, y + 2],
      ],
      {
        w: 1.6,
        seed: 560 + i,
        wobble: 2,
        color: ink.color,
        opacity: 0.3,
        taper: [0.1, 0.1],
        peak: 0.5,
      },
    )
  }
  const reflection =
    washRect(-500, H, 2600, 300, v('paddy-water'), { seed: 550, amp: 12, opacity: 0.4, rim: 0 }) +
    `<defs>${clips}</defs>${bands}` +
    terraceRefl +
    whiteBreaks +
    washRect(-500, H + 130, 2600, 170, v('paddy-water-deep'), {
      seed: 552,
      amp: 12,
      opacity: 0.35,
      rim: 0,
    }) +
    reflLines

  const inner = `<g id="pf-objs">${objs}</g>${reflection}${fogRect('fog', -500, 560, 2600, 160)}`

  // Mist only behind and above the top terrace: a lineless glaze whose bottom edge follows the
  // top terrace's own curve, never crossing the middle bands.
  const mist = wash([...hillCurve(topShelfY0), [2100, -400], [-500, -400]], v('cloud'), {
    seed: 590,
    amp: 14,
    opacity: 0.3,
    rim: 0,
  })

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

/**
 * The flooded field, ink and wash: layered blue-grey water washes with a paper-white
 * sky-reflection band and thin ink reflection strokes, two mud-wash dikes converging on the
 * vanishing point with ink edges, plank ties and grass tufts, and perspective rows of rice —
 * tiny hatch-fan clumps thinning into the distance, tapered brush blades in the near third.
 */
export function paddyPlaneLayer(): Layer {
  const farInk = inkStyle(3500) // 2.2, ink-mid: the general water/reflection weight
  const nearInk = inkStyle(2000) // 3, ink: the near dike edges
  const rnd = mulberry32(61)

  const water =
    granulated('pp-water', -450, VP.y, 2500, 1000, v('paddy-water'), {
      seed: 501,
      amp: 14,
      opacity: 0.66,
      rim: 1,
      grain: 0.4,
    }) +
    washRect(-450, VP.y + 260, 2500, 760, v('paddy-water-deep'), {
      seed: 502,
      amp: 16,
      opacity: 0.4,
      rim: 0,
    }) +
    wash(
      [
        [-450, VP.y],
        [900, VP.y - 4],
        [2050, VP.y],
        [2050, VP.y + 44],
        [-450, VP.y + 38],
      ],
      v('paper-sky-horizon'),
      { seed: 503, amp: 6, opacity: 0.55, rim: 0 },
    )

  let reflLines = ''
  for (let i = 0; i < 8; i++) {
    const y = VP.y + 16 + i * 22 + (i % 2) * 6
    const span = 220 + i * 90
    reflLines += brush(
      [
        [VP.x - span, y],
        [VP.x - span * 0.3, y + 2],
        [VP.x + span * 0.4, y - 2],
        [VP.x + span, y],
      ],
      {
        w: 1.4,
        seed: 510 + i,
        wobble: 1.5,
        color: farInk.color,
        opacity: 0.3,
        taper: [0.05, 0.05],
        peak: 0.5,
      },
    )
  }

  const dike = (side: 1 | -1, seed: number): string => {
    const nearX = VP.x + side * 900
    const outer: readonly P2[] = [
      [VP.x, VP.y],
      [nearX, 1600],
      [nearX + side * 150, 1600],
    ]
    const light: readonly P2[] = [
      [VP.x, VP.y],
      [nearX, 1600],
      [nearX + side * 46, 1600],
    ]
    const edgeStroke = brush(
      [
        [VP.x, VP.y + 4],
        [nearX, 1600],
      ],
      {
        w: nearInk.w * 0.9,
        seed: seed + 2,
        wobble: 4,
        color: nearInk.color,
        opacity: nearInk.opacity * 0.8,
        taper: [0.05, 0.5],
        peak: 0.5,
      },
    )
    // Plank ties across the crown of the dike, and a few grass tufts fanned along its outer edge.
    let planks = ''
    for (let k = 0; k < 4; k++) {
      const tt = (k + 0.5) / 4
      const py = VP.y + tt * tt * 850
      const px = VP.x + side * 900 * tt
      planks += brush(
        [
          [px - side * 20, py + 3],
          [px + side * 20, py - 3],
        ],
        {
          w: 1.6,
          seed: seed + 20 + k,
          wobble: 1,
          color: nearInk.color,
          opacity: 0.45,
          taper: [0.2, 0.2],
          peak: 0.5,
        },
      )
    }
    let tufts = ''
    for (let k = 0; k < 5; k++) {
      const tt = (k + 0.3) / 5
      const py = VP.y + tt * tt * 850
      const px = VP.x + side * 900 * tt + side * 26
      const base = -Math.PI / 2 + side * 0.3
      for (let j = 0; j < 3; j++) {
        tufts += hatch(px, py, 9 + rnd() * 6, base + (j - 1) * 0.5, 1.2, v('hedge'), 0.6)
      }
    }
    return (
      wash(outer, v('mud'), { seed, amp: 16, opacity: 0.6, rim: 1 }) +
      wash(light, v('mud-light'), { seed: seed + 1, amp: 12, opacity: 0.45, rim: 0 }) +
      edgeStroke +
      planks +
      tufts
    )
  }
  const dikes = dike(-1, 520) + dike(1, 530)

  // A few shared ground washes carry the field's colour under the rows (not one pool per clump:
  // that would blow the wash budget at this density).
  const riceGround =
    granulated('pp-fartint', -450, VP.y + 8, 2500, 260, v('rice-wash'), {
      seed: 540,
      amp: 14,
      opacity: 0.13,
      rim: 0,
      grain: 0.35,
    }) +
    granulated('pp-ricebase', VP.x - 900, 900, 1800, 460, v('rice-bright'), {
      seed: 542,
      amp: 16,
      opacity: 0.15,
      rim: 0,
      grain: 0.3,
    })

  const yAt = (t: number) => VP.y + 560 * t * t
  const leftAt = (t: number) => VP.x - 840 * t
  const rightAt = (t: number) => VP.x + 840 * t
  const ROWS = 16
  let farRows = ''
  let nearGroups = ''
  let nearClumps = ''
  let clumpIndex = 0
  for (let r = 0; r < ROWS; r++) {
    const t = (r + 0.5) / ROWS
    const y = yAt(t)
    const h = 6 + 150 * t * t
    const cols = Math.max(1, Math.round((9 + 21 * t) * INK.detail))
    const xL = leftAt(t) + 26
    const xR = rightAt(t) - 26
    const far = t < 0.62
    if (!far) {
      // One shared green wash per near row-group carries the base colour under its clumps.
      nearGroups += wash(
        [
          [xL - 20, y - h * 0.5],
          [(xL + xR) / 2, y - h * 0.6],
          [xR + 20, y - h * 0.5],
          [xR + 20, y + h * 0.3],
          [(xL + xR) / 2, y + h * 0.4],
          [xL - 20, y + h * 0.3],
        ],
        v('rice-wash'),
        { seed: 700 + r, amp: h * 0.2, opacity: 0.42, rim: 0 },
      )
    }
    for (let c = 0; c < cols; c++) {
      const u = cols <= 1 ? 0.5 : c / (cols - 1)
      const x = xL + (xR - xL) * u + (rnd() - 0.5) * h
      const yy = y + (rnd() - 0.5) * h * 0.3
      if (far) {
        const base = -Math.PI / 2 + (rnd() - 0.5) * 0.3
        for (let k = 0; k < 3; k++) {
          farRows += hatch(
            x,
            yy,
            h * (0.7 + rnd() * 0.35),
            base + (k - 1) * 0.55,
            1.2,
            v('hedge'),
            0.6,
          )
        }
      } else {
        nearClumps += riceBlades(
          x,
          yy,
          h * 0.6,
          900 + r * 97 + c * 7,
          5,
          null,
          clumpIndex % 3 === 0,
        )
        clumpIndex++
      }
    }
  }

  const inner =
    water +
    rect(-450, VP.y + 40, 2500, 260, v('cloud'), 'class="gfog" data-k="1" opacity="0"') +
    rect(-450, VP.y + 200, 2500, 560, v('cloud'), 'class="gfog" data-k=".55" opacity="0"') +
    dikes +
    riceGround +
    reflLines +
    farRows +
    nearGroups +
    nearClumps

  const layer = makeSvgLayer('paddy-plane', AIR.paddyPlane, inner)
  const gfog = [...layer.el.querySelectorAll<SVGRectElement>('.gfog')].map((el) => ({
    el,
    k: Number(el.dataset.k ?? 1),
  }))
  layer.update = (state) => {
    for (const { el, k } of gfog) {
      attrWrite(el, 'opacity', (state.grade.fogMid * k).toFixed(3))
      attrWrite(el, 'fill', state.grade.fogColor)
    }
  }
  return layer
}

/**
 * Big rice clumps crowding the foreground band (restCz 2600), ink and wash: each a pooled
 * `--rice-wash` (or `--rice-bright`) wash with 5-6 tapered blade strokes — mostly `--ink-mid` at
 * .75, with every third clump getting a couple of full-`--ink` accent blades — plus a scatter of
 * dark ink drop marks in the mud between them.
 */
export function paddyRiceNearLayer(): Layer {
  const rnd = mulberry32(731)
  const N = 40
  let clumps = ''
  for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N
    const x = -380 + u * 2360 + (rnd() - 0.5) * 50
    const y = 970 + rnd() * 260
    const h = 70 + rnd() * 90 + (y - 950) * 0.25
    const washColor = i % 3 === 1 ? v('rice-bright') : v('rice-wash')
    clumps += riceBlades(x, y, h, 800 + i * 13, 6, washColor, i % 3 === 0)
  }
  let drops = ''
  for (let i = 0; i < 8; i++) {
    drops += circle(
      -300 + rnd() * 2100,
      1000 + rnd() * 220,
      2 + rnd() * 2,
      v('ink'),
      `fill-opacity="${(0.3 + rnd() * 0.3).toFixed(2)}"`,
    )
  }
  return makeSvgLayer('paddy-rice-near', AIR.paddyRiceNear, clumps + drops)
}
