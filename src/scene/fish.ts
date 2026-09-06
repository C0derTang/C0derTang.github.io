import { createTimer } from 'animejs'
import { INK, brush, circle, contour, ellipsePts, f, hatch, pivot, v, wash, type P2 } from './draw'
import { mulberry32 } from '../util/math'

/**
 * Three rice-paddy fish as SVG rigs in a local 200x80 box (head at the right).
 * Rig groups are pivot-wrapped so anime.js `rotate` (a CSS transform about the viewBox origin)
 * turns each part about its joint.
 */
export type Species = 'koi' | 'dojo' | 'funa'
export type KoiVariant = 'kohaku' | 'orange' | 'white'

export interface FishSpec {
  id: string
  species: Species
  scale: number
  /** closed lane path in layer design coordinates */
  lane: string
  /** seconds per lap */
  duration: number
  /** 0..1 starting progress along the lane */
  offset?: number
  variant?: KoiVariant
  /** id of the fish this one schools behind (funa followers) */
  leader?: string
  /** place in the school: spacing along the lane = rank * ~130 px */
  rank?: number
}

const DEFS_ID = 'fish-defs'

// Colour lives in washes now; no gradients are defined for the fish.
export function fishDefs(prefix: string): string {
  return `<defs id="${prefix}${DEFS_ID}"></defs>`
}

/**
 * Koi: one long tapered ink line per rig segment (tail, rear, body, pec) that pinches thin at
 * the seams and swells toward the snout, so the four pivoted pieces read as a single confident
 * stroke at rest. A paper-white or orange wash carries the colour under the line; kohaku gets
 * three loose orange patch washes, 'white' a single faint ink patch, 'orange' none (the base
 * wash already reads solid). Ink-dot eye, one gill hatch, 1-2 scale hatches. ~19-22 elements.
 */
