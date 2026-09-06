import { mulberry32 } from '../util/math'

/** CSS custom property reference for use inside inline SVG. */
export const v = (token: string): string => `var(--${token})`

/** Compact number formatting for SVG attributes. */
export const f = (n: number): string => {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

export type P2 = readonly [number, number]

export const pointsAttr = (pts: readonly P2[]): string =>
  pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')

/**
 * Painterly polygon: each edge becomes a quadratic curve whose control point is the edge
 * midpoint displaced along the edge normal by a seeded random amount (+-amp).
 * Deterministic for a given seed, so the art is stable across reloads.
 */
export function wobbly(points: readonly P2[], amp: number, seed: number, close = true): string {
  const rnd = mulberry32(seed)
  const n = points.length
  if (n < 2) return ''
  const first = points[0]
  if (!first) return ''
  let d = `M${f(first[0])} ${f(first[1])}`
  const edges = close ? n : n - 1
  for (let i = 0; i < edges; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    if (!a || !b) continue
    const mx = (a[0] + b[0]) / 2
    const my = (a[1] + b[1]) / 2
    const ex = b[0] - a[0]
    const ey = b[1] - a[1]
    const len = Math.hypot(ex, ey) || 1
    const nx = -ey / len
    const ny = ex / len
    const off = (rnd() * 2 - 1) * amp
    d += ` Q${f(mx + nx * off)} ${f(my + ny * off)} ${f(b[0])} ${f(b[1])}`
  }
  return close ? d + ' Z' : d
}

/** Rotation pivot wrapper so anime.js `rotate` on `.cls` acts about (px, py). */
export const pivot = (px: number, py: number, cls: string, inner: string): string =>
  `<g transform="translate(${f(px)} ${f(py)})"><g class="${cls}"><g transform="translate(${f(-px)} ${f(-py)})">${inner}</g></g></g>`

export type Stop = readonly [offset: number, color: string, opacity?: number]

const stops = (list: readonly Stop[]): string =>
  list
    .map(
      ([o, c, a]) =>
        `<stop offset="${f(o * 100)}%" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`,
    )
    .join('')

/** Vertical linear gradient by default (x1,y1 -> x2,y2 in objectBoundingBox units). */
export const linGrad = (
  id: string,
  list: readonly Stop[],
  x1 = 0,
  y1 = 0,
  x2 = 0,
  y2 = 1,
): string =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(list)}</linearGradient>`

/** Two-tone "brush band" gradient: A up to 48%, B from 52%. Angle in degrees. */
export const banded = (id: string, a: string, b: string, angle = 0): string =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1" gradientTransform="rotate(${angle} .5 .5)">${stops(
    [
      [0, a],
      [0.48, a],
      [0.52, b],
      [1, b],
    ],
  )}</linearGradient>`

export const radGrad = (id: string, list: readonly Stop[], cx = 0.5, cy = 0.5, r = 0.5): string =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops(list)}</radialGradient>`

export const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  extra = '',
): string =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}" ${extra}/>`

export const ellipse = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string,
  extra = '',
): string =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" ${extra}/>`

export const circle = (cx: number, cy: number, r: number, fill: string, extra = ''): string =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}" ${extra}/>`

export const polygon = (pts: readonly P2[], fill: string, extra = ''): string =>
  `<polygon points="${pointsAttr(pts)}" fill="${fill}" ${extra}/>`

export const path = (d: string, fill: string, extra = ''): string =>
  `<path d="${d}" fill="${fill}" ${extra}/>`

/** Fog shape (a path or rect) whose opacity the layer's update() drives from the grade state. */
export const fogPath = (cls: string, d: string, color = v('fog-color')): string =>
  `<path class="${cls}" d="${d}" fill="${color}" opacity="0"/>`

export const fogRect = (
  cls: string,
  x: number,
  y: number,
  w: number,
  h: number,
  color = v('fog-color'),
): string =>
  `<rect class="${cls}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${color}" opacity="0"/>`

