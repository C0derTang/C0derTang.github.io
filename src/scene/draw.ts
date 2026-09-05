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

/**
 * Cedar silhouette: stacked wobbly triangle tiers on a trunk, with a rim-light duplicate behind.
 * (x, baseY) is the trunk base; scale sizes the whole tree.
 */
export function cedar(x: number, baseY: number, scale: number, seed: number, tiers = 7): string {
  const rnd = mulberry32(seed)
  const trunkW = 26 * scale
  const trunkH = 140 * scale
  let out = rect(x - trunkW / 2, baseY - trunkH, trunkW, trunkH, v('wood-dark'))
  out += rect(x - trunkW / 2, baseY - trunkH, 6 * scale, trunkH, v('wood-mid'))
  const tierH = 110 * scale
  const overlap = 40 * scale
  let top = baseY - trunkH + 30 * scale
  const shapes: string[] = []
  for (let i = 0; i < tiers; i++) {
    const w = (300 - 34 * i) * scale
    const yBottom = top
    const yTop = top - tierH
    const jitter = (rnd() - 0.5) * 12 * scale
    const pts: P2[] = [
      [x - w / 2 + jitter, yBottom],
      [x, yTop - (i === tiers - 1 ? 60 * scale : 0)],
      [x + w / 2 + jitter, yBottom],
    ]
    const d = wobbly(pts, 6 * scale, seed + i * 7)
    shapes.push(d)
    top = yTop + overlap
  }
  const rim = shapes
    .map((d) => path(d, v('green-mid'), 'opacity=".55" transform="translate(4 -3)"'))
    .join('')
  const main = shapes.map((d) => path(d, v('green-deep'))).join('')
  return `<g class="cedar">${rim}${out}${main}</g>`
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
  } = {},
): string {
  const { lit = false, cols = 3, rows = 6, cls = '', prefix = '', extra = '' } = o
  const fr = 8
  const ix = x + fr
  const iy = y + fr
  const iw = w - 2 * fr
  const ih = h - 2 * fr
  let lattice = ''
  for (let i = 1; i < cols; i++) lattice += `M${f(ix + (iw * i) / cols)} ${f(iy)}v${f(ih)}`
  for (let i = 1; i < rows; i++) lattice += `M${f(ix)} ${f(iy + (ih * i) / rows)}h${f(iw)}`
  return `<g class="shoji ${cls}" ${extra}>${rect(x, y, w, h, v('wood-dark'))}${rect(
    ix,
    iy,
    iw,
    ih,
    `url(#${prefix}${lit ? 'paperLit' : 'paperCool'})`,
  )}<path d="${lattice}" stroke="${v('wood-dark')}" stroke-width="2" opacity=".9" fill="none"/></g>`
}

/** A rice clump: fanned blades. (x, y) is the base; h the height. */
export function riceClump(x: number, y: number, h: number, seed: number, blades = 5): string {
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
  }
  return out
}
