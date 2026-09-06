import { createTimer } from 'animejs'
import { circle, ellipse, f, linGrad, path, pivot, radGrad, rect, v } from './draw'
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

export function fishDefs(prefix: string): string {
  return `<defs id="${prefix}${DEFS_ID}">
    ${linGrad(`${prefix}funaBody`, [
      [0, v('funa-back')],
      [0.45, v('funa')],
      [0.8, v('funa-belly')],
      [1, '#dfe3d2'],
    ])}
    ${linGrad(`${prefix}koiWhite`, [
      [0, v('koi-white-lit')],
      [0.4, v('koi-white')],
      [0.75, '#cfc6b6'],
      [1, v('koi-white-shade')],
    ])}
    ${linGrad(`${prefix}koiOrange`, [
      [0, v('koi-orange-lit')],
      [0.4, v('koi-orange')],
      [1, v('koi-orange-deep')],
    ])}
    ${linGrad(`${prefix}dojoBody`, [
      [0, '#6a6650'],
      [0.5, v('loach')],
      [1, '#3a3828'],
    ])}
    ${radGrad(`${prefix}ao`, [
      [0, v('uw-abyss'), 0.6],
      [0.6, v('uw-abyss'), 0.25],
      [1, v('uw-abyss'), 0],
    ])}
  </defs>`
}

export function koi(variant: KoiVariant = 'kohaku', prefix = ''): string {
  const body = variant === 'orange' ? `url(#${prefix}koiOrange)` : `url(#${prefix}koiWhite)`
  const belly = variant === 'orange' ? v('koi-orange-deep') : '#d8cfbe'
  const patches =
    variant === 'kohaku'
      ? path('M84 20C100 12 124 14 132 24C124 32 100 34 88 30Z', v('koi-orange')) +
        path('M150 20C166 18 180 26 184 34C170 36 156 32 148 28Z', v('koi-orange'))
      : variant === 'white'
        ? path('M104 22C118 14 138 16 144 26C134 32 116 34 106 30Z', v('koi-ink'), 'opacity=".85"')
        : ''
  return `<g class="fish koi" data-species="koi">
    ${pivot(
      48,
      40,
      'rig-tail',
      path('M48 40C30 22 12 10 4 8C14 28 14 52 4 72C12 70 30 58 48 40Z', body) +
        path(
          'M40 40C26 30 16 22 10 18M40 40C26 50 16 58 10 62',
          'none',
          `stroke="${v('koi-orange-deep')}" stroke-width="2" opacity=".35"`,
        ),
    )}
    ${pivot(
      95,
      40,
      'rig-rear',
      path('M95 18C78 20 60 30 44 40C60 50 78 60 95 62Z', body) +
        path('M86 60C80 70 70 74 66 72C72 66 78 62 84 60Z', body, 'opacity=".85"'),
    )}
    ${pivot(
      120,
      40,
      'rig-body',
      path(
        'M44 40C70 14 120 10 158 16C178 20 192 30 196 40C192 50 178 60 158 64C120 70 70 66 44 40Z',
        body,
      ) +
        path('M60 46C90 62 140 64 186 46C160 60 100 66 60 46Z', belly, 'opacity=".55"') +
        patches +
        path('M96 16C104 4 122 2 138 10C124 10 108 14 96 16Z', body, 'opacity=".9"') +
        path(
          'M164 24C158 32 158 48 164 56',
          'none',
          `stroke="#c9b9a2" stroke-width="2" opacity=".6"`,
        ) +
        circle(178, 34, 4, v('koi-ink')) +
        circle(179.5, 32.5, 1.4, '#fff'),
    )}
    ${pivot(150, 52, 'rig-pec', path('M150 52C144 64 128 70 116 66C126 58 138 54 150 52Z', body, 'opacity=".85"'))}
  </g>`
}

export function dojo(prefix = ''): string {
  const body = `url(#${prefix}dojoBody)`
  const speck = (x: number, y: number) => circle(x, y, 1.8, v('loach-spot'))
  const belly = (x0: number, x1: number) =>
    rect(x0, 43, x1 - x0, 7, v('loach-belly'), 'rx="3" opacity=".8"')
  // Head cap, then three overlapping body segments that taper toward a small rounded tail.
  const head =
    path('M150 24C170 22 186 24 194 32C199 37 199 43 194 48C186 56 170 58 150 56Z', body) +
    belly(152, 190) +
    circle(184, 34, 2.5, v('koi-ink')) +
    path(
      'M196 40l12-8M197 42l14 0M196 44l12 8M190 48l6 12M190 32l6-12M187 46l-1 12',
      'none',
      `stroke="${v('loach-belly')}" stroke-width="1.5" stroke-linecap="round" opacity=".9"`,
    ) +
    speck(160, 31) +
    speck(174, 30)
  const seg2 =
    path('M98 26C116 22 140 22 158 26L158 54C140 58 116 58 98 54Z', body) +
    belly(100, 156) +
    path('M110 26C118 17 134 17 142 26Z', v('loach-belly'), 'opacity=".9"') +
    speck(118, 31) +
    speck(134, 35) +
    speck(108, 38)
  const seg3 =
    path('M48 29C66 25 90 25 106 27L106 53C90 55 66 55 48 51Z', body) +
    belly(50, 104) +
    speck(64, 33) +
    speck(84, 30)
  const tail =
    path('M22 33C32 30 44 29 56 30L56 50C44 51 32 50 22 47Z', body) +
    ellipse(14, 40, 11, 12, body) +
    belly(24, 54)
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

export function funa(prefix: string): string {
  return `<g class="fish funa" data-species="funa">
    ${ellipse(120, 24, 24, 5, '#ffffff', 'opacity=".25"')}
    ${pivot(46, 40, 'rig-tail', path('M46 40L6 14L14 40L6 66Z', v('funa-fin')))}
    ${pivot(92, 40, 'rig-rear', path('M92 22C74 26 58 34 44 40C58 46 74 54 92 58Z', v('funa')))}
    ${path('M44 40C70 12 110 8 140 14C170 20 188 30 196 40C188 50 170 60 140 66C110 72 70 68 44 40Z', `url(#${prefix}funaBody)`)}
    ${pivot(110, 14, 'rig-dorsal', path('M86 18C96 4 124 2 134 12L134 20C120 16 100 16 86 18Z', v('funa-fin')))}
    ${path('M150 50C144 62 128 66 118 62C128 56 140 52 150 50Z', v('funa-fin'))}
    ${path('M110 62L104 74L120 66Z', v('funa-fin'))}
    ${path('M78 56L70 68L88 60Z', v('funa-fin'))}
    ${path('M60 40C100 36 140 36 180 40', 'none', `stroke="#5e6a55" stroke-width="1" opacity=".5"`)}
    ${ellipse(130, 26, 20, 5, '#dfe3d2', 'opacity=".35"')}
    ${circle(176, 34, 3.5, v('koi-ink'))}${circle(177.2, 32.8, 1.2, '#fff')}
  </g>`
}

export function fishMarkup(spec: FishSpec, prefix: string, withShadow = true): string {
  const inner =
    spec.species === 'koi'
      ? koi(spec.variant, prefix)
      : spec.species === 'dojo'
        ? dojo(prefix)
        : funa(prefix)
  const shadow = withShadow
    ? `<ellipse class="fish-shadow" data-shadow="${spec.id}" rx="${f(60 * spec.scale)}" ry="${f(10 * spec.scale)}" fill="url(#${prefix}ao)" opacity="0"/>`
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