/** Per-layer gradient defs the cedar/foliage recipes reference (`ids` = id prefix). */
export const cedarDefs = (ids: string, far = false): string =>
  (far
    ? linGrad(
        `${ids}-bough`,
        [
          [0, '#7c9a94'],
          [0.5, v('green-far')],
          [1, '#4e6a64'],
        ],
        0,
        0,
        1,
        1,
      )
    : linGrad(
        `${ids}-bough`,
        [
          [0, v('green-mid')],
          [0.45, v('green-deep')],
          [1, v('green-shadow')],
        ],
        0,
        0,
        1,
        1,
      )) +
  cyl(`${ids}-bark`, v('bark-dark'), v('wood-mid'), v('bark-light'), 0.3) +
  aoGrad(`${ids}-ao`, v('ao-cool'), 0.5) +
  fadeGrad(`${ids}-wet`, v('wet'), 0, 0.35)

/**
 * Sugi cedar: drooping bough tiers of clustered shapes, key light upper-left (diagonal
 * bough gradient), lit crests, AO hems, the far side of the crown in shadow, a sky rim on the
 * top-left edges, a bark-shaded trunk with a wet base and a contact shadow. ~38 elements.
 * (x, baseY) is the trunk base; `ids` selects the defs prefix (see cedarDefs).
 */
export function cedar(
  x: number,
  baseY: number,
  scale: number,
  seed: number,
  tiers = 7,
  ids = 'ex',
): string {
  const rnd = mulberry32(seed)
  const trunkW = 26 * scale
  const trunkH = 150 * scale
  const tierH = 105 * scale
  const overlap = 42 * scale
  let top = baseY - trunkH + 34 * scale
  const tierPaths: string[] = []
  let boughs = ''
  for (let i = 0; i < tiers; i++) {
    const w = (300 - 34 * i) * scale
    const last = i === tiers - 1
    const yb = top
    const yt = top - tierH - (last ? 50 * scale : 0)
    const droop = (14 + rnd() * 10) * scale
    const j = (rnd() - 0.5) * 14 * scale
    const pts: P2[] = [
      [x - w / 2 + j, yb + droop],
      [x - w * 0.3, yb - tierH * 0.28],
      [x, yt],
      [x + w * 0.3, yb - tierH * 0.28],
      [x + w / 2 + j, yb + droop],
      [x + w * 0.22, yb + droop * 0.4],
      [x, yb + droop * 0.9],
      [x - w * 0.22, yb + droop * 0.4],
    ]
    const d = wobbly(pts, 9 * scale, seed + i * 7)
    tierPaths.push(d)
    boughs +=
      path(d, `url(#${ids}-bough)`) +
      ellipse(
        x - w * 0.16,
        yb - tierH * 0.55,
        w * 0.22,
        tierH * 0.16,
        v('green-crest'),
        'opacity=".35"',
      ) +
      ellipse(
        x + w * 0.05,
        yb + droop * 0.5,
        w * 0.38,
        droop * 0.9,
        v('green-shadow'),
        'opacity=".45"',
      )
    top = yt + overlap
  }
  const back = tierPaths
    .map((d) => path(d, v('green-shadow'), 'opacity=".9" transform="translate(10 -6)"'))
    .join('')
  const rim = tierPaths
    .map((d) => path(d, v('rim'), 'opacity=".16" transform="translate(-3 -4)"'))
    .join('')
  const trunk =
    rect(x - trunkW / 2, baseY - trunkH, trunkW, trunkH, `url(#${ids}-bark)`) +
    rect(x - trunkW / 2, baseY - 40 * scale, trunkW, 40 * scale, `url(#${ids}-wet)`)
  return `<g class="cedar">${shadow(x, baseY, 70 * scale, 12 * scale, `${ids}-ao`, 0.4)}${back}${rim}${trunk}${boughs}</g>`
}

/** Distant cedar: four gradient tiers and a trunk, no crests or rims (6 elements). */
export function cedarFar(
  x: number,
  baseY: number,
  scale: number,
  seed: number,
  ids = 'ex',
): string {
  const rnd = mulberry32(seed)
  const tierH = 90 * scale
  const overlap = 36 * scale
  let top = baseY - 20 * scale
  let out = rect(x - 5 * scale, baseY - 40 * scale, 10 * scale, 40 * scale, '#4e6a64')
  for (let i = 0; i < 4; i++) {
    const w = (220 - 40 * i) * scale
    const last = i === 3
    const yt = top - tierH - (last ? 40 * scale : 0)
    const droop = (10 + rnd() * 8) * scale
    out += path(
      wobbly(
        [
          [x - w / 2, top + droop],
          [x - w * 0.3, top - tierH * 0.25],
          [x, yt],
          [x + w * 0.3, top - tierH * 0.25],
          [x + w / 2, top + droop],
          [x, top + droop * 0.8],
        ],
        6 * scale,
        seed + i * 3,
      ),
      `url(#${ids}-bough)`,
    )
    top = yt + overlap
  }
  return out
}

