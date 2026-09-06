import { mulberry32 } from '../util/math'
import { TEX, type TexId } from './textures'

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
    texRect('bark', x - trunkW / 2, baseY - trunkH, trunkW, trunkH, trunkW, 0.4, trunkH) +
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

/* ---------- texture helpers (realism pass) ---------- */

/**
 * Grid of tile images over a rect (design px); `tw`/`th` = design px per repeat. Images get their
 * href from textures.apply() once the blobs resolve. Returns '' when textures are off, or for
 * heavy tiles on the small level.
 */
export function texRect(
  id: TexId,
  x: number,
  y: number,
  w: number,
  h: number,
  tw: number,
  opacity: number,
  th = tw,
): string {
  if (TEX.level === 'off') return ''
  if (TEX.level === 'small' && (id === 'plaster' || id === 'water' || id === 'wash')) return ''
  if (TEX.single)
    return `<g class="tex"><image data-tex="${id}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" preserveAspectRatio="none" opacity="${opacity}"/></g>`
  let out = ''
  for (let r = 0; r < Math.ceil(h / th); r++)
    for (let c = 0; c < Math.ceil(w / tw); c++)
      out += `<image data-tex="${id}" x="${f(x + c * tw)}" y="${f(y + r * th)}" width="${f(tw)}" height="${f(th)}" preserveAspectRatio="none" opacity="${opacity}"/>`
  // Grouped so the stage can hide textures once a part is magnified past TEX_MAX_SCALE.
  return `<g class="tex">${out}</g>`
}

/** A filled shape with texture images clipped to it (one clipPath per surface). */
export const textured = (
  clipId: string,
  shape: (fill: string, extra?: string) => string,
  fill: string,
  tex: string,
): string =>
  tex
    ? `<clipPath id="${clipId}">${shape('none')}</clipPath>${shape(fill)}<g clip-path="url(#${clipId})">${tex}</g>`
    : shape(fill)

/* ---------- ink and wash (brush pass) ---------- */

/** Module-level detail multiplier (quality.detail), set in main.ts before layers are built. */
export const INK = { detail: 1 }

export interface BrushOpts {
  /** peak width in design px */
  w: number
  /** end widths as fractions of w: [start, end] (0 = needle tip) */
  taper?: readonly [number, number]
  /** where the width peaks along the stroke (0..1) */
  peak?: number
  /** lateral hand tremor amplitude in px */
  wobble?: number
  seed: number
  color?: string
  opacity?: number
  /** closed silhouette: the stroke returns to its first point (gentle pressure changes, no tips) */
  close?: boolean
  extra?: string
}

/** Catmull-Rom curve through the points, sampled about every `step` px (>= 2 samples per segment). */
function smoothPolyline(pts: readonly P2[], close: boolean, step: number): P2[] {
  const n = pts.length
  const get = (i: number): P2 => {
    const j = close ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i))
    return pts[j] ?? [0, 0]
  }
  const out: P2[] = []
  const segs = close ? n : n - 1
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1)
    const p1 = get(i)
    const p2 = get(i + 1)
    const p3 = get(i + 2)
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
    const m = Math.max(2, Math.ceil(len / step))
    for (let k = 0; k < m; k++) {
      const u = k / m
      const u2 = u * u
      const u3 = u2 * u
      out.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * u +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * u +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3),
      ])
    }
  }
  out.push(close ? get(0) : get(n - 1))
  return out
}

/**
 * Tapered brush stroke: one filled outline polygon around a smoothed polyline whose width
 * swells toward `peak` and thins to the tips, with a seeded low-frequency tremor. The ink look
 * comes from these, never from uniform `stroke-width` outlines.
 */
