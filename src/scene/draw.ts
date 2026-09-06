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

/* ---------- texture tiles ---------- */

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
  if (TEX.level === 'small' && id === 'wash') return ''
  if (TEX.single)
    return `<g class="tex"><image data-tex="${id}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" preserveAspectRatio="none" opacity="${opacity}"/></g>`
  let out = ''
  for (let r = 0; r < Math.ceil(h / th); r++)
    for (let c = 0; c < Math.ceil(w / tw); c++)
      out += `<image data-tex="${id}" x="${f(x + c * tw)}" y="${f(y + r * th)}" width="${f(tw)}" height="${f(th)}" preserveAspectRatio="none" opacity="${opacity}"/>`
  // Grouped so the stage can hide textures once a part is magnified past TEX_MAX_SCALE.
  return `<g class="tex">${out}</g>`
}

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
  /**
   * Fill opacity. At or above 0.4 the wash is a SURFACE: an opaque core (>= .88) with a
   * translucent bleed halo around it; below 0.4 it is a GLAZE (reflection, mist, bloom) drawn
   * as one translucent shape. `glaze` / `bleed` override the heuristic.
   */
  opacity?: number
  glaze?: boolean
  /** halo width in px past the polygon (surfaces only); 0 = none */
  bleed?: number
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

const centroidOf = (pts: readonly P2[]): P2 => {
  let cx = 0
  let cy = 0
  for (const p of pts) {
    cx += p[0]
    cy += p[1]
  }
  return [cx / pts.length, cy / pts.length]
}

/** Points pushed `d` px away from the centroid (an approximate outline offset). */
export function expandPts(pts: readonly P2[], d: number): P2[] {
  const [cx, cy] = centroidOf(pts)
  return pts.map(([x, y]) => {
    const dx = x - cx
    const dy = y - cy
    const m = Math.hypot(dx, dy) || 1
    return [x + (dx / m) * d, y + (dy / m) * d]
  })
}

/**
 * Watercolour wash. A surface wash is an opaque core with a translucent halo bleeding 3 to 8 px
 * past its edge (colour running past the line, paper showing at the seam) and a pooled rim; a
 * glaze is one translucent shape. Overlapping surface washes stay solid instead of stacking
 * into transparency.
 */
