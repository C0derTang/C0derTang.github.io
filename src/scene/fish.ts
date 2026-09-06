import { animate } from 'animejs'
import { circle, ellipse, f, linGrad, path, pivot, radGrad, rect, v } from './draw'

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

const loop = { loop: true, alternate: true, ease: 'inOutSine' } as const

/** Start the undulation loops for one fish group (time-based, scroll-independent). */
export function startRig(fish: Element, species: Species): void {
  const q = (cls: string) => fish.querySelector(`.${cls}`)
  const rig = (cls: string, from: number, to: number, duration: number, delay = 0) => {
    const el = q(cls)
    if (el) animate(el, { rotate: [from, to], duration, delay, ...loop })
  }
  if (species === 'koi') {
    rig('rig-tail', -12, 12, 700)
    rig('rig-rear', -5, 5, 700, 90)
    rig('rig-pec', -14, -2, 900, 200)
    const body = q('rig-body')
    if (body) animate(body, { skewX: [-2.5, 2.5], duration: 1400, ...loop })
  } else if (species === 'dojo') {
    rig('rig-s1', -7, 7, 550)
    rig('rig-s2', -7, 7, 550, 110)
    rig('rig-s3', -7, 7, 550, 220)
    rig('rig-tail', -9, 9, 550, 330)
  } else {
    rig('rig-tail', -10, 10, 450)
    rig('rig-rear', -4, 4, 450, 60)
    rig('rig-dorsal', -4, 4, 1500)
  }
}

/**
 * Lane following: anime.js animates a length along the closed lane; the mover's transform is
 * derived from the point and tangent. Leftward travel mirrors the fish so it is never belly-up.
 */
export function startLane(
  mover: Element,
  lane: SVGPathElement,
  spec: FishSpec,
  reduced: boolean,
  shadowEl: Element | null = null,
): void {
  const total = lane.getTotalLength()
  if (!(total > 0)) return
  const MUD_Y = 985
  const place = (len: number) => {
    const wrap = (l: number) => ((l % total) + total) % total
    const p = lane.getPointAtLength(wrap(len))
    const p0 = lane.getPointAtLength(wrap(len - 3))
    const p1 = lane.getPointAtLength(wrap(len + 3))
    const dx = p1.x - p0.x
    const dy = p1.y - p0.y
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI
    const left = dx < 0
    if (left) deg -= 180
    mover.setAttribute(
      'transform',
      `translate(${f(p.x)} ${f(p.y)}) rotate(${f(deg)})${left ? ' scale(-1 1)' : ''}`,
    )
    if (shadowEl) {
      // Contact shadow on the mud: strongest for a fish hugging the bottom, faint mid-water.
      const strength = 0.35 * (1 - Math.min(1, Math.max(0, (MUD_Y - p.y) / 700)))
      shadowEl.setAttribute('transform', `translate(${f(p.x)} ${f(MUD_Y)})`)
      shadowEl.setAttribute('opacity', strength.toFixed(3))
    }
  }
  const start = (spec.offset ?? 0) * total
  place(start) // initial pose; the loop below only advances it
  if (reduced) return
  const state = { len: start }
  animate(state, {
    len: start + total,
    duration: spec.duration * 1000,
    ease: 'linear',
    loop: true,
    onUpdate: () => {
      place(state.len)
    },
  })
}