export function brush(pts: readonly P2[], o: BrushOpts): string {
  if (pts.length < 2) return ''
  const close = o.close ?? false
  const rnd = mulberry32(o.seed)
  const samples = smoothPolyline(pts, close, 7)
  const n = samples.length
  const cum = new Float64Array(n)
  for (let i = 1; i < n; i++) {
    const a = samples[i - 1] ?? [0, 0]
    const b = samples[i] ?? [0, 0]
    cum[i] = (cum[i - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  const last = cum[n - 1] ?? 0
  const total = last > 0 ? last : 1
  const [t0, t1] = o.taper ?? [0.05, 0.02]
  const peak = o.peak ?? 0.45
  const wob = o.wobble ?? 0
  const noise = new Float64Array(n)
  let acc = 0
  for (let i = 0; i < n; i++) {
    acc = (acc + (rnd() - 0.5) * 0.6) * 0.82
    noise[i] = acc
  }
  const L: string[] = []
  const R: string[] = []
  for (let i = 0; i < n; i++) {
    const p = samples[i] ?? [0, 0]
    const q = samples[Math.min(n - 1, i + 1)] ?? p
    const r = samples[Math.max(0, i - 1)] ?? p
    let dx = q[0] - r[0]
    let dy = q[1] - r[1]
    const m = Math.hypot(dx, dy) || 1
    dx /= m
    dy /= m
    const u = (cum[i] ?? 0) / total
    let width: number
    if (close) {
      width = o.w * (0.72 + 0.28 * Math.sin(u * Math.PI * 4 + o.seed))
    } else {
      const up =
        u < peak
          ? (0.5 * u) / Math.max(1e-6, peak)
          : 0.5 + (0.5 * (u - peak)) / Math.max(1e-6, 1 - peak)
      const prof = Math.sin(Math.PI * up) ** 0.7
      const tip = t0 + (t1 - t0) * u
      width = o.w * (tip + (1 - tip) * prof)
    }
    const off = (noise[i] ?? 0) * wob
    const cx = p[0] - dy * off
    const cy = p[1] + dx * off
    const hw = width / 2
    L.push(`${f(cx - dy * hw)} ${f(cy + dx * hw)}`)
    R.push(`${f(cx + dy * hw)} ${f(cy - dx * hw)}`)
  }
  const d = `M${L.join('L')}L${R.reverse().join('L')}Z`
  const fill = o.color ?? v('ink')
  const op = o.opacity === undefined ? '' : ` fill-opacity="${f(o.opacity)}"`
  return `<path d="${d}" fill="${fill}"${op} ${o.extra ?? ''}/>`
}

/** Closed brush silhouette (no tips). */
export const contour = (
  pts: readonly P2[],
  w: number,
  seed: number,
  color?: string,
  opacity?: number,
): string => brush(pts, { w, seed, close: true, wobble: 1.5, color, opacity })

/** One short tapered mark (thatch strand, weave, needle, spoke): a six-point quad. */
export function hatch(
  x: number,
  y: number,
  len: number,
  angle: number,
  w: number,
  color = v('ink'),
  opacity = 0.85,
): string {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const nx = -dy
  const ny = dx
  const w0 = w * 0.25
  const w1 = w * 0.5
  const w2 = w * 0.12
  const mx = x + dx * len * 0.45
  const my = y + dy * len * 0.45
  const ex = x + dx * len
  const ey = y + dy * len
  return `<polygon points="${f(x + nx * w0)},${f(y + ny * w0)} ${f(mx + nx * w1)},${f(my + ny * w1)} ${f(ex + nx * w2)},${f(ey + ny * w2)} ${f(ex - nx * w2)},${f(ey - ny * w2)} ${f(mx - nx * w1)},${f(my - ny * w1)} ${f(x - nx * w0)},${f(y - ny * w0)}" fill="${color}" fill-opacity="${f(opacity)}"/>`
}

/** `count` hatch marks scattered over a rect with angle and length jitter (scale count by quality.detail). */
export function hatchField(
  x: number,
  y: number,
  w: number,
  h: number,
  count: number,
  angle: number,
  len: number,
  seed: number,
  o: { w?: number; color?: string; opacity?: number; jitter?: number; lenJitter?: number } = {},
): string {
  const rnd = mulberry32(seed)
  const n = Math.round(count)
  let out = ''
  for (let i = 0; i < n; i++) {
    const a = angle + (rnd() - 0.5) * (o.jitter ?? 0.2)
    const l = len * (1 - (o.lenJitter ?? 0.4) * rnd())
    out += hatch(x + rnd() * w, y + rnd() * h, l, a, o.w ?? 1.4, o.color, o.opacity)
  }
  return out
}

export interface WashOpts {
  opacity?: number
  /** pigment pooling at the edge: rim stroke width in px (0 = none) */
  rim?: number
  rimOpacity?: number
  /** edge wobble amplitude */
  amp?: number
  seed: number
  /** a lighter (or darker) bloom inside the wash, scaled about the centroid and offset */
  bloom?: { color: string; scale?: number; opacity?: number; dx?: number; dy?: number }
  extra?: string
}

/**
 * Watercolour wash: a wobbly translucent polygon with a pooled rim and an optional bloom.
 * Offset washes a few px from their ink so colour bleeds past the line and leaves paper gaps.
 */
export function wash(pts: readonly P2[], color: string, o: WashOpts): string {
  if (pts.length < 3) return ''
  const amp = o.amp ?? 6
  const rim = o.rim ?? 1.2
  const stroke =
    rim > 0
      ? ` stroke="${color}" stroke-opacity="${f(o.rimOpacity ?? 0.35)}" stroke-width="${f(rim)}" stroke-linejoin="round"`
      : ''
  let out = `<path d="${wobbly(pts, amp, o.seed)}" fill="${color}" fill-opacity="${f(o.opacity ?? 0.55)}"${stroke} ${o.extra ?? ''}/>`
  const b = o.bloom
  if (b) {
    const s = b.scale ?? 0.6
    let cx = 0
    let cy = 0
    for (const p of pts) {
      cx += p[0]
      cy += p[1]
    }
    cx /= pts.length
    cy /= pts.length
    const inner: P2[] = pts.map(([px, py]) => [
      cx + (px - cx) * s + (b.dx ?? 0),
      cy + (py - cy) * s + (b.dy ?? 0),
    ])
    out += `<path d="${wobbly(inner, amp * s, o.seed + 1)}" fill="${b.color}" fill-opacity="${f(b.opacity ?? 0.45)}"/>`
  }
  return out
}

/** Eight-point wash over a rect (corners and edge midpoints wobble independently). */
export const washRect = (
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  o: WashOpts,
): string =>
  wash(
    [
      [x, y],
      [x + w / 2, y],
      [x + w, y],
      [x + w, y + h / 2],
      [x + w, y + h],
      [x + w / 2, y + h],
      [x, y + h],
      [x, y + h / 2],
    ],
    color,
    o,
  )

/** Large wash with the granulation tile clipped to its rect (sky bands, mountains, water, walls). */
export function granulated(
  clipId: string,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  o: WashOpts & { grain?: number },
): string {
  const body = washRect(x, y, w, h, color, o)
  const tex = texRect('wash', x, y, w, h, 256, o.grain ?? 0.35)
  return tex
    ? `${body}<clipPath id="${clipId}">${rect(x, y, w, h, 'none')}</clipPath><g clip-path="url(#${clipId})">${tex}</g>`
    : body
}

/** Points around an ellipse (for washes and contours). */
export function ellipsePts(cx: number, cy: number, rx: number, ry: number, n = 8, phase = 0): P2[] {
  const pts: P2[] = []
  for (let k = 0; k < n; k++) {
    const a = phase + (k / n) * Math.PI * 2
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry])
  }
  return pts
}

/** Ink weight and tone by plane depth (design px at s = 1): heavy black near, thin grey far. */
export interface InkStyle {
  w: number
  color: string
  opacity: number
}
export function inkStyle(depth: number): InkStyle {
  if (depth <= 0) return { w: 6, color: v('ink'), opacity: 1 }
  if (depth <= 600) return { w: 4, color: v('ink'), opacity: 1 }
  if (depth <= 2000) return { w: 3, color: v('ink'), opacity: 1 }
  if (depth <= 3500) return { w: 2.2, color: v('ink-mid'), opacity: 0.9 }
  if (depth <= 5000) return { w: 1.6, color: v('ink-mid'), opacity: 0.85 }
  if (depth <= 9000) return { w: 1.2, color: v('ink-far'), opacity: 0.7 }
  return { w: 0.9, color: v('ink-far'), opacity: 0.6 }
}

/* ---------- ink recipes shared by several layers ---------- */

export interface InkRecipeOpts {
  ink?: InkStyle
  /** multiplier for detail marks (quality.detail) */
  detail?: number
}

/**
 * Sugi cedar in ink: each bough tier is a green wash (offset down-right so it bleeds past the
 * line), one open tapered stroke for the hem-crown-hem silhouette, and needle marks along the
 * hem; the trunk is a wood wash between two edge strokes. ~70 elements at detail 1.
 */
export function inkCedar(
  x: number,
  baseY: number,
  scale: number,
  seed: number,
  o: InkRecipeOpts & { tiers?: number; wash?: string; wash2?: string; trunk?: string } = {},
): string {
  const rnd = mulberry32(seed)
  const ink = o.ink ?? inkStyle(0)
  const detail = o.detail ?? 1
  const tiers = o.tiers ?? 6
  const trunkH = 150 * scale
  const tierH = 105 * scale
  let top = baseY - trunkH + 34 * scale
  let washes = ''
  let lines = ''
  let marks = ''
  for (let i = 0; i < tiers; i++) {
    const tw = (300 - 36 * i) * scale
    const last = i === tiers - 1
    const yb = top
    const yt = top - tierH - (last ? 50 * scale : 0)
    const droop = (16 + rnd() * 10) * scale
    const pts: P2[] = [
      [x - tw / 2, yb + droop],
      [x - tw * 0.28, yb - tierH * 0.3],
      [x, yt],
      [x + tw * 0.28, yb - tierH * 0.3],
      [x + tw / 2, yb + droop],
    ]
    const wc = i % 2 ? (o.wash2 ?? v('cedar-wash-2')) : (o.wash ?? v('cedar-wash'))
    washes += wash(
      [
        [x - tw / 2 + 8 * scale, yb + droop + 6 * scale],
        [x - tw * 0.3, yb - tierH * 0.25],
        [x + 4 * scale, yt + 10 * scale],
        [x + tw * 0.3, yb - tierH * 0.25],
        [x + tw / 2 + 8 * scale, yb + droop + 6 * scale],
        [x, yb + droop * 0.9 + 6 * scale],
      ],
      wc,
      { seed: seed + 40 + i, amp: 8 * scale, opacity: 0.6, rim: 1 },
    )
    lines += brush(pts, {
      w: ink.w * (last ? 0.8 : 1),
      seed: seed + i * 7,
      wobble: 2.5 * scale,
      color: ink.color,
      opacity: ink.opacity,
      taper: [0.1, 0.1],
      peak: 0.5,
    })
    const nm = Math.round(9 * detail)
    for (let k = 0; k < nm; k++) {
      const u = (k + 0.5) / nm
      const hx = x - tw / 2 + tw * u
      const hy = yb + droop * (1 - Math.abs(u - 0.5) * 1.6) - 4 * scale
      marks += hatch(
        hx,
        hy,
        (14 + rnd() * 10) * scale,
        Math.PI / 2 + (rnd() - 0.5) * 0.7,
        ink.w * 0.5,
        ink.color,
        0.7 * ink.opacity,
      )
    }
    top = yt + 42 * scale
  }
  const tw = 22 * scale
  const trunk =
    washRect(x - tw / 2, baseY - trunkH, tw, trunkH, o.trunk ?? v('wood-wash-dark'), {
      seed: seed + 98,
      amp: 3 * scale,
      opacity: 0.6,
      rim: 0,
    }) +
    brush(
      [
        [x - tw / 2, baseY - trunkH],
        [x - tw / 2 - 2 * scale, baseY],
      ],
      {
        w: ink.w * 0.9,
        seed: seed + 99,
        wobble: 1.5 * scale,
        color: ink.color,
        opacity: ink.opacity,
      },
    ) +
    brush(
      [
        [x + tw / 2, baseY - trunkH],
        [x + tw / 2 + 3 * scale, baseY],
      ],
      {
        w: ink.w * 0.7,
        seed: seed + 100,
        wobble: 1.5 * scale,
        color: ink.color,
        opacity: ink.opacity,
      },
    )
  return `<g class="cedar">${washes}${trunk}${lines}${marks}</g>`
}

/** Broadleaf mass in ink: wash blob, a closed contour, three interior strokes, leaf marks. */
export function inkFoliage(
  x: number,
  y: number,
  w: number,
  seed: number,
  o: InkRecipeOpts & { wash?: string } = {},
): string {
  const rnd = mulberry32(seed)
  const ink = o.ink ?? inkStyle(0)
  const detail = o.detail ?? 1
  const pts = ellipsePts(x, y, w * 0.5, w * 0.32, 9, rnd())
  let out = wash(
    ellipsePts(x + w * 0.06, y + w * 0.05, w * 0.5, w * 0.32, 9, rnd()),
    o.wash ?? v('hedge'),
    { seed: seed + 1, amp: w * 0.06, opacity: 0.6, rim: 1 },
  )
  out += contour(pts, ink.w, seed + 2, ink.color, ink.opacity)
  for (let i = 0; i < 3; i++) {
    const a = rnd() * Math.PI
    const r = w * (0.12 + rnd() * 0.2)
    const cx = x + (rnd() - 0.5) * w * 0.5
    const cy = y + (rnd() - 0.5) * w * 0.3
    out += brush(
      [
        [cx - Math.cos(a) * r, cy - Math.sin(a) * r],
        [cx + (rnd() - 0.5) * r, cy + (rnd() - 0.5) * r],
        [cx + Math.cos(a) * r, cy + Math.sin(a) * r],
      ],
      { w: ink.w * 0.6, seed: seed + 10 + i, wobble: 1, color: ink.color, opacity: ink.opacity },
    )
  }
  const nm = Math.round(6 * detail)
  for (let k = 0; k < nm; k++)
    out += hatch(
      x + (rnd() - 0.5) * w * 0.8,
      y + (rnd() - 0.5) * w * 0.5,
      w * 0.08,
      rnd() * Math.PI,
      ink.w * 0.45,
      ink.color,
      0.6 * ink.opacity,
    )
  return `<g class="foliage">${out}</g>`
}

/**
 * Hydrangea head: a coloured wash with a pale bloom, `florets` four-petal marks (a tiny wash
 * plus two crossing ink flicks each) and, unless disabled, three serrated leaves below.
 */
export function inkHydrangea(
  x: number,
  y: number,
  r: number,
  seed: number,
  o: InkRecipeOpts & { color?: string; florets?: number; leaves?: boolean; leaf?: string } = {},
): string {
  const rnd = mulberry32(seed)
  const ink = o.ink ?? inkStyle(100)
  const color = o.color ?? v('hydrangea-blue')
  const n = Math.round((o.florets ?? 12) * Math.max(0.5, o.detail ?? 1))
  let out = wash(ellipsePts(x, y, r, r * 0.85, 8, rnd()), color, {
    seed,
    amp: r * 0.18,
    opacity: 0.5,
    rim: 1,
    bloom: { color: '#ffffff', scale: 0.5, opacity: 0.25, dx: -r * 0.15, dy: -r * 0.15 },
  })
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2
    const d = Math.sqrt(rnd()) * r * 0.8
    const fx = x + Math.cos(a) * d
    const fy = y + Math.sin(a) * d * 0.8
    const fr = r * (0.16 + rnd() * 0.1)
    out += wash(ellipsePts(fx, fy, fr, fr, 4, rnd() * Math.PI), color, {
      seed: seed + i,
      amp: fr * 0.4,
      opacity: 0.45,
      rim: 0.8,
    })
    out +=
      hatch(fx - fr, fy, fr * 2, (rnd() - 0.5) * 0.5, ink.w * 0.5, ink.color, 0.7 * ink.opacity) +
      hatch(
        fx,
        fy - fr,
        fr * 2,
        Math.PI / 2 + (rnd() - 0.5) * 0.5,
        ink.w * 0.5,
        ink.color,
        0.7 * ink.opacity,
      )
  }
  if (o.leaves !== false) {
    for (let i = 0; i < 3; i++) {
      const lx = x + (i - 1) * r * 0.9 + (rnd() - 0.5) * r * 0.3
      const ly = y + r * 0.95 + rnd() * r * 0.2
      const lw = r * (0.55 + rnd() * 0.25)
      const tilt = (i - 1) * 0.5 + (rnd() - 0.5) * 0.4
      const leaf: P2[] = [
        [lx, ly - lw * 0.1],
        [lx + Math.cos(tilt + 0.9) * lw * 0.5, ly + Math.sin(tilt + 0.9) * lw * 0.5],
        [lx + Math.cos(tilt + 1.57) * lw, ly + Math.sin(tilt + 1.57) * lw],
        [lx + Math.cos(tilt + 2.3) * lw * 0.5, ly + Math.sin(tilt + 2.3) * lw * 0.5],
      ]
      out += wash(leaf, o.leaf ?? v('leaf'), {
        seed: seed + 50 + i,
        amp: lw * 0.08,
        opacity: 0.55,
        rim: 1,
      })
      out += brush(leaf, {
        w: ink.w * 0.7,
        seed: seed + 60 + i,
        wobble: 1,
        close: true,
        color: ink.color,
        opacity: ink.opacity,
      })
      const tip = leaf[2] ?? [lx, ly]
      out += brush([[lx, ly], [(lx + tip[0]) / 2, (ly + tip[1]) / 2 + 2], tip], {
        w: ink.w * 0.4,
        seed: seed + 70 + i,
        color: ink.color,
        opacity: ink.opacity * 0.8,
      })
    }
  }
  return `<g class="hydrangea">${out}</g>`
}