export function koi(variant: KoiVariant = 'kohaku'): string {
  const ink = v('ink')
  const base = variant === 'orange' ? v('koi-orange-wash') : '#f4f1ea'
  const bodyLine: P2[] = [
    [43, 28],
    [62, 16],
    [92, 9],
    [126, 10],
    [156, 17],
    [180, 27],
    [195, 37],
    [198, 41],
    [194, 46],
    [178, 56],
    [152, 64],
    [120, 67],
    [88, 64],
    [62, 58],
    [43, 50],
  ]
  const bodyWash: P2[] = [
    [46, 30],
    [64, 19],
    [92, 13],
    [124, 14],
    [154, 20],
    [176, 29],
    [188, 39],
    [186, 43],
    [174, 53],
    [150, 60],
    [120, 64],
    [90, 61],
    [64, 56],
    [46, 48],
  ]
  const patches =
    variant === 'kohaku'
      ? wash(ellipsePts(94, 21, 20, 11, 6, 0.3), v('koi-orange-wash'), {
          seed: 121,
          amp: 5,
          opacity: 0.72,
          rim: 1,
        }) +
        wash(ellipsePts(150, 33, 16, 12, 6, 1.4), v('koi-orange-wash'), {
          seed: 122,
          amp: 5,
          opacity: 0.72,
          rim: 1,
        }) +
        wash(ellipsePts(112, 54, 13, 9, 5, 2.1), v('koi-orange-wash'), {
          seed: 123,
          amp: 4,
          opacity: 0.68,
          rim: 1,
        })
      : variant === 'white'
        ? wash(ellipsePts(128, 26, 15, 10, 8, 0.7), ink, {
            seed: 124,
            amp: 5,
            opacity: 0.28,
            rim: 0.6,
          })
        : ''
  const scaleN = Math.max(1, Math.round(2 * INK.detail))
  let scaleMarks = ''
  for (let i = 0; i < scaleN; i++)
    scaleMarks += hatch(78 + i * 32, 38 + i * 6, 15, 0.2 + i * 0.1, 1.6, ink, 0.5)
  const bodyGroup =
    wash(bodyWash, base, {
      seed: 111,
      amp: 6,
      opacity: 0.8,
      rim: 1.2,
      bloom: { color: '#ffffff', scale: 0.5, opacity: 0.22, dy: -5 },
    }) +
    patches +
    brush(bodyLine, { w: 4, seed: 112, wobble: 1, taper: [0.2, 0.22], peak: 0.47, color: ink }) +
    brush(
      [
        [92, 11],
        [106, 3],
        [124, 6],
      ],
      { w: 2, seed: 113, wobble: 0.6, taper: [0.1, 0.1], color: ink, opacity: 0.85 },
    ) +
    brush(
      [
        [186, 43],
        [179, 49],
        [170, 46],
      ],
      { w: 1.8, seed: 114, wobble: 0.5, taper: [0.3, 0.15], color: ink, opacity: 0.8 },
    ) +
    hatch(168, 31, 13, 1.7, 2, ink, 0.55) +
    scaleMarks +
    circle(182, 34, 3.2, ink) +
    circle(183.2, 32.7, 1, '#fff')
  const rearLine: P2[] = [
    [44, 30],
    [64, 20],
    [86, 27],
    [93, 40],
    [86, 53],
    [64, 60],
    [44, 50],
  ]
  const rearGroup =
    wash(rearLine, base, { seed: 131, amp: 5, opacity: 0.68, rim: 1 }) +
    brush(rearLine, { w: 3.2, seed: 132, wobble: 1, taper: [0.16, 0.16], peak: 0.5, color: ink }) +
    brush(
      [
        [78, 58],
        [70, 70],
        [62, 65],
      ],
      { w: 1.6, seed: 133, wobble: 0.5, taper: [0.3, 0.06], color: ink, opacity: 0.8 },
    )
  const tailGroup =
    wash(
      [
        [46, 30],
        [10, 12],
        [2, 40],
        [10, 68],
        [46, 50],
      ],
      base,
      { seed: 141, amp: 5, opacity: 0.55, rim: 0.8 },
    ) +
    brush(
      [
        [45, 31],
        [26, 20],
        [10, 10],
        [3, 6],
      ],
      { w: 3.4, seed: 142, wobble: 0.8, taper: [0.4, 0.12], peak: 0.2, color: ink },
    ) +
    brush(
      [
        [45, 49],
        [26, 60],
        [10, 70],
        [3, 74],
      ],
      { w: 3.4, seed: 144, wobble: 0.8, taper: [0.4, 0.12], peak: 0.2, color: ink },
    )
  const pecGroup =
    wash(
      [
        [150, 54],
        [138, 62],
        [122, 68],
        [128, 56],
      ],
      base,
      { seed: 151, amp: 3, opacity: 0.5, rim: 0.6 },
    ) +
    brush(
      [
        [150, 52],
        [136, 63],
        [118, 69],
        [112, 71],
      ],
      { w: 2.6, seed: 152, wobble: 0.8, taper: [0.4, 0.05], peak: 0.2, color: ink, opacity: 0.9 },
    )
  return `<g class="fish koi" data-species="koi">
    ${pivot(48, 40, 'rig-tail', tailGroup)}
    ${pivot(95, 40, 'rig-rear', rearGroup)}
    ${pivot(120, 40, 'rig-body', bodyGroup)}
    ${pivot(150, 52, 'rig-pec', pecGroup)}
  </g>`
}

/**
 * Dojo (weather loach): the four nested segments (head, two body rings, tail) share one wash
 * tube; only the true ends (snout, tail paddle) close into a full ink silhouette. Each internal
 * ring is inked as an open top edge + open bottom edge that taper to nothing at both joints, so
 * neighbouring rings (drawn later, on top, and overlapping generously) bury the fade and the
 * chain reads as one sinuous line rather than a row of pinched lenses. Muddy-olive wash, two
 * darker spot washes per ring, a rounded ink-contour tail paddle, two barbel flicks. ~26 elements.
 */