export function wash(pts: readonly P2[], color: string, o: WashOpts): string {
  if (pts.length < 3) return ''
  const amp = o.amp ?? 6
  const rim = o.rim ?? 1.2
  const op = o.opacity ?? 0.9
  const glaze = o.glaze ?? op < 0.4
  const bleed = o.bleed ?? (glaze ? 0 : 5)
  const coreOp = glaze ? op : Math.max(op, 0.88)
  const stroke =
    rim > 0
      ? ` stroke="${color}" stroke-opacity="${f(o.rimOpacity ?? 0.35)}" stroke-width="${f(rim)}" stroke-linejoin="round"`
      : ''
  let out = ''
  if (bleed > 0)
    out += `<path d="${wobbly(expandPts(pts, bleed), amp * 1.4, o.seed + 3)}" fill="${color}" fill-opacity="${f(Math.min(0.45, op * 0.45))}"/>`
  out += `<path d="${wobbly(pts, amp, o.seed)}" fill="${color}" fill-opacity="${f(coreOp)}"${stroke} ${o.extra ?? ''}/>`
  const b = o.bloom
  if (b) {
    const s = b.scale ?? 0.6
    const [cx, cy] = centroidOf(pts)
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
  if (depth <= 0) return { w: 4.5, color: v('ink'), opacity: 1 }
  if (depth <= 600) return { w: 3.2, color: v('ink'), opacity: 1 }
  if (depth <= 2000) return { w: 2.6, color: v('ink'), opacity: 0.95 }
  if (depth <= 3500) return { w: 2, color: v('ink-mid'), opacity: 0.9 }
  if (depth <= 5000) return { w: 1.5, color: v('ink-mid'), opacity: 0.85 }
  if (depth <= 9000) return { w: 1.1, color: v('ink-far'), opacity: 0.7 }
  return { w: 0.9, color: v('ink-far'), opacity: 0.6 }
}

/** Straight tapered stroke per edge of a polygon (rectilinear shapes: frames, mats, boards). */
export function inkEdges(
  pts: readonly P2[],
  w: number,
  seed: number,
  color?: string,
  opacity?: number,
  close = true,
): string {
  let out = ''
  const n = pts.length
  const edges = close ? n : n - 1
  for (let i = 0; i < edges; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    if (!a || !b) continue
    const mx = (a[0] + b[0]) / 2
    const my = (a[1] + b[1]) / 2
    out += brush([a, [mx, my], b], {
      w,
      seed: seed + i * 17,
      wobble: 0.8,
      taper: [0.35, 0.25],
      peak: 0.5,
      color,
      opacity,
    })
  }
  return out
}

/* ---------- ink recipes shared by several layers ---------- */

export interface InkRecipeOpts {
  ink?: InkStyle
  /** multiplier for detail marks (quality.detail) */
  detail?: number
}

/**
 * Sugi cedar in ink: each drooping tier is a dark needle mass with a lighter crest mass on its
 * upper-left (solid washes, ragged edges), a silhouette broken into short tapered hem strokes
 * with gaps, and needle marks hanging from the hem; a wood-wash trunk between two edge strokes
 * with a few branch strokes reaching into the tiers. ~150 elements at detail 1.
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
  const dark = o.wash ?? v('cedar-wash')
  const light = o.wash2 ?? v('cedar-wash-2')
  const trunkH = 150 * scale
  const tierH = 105 * scale
  const tw0 = 22 * scale
  let top = baseY - trunkH + 34 * scale
  let masses = ''
  let lines = ''
  let marks = ''
  let branches = ''
  for (let i = 0; i < tiers; i++) {
    const tw = (300 - 36 * i) * scale
    const last = i === tiers - 1
    const yb = top
    const yt = top - tierH - (last ? 50 * scale : 0)
    const droop = (18 + rnd() * 12) * scale
    const jit = () => (rnd() - 0.5) * 14 * scale
    // ragged hem: tips, three sagging hem points, shoulders, crown
    const hem: P2[] = [
      [x - tw / 2, yb + droop * 0.6],
      [x - tw * 0.3, yb + droop + jit()],
      [x - tw * 0.08, yb + droop * 0.5 + jit()],
      [x + tw * 0.14, yb + droop + jit()],
      [x + tw * 0.34, yb + droop * 0.7 + jit()],
      [x + tw / 2, yb + droop * 0.5],
    ]
    const body: P2[] = [
      ...hem,
      [x + tw * 0.3, yb - tierH * 0.35],
      [x + tw * 0.08, yt + 8 * scale],
      [x - tw * 0.1, yt + 4 * scale],
      [x - tw * 0.32, yb - tierH * 0.3],
    ]
    masses += wash(body, dark, {
      seed: seed + 40 + i,
      amp: 11 * scale,
      opacity: 0.92,
      rim: 0,
      bleed: 4 * scale,
    })
    // lit crest mass on the upper left
    masses += wash(
      [
        [x - tw * 0.36, yb - tierH * 0.2],
        [x - tw * 0.16, yb - tierH * 0.05],
        [x + tw * 0.06, yb - tierH * 0.3],
        [x - tw * 0.02, yt + 20 * scale],
        [x - tw * 0.24, yb - tierH * 0.55],
      ],
      light,
      { seed: seed + 60 + i, amp: 9 * scale, opacity: 0.85, rim: 0, bleed: 3 * scale },
    )
    // broken silhouette: two hem strokes with a gap, a shoulder flick, the crown
    const hemL: P2[] = [hem[0] ?? [x, yb], hem[1] ?? [x, yb], hem[2] ?? [x, yb]]
    const hemR: P2[] = [hem[3] ?? [x, yb], hem[4] ?? [x, yb], hem[5] ?? [x, yb]]
    lines += brush(hemL, {
      w: ink.w,
      seed: seed + i * 7,
      wobble: 2 * scale,
      color: ink.color,
      opacity: ink.opacity,
      taper: [0.05, 0.2],
      peak: 0.6,
    })
    lines += brush(hemR, {
      w: ink.w * 0.9,
      seed: seed + i * 7 + 1,
      wobble: 2 * scale,
      color: ink.color,
      opacity: ink.opacity,
      taper: [0.2, 0.05],
      peak: 0.4,
    })
    lines += brush(
      [
        [x + tw * 0.34, yb - tierH * 0.28],
        [x + tw * 0.16, yt + 14 * scale],
        [x, yt],
      ],
      {
        w: ink.w * 0.7,
        seed: seed + i * 7 + 2,
        wobble: 1.5 * scale,
        color: ink.color,
        opacity: ink.opacity * 0.9,
        taper: [0.1, 0],
        peak: 0.35,
      },
    )
    // needles hanging from the hem, denser near the tips
    const nm = Math.round(14 * detail)
    for (let k = 0; k < nm; k++) {
      const u = (k + 0.5) / nm
      const hx = x - tw / 2 + tw * u
      const hy = yb + droop * (0.9 - Math.abs(u - 0.5) * 0.8) - 2 * scale
      marks += hatch(
        hx + (rnd() - 0.5) * 6 * scale,
        hy,
        (12 + rnd() * 12) * scale,
        Math.PI / 2 + (u - 0.5) * 0.9 + (rnd() - 0.5) * 0.5,
        ink.w * 0.45,
        ink.color,
        0.75 * ink.opacity,
      )
    }
    if (i < tiers - 1) {
      const dir = i % 2 ? 1 : -1
      branches += brush(
        [
          [x + dir * tw0 * 0.4, yb - tierH * 0.15],
          [x + dir * tw * 0.22, yb - tierH * 0.05 + 6 * scale],
          [x + dir * tw * 0.4, yb + 4 * scale],
        ],
        {
          w: ink.w * 0.55,
          seed: seed + 80 + i,
          wobble: 1.2 * scale,
          color: ink.color,
          opacity: ink.opacity * 0.8,
          taper: [0.6, 0],
          peak: 0.2,
        },
      )
    }
    top = yt + 42 * scale
  }
  const trunk =
    washRect(x - tw0 / 2, baseY - trunkH, tw0, trunkH, o.trunk ?? v('wood-wash-dark'), {
      seed: seed + 98,
      amp: 3 * scale,
      opacity: 0.92,
      rim: 0,
      bleed: 2 * scale,
    }) +
    brush(
      [
        [x - tw0 / 2, baseY - trunkH],
        [x - tw0 / 2 - 2 * scale, baseY],
      ],
      {
        w: ink.w * 0.8,
        seed: seed + 99,
        wobble: 1.5 * scale,
        color: ink.color,
        opacity: ink.opacity,
        taper: [0.3, 1],
        peak: 0.7,
      },
    ) +
    brush(
      [
        [x + tw0 / 2, baseY - trunkH],
        [x + tw0 / 2 + 3 * scale, baseY],
      ],
      {
        w: ink.w * 0.6,
        seed: seed + 100,
        wobble: 1.5 * scale,
        color: ink.color,
        opacity: ink.opacity,
        taper: [0.3, 1],
        peak: 0.7,
      },
    )
  return `<g class="cedar">${trunk}${masses}${branches}${lines}${marks}</g>`
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
  // broken silhouette: three open strokes around the mass with gaps between them
  for (let k = 0; k < 3; k++) {
    const a = pts[(k * 3) % pts.length] ?? [x, y]
    const b = pts[(k * 3 + 1) % pts.length] ?? [x, y]
    const c = pts[(k * 3 + 2) % pts.length] ?? [x, y]
    out += brush([a, b, c], {
      w: ink.w * 0.9,
      seed: seed + 20 + k,
      wobble: 1.5,
      color: ink.color,
      opacity: ink.opacity,
      taper: [0.05, 0.05],
    })
  }
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
    // a dark centre on every floret, an ink flick on some
    out += circle(fx, fy, fr * 0.22, ink.color, `fill-opacity="${f(0.6 * ink.opacity)}"`)
    if (rnd() < 0.4)
      out += hatch(
        fx - fr * 0.9,
        fy + fr * 0.3,
        fr * 1.6,
        (rnd() - 0.5) * 0.9,
        ink.w * 0.4,
        ink.color,
        0.6 * ink.opacity,
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

/**
 * Dry-stone retaining wall: a grey wash, then `rows` courses of irregular flat stones (five to
 * six-point polygons outlined edge by edge so corners stay corners), a few paler ones, and
 * shadow glazes under each course.
 */
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
    opacity: 0.9,
    rim: 0,
    bleed: 3,
  })
  let n = 0
  for (let r = 0; r < rows; r++) {
    let x = x0 - (r % 2) * rowH * 0.7
    const ry = y + r * rowH
    // shadow glaze under the course above
    if (r > 0)
      out += washRect(x0, ry, x1 - x0, rowH * 0.3, v('stone-wall-dark'), {
        seed: seed + 300 + r,
        amp: 2,
        opacity: 0.3,
        rim: 0,
      })
    while (x < x1) {
      const sw = rowH * (1.3 + rnd() * 1.4)
      const inset = 1.5 + rnd() * 2
      const midX = x + sw * (0.4 + rnd() * 0.2)
      const pts: P2[] = [
        [x + inset + rnd() * 3, ry + inset + rnd() * 3],
        [midX, ry + inset - 1 + rnd() * 2],
        [x + sw - inset - rnd() * 3, ry + inset + rnd() * 3],
        [x + sw - inset + rnd() * 2, ry + rowH * (0.55 + rnd() * 0.2)],
        [x + sw - inset - rnd() * 4, ry + rowH - inset - rnd() * 2],
        [x + inset + rnd() * 4, ry + rowH - inset - rnd() * 3],
      ]
      if (n % 3 === 0)
        out += wash(pts, rnd() < 0.5 ? '#ffffff' : v('stone-wall-dark'), {
          seed: seed + 7 + n,
          amp: 1.5,
          opacity: 0.2,
          rim: 0,
        })
      if (detail >= 0.5 || n % 2 === 0)
        out += inkEdges(pts, ink.w * 0.8, seed + r * 131 + n, ink.color, ink.opacity * 0.85)
      x += sw + 1 + rnd() * 2
      n++
    }
  }
  return `<g class="stone-wall">${out}</g>`
}