/** Dry-stone retaining wall: a grey wash, then `rows` courses of wobbly ink stones with a few paler ones. */
export function inkStoneWall(
  x0: number,
  x1: number,
  y: number,
  h: number,
  seed: number,
  o: InkRecipeOpts & { rows?: number; wash?: string } = {},
): string {
  const rnd = mulberry32(seed)
  const ink = o.ink ?? inkStyle(3000)
  const detail = o.detail ?? 1
  const rows = o.rows ?? 3
  const rowH = h / rows
  let out = washRect(x0, y, x1 - x0, h, o.wash ?? v('stone-wall'), {
    seed,
    amp: 3,
    opacity: 0.55,
    rim: 1,
  })
  for (let r = 0; r < rows; r++) {
    let x = x0 - (r % 2) * rowH * 0.6
    const ry = y + r * rowH
    while (x < x1) {
      const sw = rowH * (1.2 + rnd() * 1.2)
      const pts: P2[] = [
        [x + 2, ry + 2],
        [x + sw - 2, ry + 2],
        [x + sw - 2, ry + rowH - 2],
        [x + 2, ry + rowH - 2],
      ]
      out += brush(pts, {
        w: ink.w,
        seed: seed + r * 131 + Math.round(x),
        wobble: 1.2,
        close: true,
        color: ink.color,
        opacity: ink.opacity,
      })
      if (rnd() < 0.5 * detail)
        out += wash(pts, '#ffffff', {
          seed: seed + 7 + Math.round(x),
          amp: 2,
          opacity: 0.12,
          rim: 0,
        })
      x += sw
    }
  }
  return `<g class="stone-wall">${out}</g>`
}