export function dojo(): string {
  const ink = v('ink')
  const wc = v('loach-wash')
  const spot = v('loach-spot')
  const spotN = Math.max(1, Math.round(2 * INK.detail))
  const speck = (x: number, y: number, r: number, seed: number) =>
    wash(ellipsePts(x, y, r, r * 0.8, 5, seed), spot, {
      seed,
      amp: r * 0.3,
      opacity: 0.6,
      rim: 0.5,
    })
  const headLine: P2[] = [
    [134, 28],
    [152, 25],
    [172, 25],
    [188, 29],
    [196, 34],
    [200, 40],
    [196, 46],
    [188, 51],
    [172, 55],
    [152, 55],
    [134, 52],
  ]
  const head =
    wash(headLine, wc, {
      seed: 211,
      amp: 4,
      opacity: 0.75,
      rim: 1,
      bloom: { color: '#cbc39f', scale: 0.5, opacity: 0.3, dy: 6 },
    }) +
    brush(headLine, { w: 4.4, seed: 212, wobble: 1, taper: [0.22, 0.22], peak: 0.5, color: ink }) +
    brush(
      [
        [197, 44],
        [204, 50],
        [208, 55],
      ],
      { w: 1.2, seed: 213, wobble: 0.4, taper: [0.5, 0.03], color: ink, opacity: 0.85 },
    ) +
    brush(
      [
        [194, 47],
        [198, 55],
        [199, 61],
      ],
      { w: 1.2, seed: 214, wobble: 0.4, taper: [0.5, 0.03], color: ink, opacity: 0.85 },
    ) +
    hatch(180, 36, 10, 1.9, 1.8, ink, 0.55) +
    circle(190, 37, 2, ink) +
    circle(190.9, 36.2, 0.7, '#fff')
  const seg2Wash: P2[] = [
    [86, 29],
    [104, 26],
    [124, 26],
    [142, 28],
    [153, 31],
    [153, 49],
    [142, 52],
    [124, 54],
    [104, 54],
    [86, 51],
  ]
  let seg2 =
    wash(seg2Wash, wc, { seed: 221, amp: 3, opacity: 0.72, rim: 1 }) +
    brush(
      [
        [88, 29],
        [104, 26],
        [124, 26],
        [142, 28],
        [151, 30],
      ],
      { w: 4.2, seed: 222, wobble: 1, taper: [0.15, 0.15], peak: 0.55, color: ink },
    ) +
    brush(
      [
        [88, 51],
        [104, 54],
        [124, 54],
        [142, 52],
        [151, 50],
      ],
      { w: 4.2, seed: 224, wobble: 1, taper: [0.15, 0.15], peak: 0.45, color: ink },
    )
  for (let i = 0; i < spotN; i++) seg2 += speck(110 + i * 20, 33 + i * 14, 4.5, 223 + i)
  const seg3Wash: P2[] = [
    [38, 30],
    [54, 27],
    [72, 27],
    [88, 29],
    [97, 32],
    [97, 48],
    [88, 51],
    [72, 53],
    [54, 53],
    [38, 50],
  ]
  let seg3 =
    wash(seg3Wash, wc, { seed: 231, amp: 3, opacity: 0.72, rim: 1 }) +
    brush(
      [
        [40, 30],
        [54, 27],
        [72, 27],
        [88, 29],
        [95, 31],
      ],
      { w: 4, seed: 232, wobble: 1, taper: [0.15, 0.15], peak: 0.55, color: ink },
    ) +
    brush(
      [
        [40, 50],
        [54, 53],
        [72, 53],
        [88, 51],
        [95, 49],
      ],
      { w: 4, seed: 234, wobble: 1, taper: [0.15, 0.15], peak: 0.45, color: ink },
    )
  for (let i = 0; i < spotN; i++) seg3 += speck(58 + i * 20, 34 + i * 13, 4, 233 + i)
  const tail =
    wash(ellipsePts(28, 40, 30, 14, 8, 0.15), wc, {
      seed: 241,
      amp: 3,
      opacity: 0.65,
      rim: 0.8,
    }) +
    brush(
      [
        [48, 32],
        [38, 30],
        [28, 30],
        [18, 33],
      ],
      { w: 3.4, seed: 242, wobble: 0.9, taper: [0.15, 0.2], peak: 0.4, color: ink },
    ) +
    brush(
      [
        [48, 48],
        [38, 50],
        [28, 50],
        [18, 47],
      ],
      { w: 3.4, seed: 244, wobble: 0.9, taper: [0.15, 0.2], peak: 0.4, color: ink },
    ) +
    contour(ellipsePts(10, 40, 9, 12, 7, 0.3), 2.6, 243, ink, 0.9)
  return `<g class="fish dojo" data-species="dojo">
    ${pivot(
      150,
      40,
      'rig-s1',
      head +
        pivot(
          100,
          40,
          'rig-s2',
          seg2 + pivot(50, 40, 'rig-s3', seg3 + pivot(24, 40, 'rig-tail', tail)),
        ),
    )}
  </g>`
}