/** Broadleaf mass: three overlapping wobbly ellipsoids (shadow / mid / lit), a crest and an AO hem (5 elements). */
export function foliage(x: number, y: number, w: number, seed: number, ids = 'ex'): string {
  const blob = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    amp: number,
    sd: number,
  ): string => {
    const pts: P2[] = []
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry])
    }
    return wobbly(pts, amp, sd)
  }
  return (
    path(blob(x + w * 0.12, y + w * 0.04, w * 0.5, w * 0.3, w * 0.05, seed), v('green-shadow')) +
    path(blob(x, y, w * 0.48, w * 0.3, w * 0.05, seed + 1), `url(#${ids}-bough)`) +
    path(
      blob(x - w * 0.18, y - w * 0.1, w * 0.3, w * 0.2, w * 0.04, seed + 2),
      v('green-mid'),
      'opacity=".8"',
    ) +
    ellipse(x - w * 0.22, y - w * 0.2, w * 0.14, w * 0.06, v('green-crest'), 'opacity=".35"') +
    ellipse(x + w * 0.05, y + w * 0.26, w * 0.4, w * 0.06, v('green-shadow'), 'opacity=".45"')
  )
}

/**
 * Shoji panel: dark frame, paper fill, lattice. Returns markup positioned at (x, y).
 * `lit` picks the warm gradient id (`<prefix>paperLit`) instead of the cool one.
 */
export function shojiPanel(
  x: number,
  y: number,
  w: number,
  h: number,
  o: {
    lit?: boolean
    cols?: number
    rows?: number
    cls?: string
    prefix?: string
    extra?: string
    /** offset lattice shadow on the paper (lamp side) */
    shadow?: boolean
    /** gradient id for a translucency glow drawn over the paper */
    glow?: string
  } = {},
): string {
  const {
    lit = false,
    cols = 3,
    rows = 6,
    cls = '',
    prefix = '',
    extra = '',
    shadow: lattShadow = false,
    glow: glowId = '',
  } = o
  const fr = 8
  const ix = x + fr
  const iy = y + fr
  const iw = w - 2 * fr
  const ih = h - 2 * fr
  let lattice = ''
  for (let i = 1; i < cols; i++) lattice += `M${f(ix + (iw * i) / cols)} ${f(iy)}v${f(ih)}`
  for (let i = 1; i < rows; i++) lattice += `M${f(ix)} ${f(iy + (ih * i) / rows)}h${f(iw)}`
  const glowRect = glowId ? ellipse(x + w / 2, y + h / 2, w * 0.5, h * 0.5, `url(#${glowId})`) : ''
  const shadowPath = lattShadow
    ? `<path d="${lattice}" stroke="${v('shade-warm')}" stroke-width="3" opacity=".15" fill="none" transform="translate(2 2)"/>`
    : ''
  return `<g class="shoji ${cls}" ${extra}>${rect(x, y, w, h, v('wood-dark'))}${rect(
    ix,
    iy,
    iw,
    ih,
    `url(#${prefix}${lit ? 'paperLit' : 'paperCool'})`,
  )}${glowRect}${shadowPath}<path d="${lattice}" stroke="${v('wood-dark')}" stroke-width="2" opacity=".9" fill="none"/></g>`
}

/** A rice clump: fanned blades. (x, y) is the base; h the height. */
export function riceClump(
  x: number,
  y: number,
  h: number,
  seed: number,
  blades = 5,
  litEdge = false,
): string {
  const rnd = mulberry32(seed)
  let out = ''
  for (let i = 0; i < blades; i++) {
    const a = ((i / (blades - 1) - 0.5) * 50 + (rnd() - 0.5) * 8) * (Math.PI / 180)
    const len = h * (0.75 + rnd() * 0.35)
    const tipX = x + Math.sin(a) * len
    const tipY = y - Math.cos(a) * len
    const base = Math.max(2, h * 0.05)
    const mid = i === 0 || i === blades - 1 ? v('green-deep') : v('green-mid')
    const split = 0.6
    const sx = x + (tipX - x) * split
    const sy = y + (tipY - y) * split
    out += polygon(
      [
        [x - base, y],
        [sx, sy],
        [x + base, y],
      ],
      mid,
    )
    out += polygon(
      [
        [sx - base * 0.5, sy],
        [tipX, tipY],
        [sx + base * 0.5, sy],
      ],
      i === 0 || i === blades - 1 ? v('green-mid') : v('green-light'),
    )
    if (litEdge && i < 2)
      out += `<path d="M${f(x - base)} ${f(y)}L${f(tipX - base * 0.5)} ${f(tipY)}" stroke="${v('green-crest')}" stroke-width="1.5" opacity=".5" fill="none"/>`
  }
  return out
}

/* ---------- shading helpers (realism pass) ---------- */

/**
 * Cylinder shading across x: edge | mid | light | mid | dark | edge. `hi` is the highlight
 * position (.3 = key light upper-left outdoors, .62 = lamp on the right indoors).
 */
export const cyl = (
  id: string,
  dark: string,
  mid: string,
  light: string,
  hi = 0.3,
  edge = dark,
): string =>
  linGrad(
    id,
    [
      [0, edge],
      [Math.max(0, hi - 0.22), mid],
      [hi, light],
      [Math.min(1, hi + 0.2), mid],
      [Math.min(1, hi + 0.45), dark],
      [1, edge],
    ],
    0,
    0,
    1,
    0,
  )

/** Three-band shaded gradient (light / base / dark), vertical by default. */
export const shade3 = (id: string, light: string, base: string, dark: string, angle = 0): string =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1" gradientTransform="rotate(${angle} .5 .5)">${stops(
    [
      [0, light],
      [0.45, base],
      [1, dark],
    ],
  )}</linearGradient>`