/**
 * Funa (crucian carp): a deep-bodied, blunter version of the same technique - one tapered
 * outline for the (unpivoted) body, forked tail as two open sweeps, a rear wedge and a small
 * dorsal pennant. Olive wash with a paler belly bloom, ink-dot eye, gill and scale hatches, two
 * small static fin flicks. ~17 elements.
 */
export function funa(): string {
  const ink = v('ink')
  const wc = v('funa-wash')
  const bodyLine: P2[] = [
    [46, 30],
    [66, 16],
    [100, 10],
    [136, 12],
    [164, 20],
    [186, 32],
    [197, 40],
    [196, 45],
    [182, 54],
    [156, 62],
    [122, 66],
    [86, 62],
    [58, 54],
    [46, 48],
  ]
  const scaleN = Math.max(1, Math.round(2 * INK.detail))
  let scaleMarks = ''
  for (let i = 0; i < scaleN; i++)
    scaleMarks += hatch(84 + i * 30, 40 + i * 6, 14, 0.15 + i * 0.1, 1.6, ink, 0.5)
  const body =
    wash(bodyLine, wc, {
      seed: 311,
      amp: 5,
      opacity: 0.75,
      rim: 1.1,
      bloom: { color: v('funa-belly'), scale: 0.55, opacity: 0.4, dy: 10 },
    }) +
    brush(bodyLine, { w: 4, seed: 312, wobble: 1, taper: [0.2, 0.2], peak: 0.46, color: ink }) +
    hatch(172, 34, 12, 1.8, 1.8, ink, 0.55) +
    scaleMarks +
    circle(180, 37, 3, ink) +
    circle(181.1, 35.9, 1, '#fff')
  const tail =
    wash(
      [
        [45, 30],
        [9, 12],
        [1, 40],
        [9, 68],
        [45, 50],
      ],
      wc,
      { seed: 321, amp: 5, opacity: 0.5, rim: 0.7 },
    ) +
    brush(
      [
        [44, 31],
        [25, 20],
        [9, 10],
        [2, 6],
      ],
      { w: 3.2, seed: 322, wobble: 0.8, taper: [0.4, 0.12], peak: 0.2, color: ink },
    ) +
    brush(
      [
        [44, 49],
        [25, 60],
        [9, 70],
        [2, 74],
      ],
      { w: 3.2, seed: 323, wobble: 0.8, taper: [0.4, 0.12], peak: 0.2, color: ink },
    )
  const rearLine: P2[] = [
    [44, 30],
    [64, 22],
    [84, 28],
    [92, 40],
    [84, 52],
    [64, 58],
    [44, 50],
  ]
  const rear =
    wash(rearLine, wc, { seed: 331, amp: 4, opacity: 0.65, rim: 1 }) +
    brush(rearLine, { w: 3.2, seed: 332, wobble: 1, taper: [0.18, 0.18], peak: 0.5, color: ink })
  const dorsal =
    wash(
      [
        [100, 16],
        [112, 5],
        [122, 9],
        [112, 17],
      ],
      wc,
      { seed: 341, amp: 3, opacity: 0.5, rim: 0.5 },
    ) +
    brush(
      [
        [100, 17],
        [110, 5],
        [122, 9],
      ],
      { w: 2.2, seed: 342, wobble: 0.6, taper: [0.3, 0.1], color: ink, opacity: 0.85 },
    )
  const fins =
    brush(
      [
        [114, 60],
        [106, 72],
        [98, 68],
      ],
      { w: 1.8, seed: 351, wobble: 0.5, taper: [0.35, 0.08], color: ink, opacity: 0.8 },
    ) +
    brush(
      [
        [82, 56],
        [74, 66],
        [66, 62],
      ],
      { w: 1.6, seed: 352, wobble: 0.5, taper: [0.35, 0.08], color: ink, opacity: 0.75 },
    )
  return `<g class="fish funa" data-species="funa">
    ${pivot(46, 40, 'rig-tail', tail)}
    ${pivot(92, 40, 'rig-rear', rear)}
    ${body}
    ${pivot(110, 14, 'rig-dorsal', dorsal)}
    ${fins}
  </g>`
}

export function fishMarkup(spec: FishSpec, _prefix: string, withShadow = true): string {
  const inner =
    spec.species === 'koi' ? koi(spec.variant) : spec.species === 'dojo' ? dojo() : funa()
  const shadow = withShadow
    ? `<ellipse class="fish-shadow" data-shadow="${spec.id}" rx="${f(60 * spec.scale)}" ry="${f(10 * spec.scale)}" fill="#1f2a30" fill-opacity=".35" opacity="0"/>`
    : ''
  return `<path class="lane" data-lane="${spec.id}" d="${spec.lane}" fill="none" stroke="none"/>
    ${shadow}<g class="fish-mover" data-fish="${spec.id}"><g transform="scale(${f(spec.scale)}) translate(-100 -40)">${inner}</g></g>`
}

/* ---------- locomotion ---------- */

const MUD_Y = 985
const SEG_CLASSES: Readonly<Record<Species, readonly string[]>> = {
  koi: ['rig-rear', 'rig-tail'],
  dojo: ['rig-s1', 'rig-s2', 'rig-s3', 'rig-tail'],
  funa: ['rig-rear', 'rig-tail'],
}

type Mode = 'burst' | 'glide' | 'rest' | 'dart' | 'cruise'

interface Swimmer {
  spec: FishSpec
  mover: Element
  lane: SVGPathElement
  total: number
  shadow: Element | null
  /** body chain head -> tail (each a pivot group rotated about its joint) */
  segs: (Element | null)[]
  body: Element | null
  pec: Element | null
  dorsal: Element | null
  rnd: () => number
  s: number
  v: number
  vBase: number
  phase: number
  amp: number
  heading: number
  turn: number
  cycleT: number
  cycleLen: number
  mode: Mode
  lateral: number
  left: boolean
}

const wrapLen = (l: number, total: number): number => ((l % total) + total) % total
const clampN = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x)
const approach = (x: number, target: number, dt: number, tau: number): number =>
  dt > 0 ? x + (target - x) * (1 - Math.exp(-dt / tau)) : target