/** Soft contact / ambient-occlusion blob gradient (one radial fill, no filters). */
export const aoGrad = (id: string, color: string, peak = 0.55): string =>
  radGrad(id, [
    [0, color, peak],
    [0.55, color, peak * 0.4],
    [1, color, 0],
  ])

export const shadow = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  gradId: string,
  o = 1,
): string => ellipse(cx, cy, rx, ry, `url(#${gradId})`, o === 1 ? '' : `opacity="${f(o)}"`)

/**
 * Soft shadow without gradients: three concentric ellipses with per-primitive fill-opacity
 * (never a <g opacity>, which would force a saveLayer). Centre alpha ~= `alpha`.
 */
export function softShadow(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  alpha = 0.3,
  color = '#0b0f12',
): string {
  const rings: readonly (readonly [number, number])[] = [
    [1, 0.28],
    [0.7, 0.36],
    [0.42, 0.5],
  ]
  return rings
    .map(([m, share]) =>
      ellipse(cx, cy, rx * m, ry * m, color, `fill-opacity="${f(alpha * share)}"`),
    )
    .join('')
}

/** Directional cast shadow: three copies of the polygon stepped along (dx, dy) = penumbra. */
export function castShadow(
  pts: readonly P2[],
  dx: number,
  dy: number,
  alpha = 0.25,
  color = '#0b0f12',
): string {
  const steps: readonly (readonly [number, number])[] = [
    [0, 0.55],
    [0.5, 0.3],
    [1, 0.15],
  ]
  return steps
    .map(([k, share]) =>
      polygon(
        pts,
        color,
        `fill-opacity="${f(alpha * share)}" transform="translate(${f(dx * k)} ${f(dy * k)})"`,
      ),
    )
    .join('')
}

/** Repeating fold gradient for cloth (noren, coat): n folds across the bounding box. */
export const folds = (id: string, base: string, lit: string, dark: string, n = 5): string =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${f(1 / n)}" y2="0" spreadMethod="repeat">${stops([
    [0, base],
    [0.35, lit],
    [0.5, base],
    [0.8, dark],
    [1, base],
  ])}</linearGradient>`

/** Vertical fade rect: from color/alpha a at the top to b at the bottom. */
export const fadeGrad = (id: string, color: string, a: number, b: number): string =>
  linGrad(id, [
    [0, color, a],
    [1, color, b],
  ])