/** Speed by behaviour: burst-and-glide cycles, the loach's rest / dart / cruise, or a school follower's spring. */
function drive(sw: Swimmer, dt: number, leader: Swimmer | null): void {
  const { rnd } = sw
  if (leader) {
    // Follower: hold a spacing behind the leader along the lane with a damped spring.
    const spacing = (sw.spec.rank ?? 1) * 130
    let err = wrapLen(leader.s - spacing - sw.s, sw.total)
    if (err > sw.total / 2) err -= sw.total
    const a = 2.5 * err + 1.6 * (leader.v - sw.v)
    sw.v = clampN(sw.v + a * dt, 0.2 * sw.vBase, 2.6 * sw.vBase)
    sw.mode = leader.mode
    return
  }
  sw.cycleT += dt
  if (sw.spec.species === 'dojo') {
    if (sw.cycleT >= sw.cycleLen) {
      sw.cycleT = 0
      if (sw.mode === 'rest') {
        sw.mode = 'dart'
        sw.cycleLen = 0.8
      } else if (sw.mode === 'dart') {
        sw.mode = 'cruise'
        sw.cycleLen = 2 + rnd() * 1.5
      } else {
        sw.mode = 'rest'
        sw.cycleLen = 2 + rnd() * 2
      }
    }
    const target = sw.mode === 'rest' ? 0 : sw.mode === 'dart' ? sw.vBase * 3 : sw.vBase
    const tau = sw.mode === 'rest' ? 0.4 : sw.mode === 'dart' ? 0.15 : 0.8
    sw.v = approach(sw.v, target, dt, tau)
    return
  }
  if (sw.cycleT >= sw.cycleLen) {
    sw.cycleT = 0
    sw.cycleLen = 3 + rnd() * 3
  }
  const burst = sw.cycleT < sw.cycleLen * 0.35
  sw.mode = burst ? 'burst' : 'glide'
  sw.v = approach(sw.v, burst ? sw.vBase * 1.6 : sw.vBase * 0.55, dt, burst ? 0.6 : 1.8)
}

/** Pose from the lane: position, heading (unwrapped for the turn rate), mirror for leftward travel, mud shadow. */
function place(sw: Swimmer, dt: number): void {
  const { lane, total } = sw
  const p = lane.getPointAtLength(wrapLen(sw.s, total))
  const q = lane.getPointAtLength(wrapLen(sw.s + 4, total))
  const dx = q.x - p.x
  const dy = q.y - p.y
  const len = Math.hypot(dx, dy) || 1
  const h = Math.atan2(dy, dx)
  let d = h - sw.heading
  d = Math.atan2(Math.sin(d), Math.cos(d))
  const rate = dt > 0 ? d / dt : 0
  sw.turn = approach(sw.turn, rate, dt, 0.12)
  sw.heading += d
  const x = p.x + (-dy / len) * sw.lateral
  const y = p.y + (dx / len) * sw.lateral
  let deg = (h * 180) / Math.PI
  sw.left = dx < 0
  if (sw.left) deg -= 180
  sw.mover.setAttribute(
    'transform',
    `translate(${f(x)} ${f(y)}) rotate(${f(deg)})${sw.left ? ' scale(-1 1)' : ''}`,
  )
  if (sw.shadow) {
    // Contact shadow on the mud: strongest for a fish hugging the bottom, faint mid-water.
    const strength = 0.35 * (1 - Math.min(1, Math.max(0, (MUD_Y - y) / 700)))
    sw.shadow.setAttribute('transform', `translate(${f(x)} ${f(MUD_Y)})`)
    sw.shadow.setAttribute('opacity', strength.toFixed(3))
  }
}

/**
 * Body wave and bend: a travelling sine down the chain whose rate follows speed and whose
 * amplitude follows the mode, plus a bend from the turn rate so the tail swings outside the
 * turn, and a small bank (skew) on the body. Mirrored fish flip the bend sign.
 */
function wave(sw: Swimmer, dt: number): void {
  const sp = sw.spec.species
  const rel = sw.vBase > 0 ? sw.v / sw.vBase : 0
  let freq: number
  let ampTarget: number
  let lag: number
  if (sp === 'koi') {
    freq = 0.8 + 0.7 * rel
    ampTarget = sw.mode === 'burst' ? 14 : 5
    lag = 1.1
  } else if (sp === 'dojo') {
    freq = sw.mode === 'rest' ? 0.6 : sw.mode === 'dart' ? 4 : 2.2
    ampTarget = sw.mode === 'rest' ? 1.5 : sw.mode === 'dart' ? 14 : 8
    lag = 1.05
  } else {
    freq = 1.2 + 0.9 * rel
    ampTarget = sw.mode === 'burst' ? 10 : 4
    lag = 1
  }
  sw.phase += freq * dt
  sw.amp = approach(sw.amp, ampTarget, dt, 0.5)
  const sign = sw.left ? -1 : 1
  const bend = clampN(sign * sw.turn * 14, -18, 18)
  const n = sw.segs.length
  sw.segs.forEach((seg, i) => {
    if (!seg) return
    const share = (i + 1) / n
    const a = sw.amp * (0.35 + 0.65 * share) * Math.sin(sw.phase * Math.PI * 2 - i * lag)
    seg.setAttribute('transform', `rotate(${f(a + bend * share)})`)
  })
  if (sw.body) {
    const bank = clampN(-sign * sw.turn * 6, -8, 8)
    const breathe = 2 * Math.sin(sw.phase * Math.PI * 2)
    sw.body.setAttribute('transform', `skewX(${f(bank + breathe)})`)
  }
  if (sw.pec)
    sw.pec.setAttribute('transform', `rotate(${f(-8 + 7 * Math.sin(sw.phase * Math.PI))})`)
  if (sw.dorsal)
    sw.dorsal.setAttribute('transform', `rotate(${f(3 * Math.sin(sw.phase * Math.PI))})`)
}

/**
 * Start every fish under `root`: one anime timer per layer ticks the swimmers from the
 * director's engine update (frozen frames stay still). Reduced motion places the start pose
 * once and never animates.
 */
export function startSwim(root: Element, specs: readonly FishSpec[], reduced: boolean): void {
  const swimmers: Swimmer[] = []
  for (const spec of specs) {
    const mover = root.querySelector(`[data-fish="${spec.id}"]`)
    const lane = root.querySelector<SVGPathElement>(`[data-lane="${spec.id}"]`)
    if (!mover || !lane) continue
    const total = lane.getTotalLength()
    if (!(total > 0)) continue
    const q = (cls: string) => mover.querySelector(`.${cls}`)
    const seed = [...spec.id].reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7) >>> 0
    const rnd = mulberry32(seed)
    const vBase = total / Math.max(1, spec.duration)
    const sw: Swimmer = {
      spec,
      mover,
      lane,
      total,
      shadow: root.querySelector(`[data-shadow="${spec.id}"]`),
      segs: SEG_CLASSES[spec.species].map(q),
      body: spec.species === 'koi' ? q('rig-body') : null,
      pec: spec.species === 'koi' ? q('rig-pec') : null,
      dorsal: spec.species === 'funa' ? q('rig-dorsal') : null,
      rnd,
      s: (spec.offset ?? 0) * total,
      v: vBase,
      vBase,
      phase: rnd(),
      amp: spec.species === 'dojo' ? 1.5 : 5,
      heading: 0,
      turn: 0,
      cycleT: rnd() * 2,
      cycleLen: spec.species === 'dojo' ? 1 + rnd() : 3 + rnd() * 3,
      mode: spec.species === 'dojo' ? 'cruise' : 'glide',
      lateral: 0,
      left: false,
    }
    // Initial heading from the lane so the first frame carries no turn.
    const p = lane.getPointAtLength(wrapLen(sw.s, total))
    const p1 = lane.getPointAtLength(wrapLen(sw.s + 4, total))
    sw.heading = Math.atan2(p1.y - p.y, p1.x - p.x)
    place(sw, 0)
    wave(sw, 0)
    swimmers.push(sw)
  }
  if (reduced || swimmers.length === 0) return
  const byId = new Map(swimmers.map((sw) => [sw.spec.id, sw]))
  let clock = 0
  createTimer({
    onUpdate: (self) => {
      const dt = Math.min(self.deltaTime, 50) / 1000
      if (dt <= 0) return
      clock += dt
      for (const sw of swimmers) {
        const leader = sw.spec.leader ? (byId.get(sw.spec.leader) ?? null) : null
        drive(sw, dt, leader)
        // School members drift a little to the side of the lane so the group stays loose.
        if (leader || sw.spec.rank !== undefined)
          sw.lateral = 22 * Math.sin(clock * 0.4 + (sw.spec.rank ?? 0) * 1.7)
        sw.s += sw.v * dt
        place(sw, dt)
        wave(sw, dt)
      }
    },
  })
}
