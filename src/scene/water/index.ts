import { animate } from 'animejs'
import type { Quality } from '../../config/quality'
import { WATER } from '../../config/layers'
import { brush, contour, ellipsePts, fogRect, granulated, hatch, texRect, v, wash } from '../draw'
import type { P2 } from '../draw'
import { fishDefs, fishMarkup, startSwim, type FishSpec } from '../fish'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'
import { attrWrite } from '../../util/dom'
import { mulberry32 } from '../../util/math'

/** A long undulating polyline across the frame bleed, sampled for an ink wave-line stroke. */
function wavePts(y: number, amp: number, seed: number): P2[] {
  const rnd = mulberry32(seed)
  const pts: P2[] = []
  for (let x = -400; x <= 2000; x += 140) {
    pts.push([x, y + Math.sin((x + seed * 97) / 210) * amp + (rnd() - 0.5) * 6])
  }
  return pts
}

/**
 * The water surface seen from below: a granulated deep-teal "mirror" wash filling the ceiling,
 * a paler halo and a paper-white Snell's-window wash near the top centre (the cone of sky
 * visible from underwater, rims off so it stays soft), and open ink strokes tracing the
 * underside of the surface chop. Colour is washes only; no gradients, no material tiles.
 */
function ceilingLayer(): Layer {
  const cx = 800
  const cy = 190
  // Deep mirror band up top, a paler band lower down so the two granulated washes overlap and
  // step the tone rather than cutting off hard against the fixed background gradient below.
  const deep = granulated('uwc-deep', -400, -400, 2400, 620, v('uw-wash-deep'), {
    seed: 81,
    amp: 22,
    opacity: 0.6,
    rim: 0,
  })
  const mid = granulated('uwc-mid', -400, 30, 2400, 460, v('uw-wash'), {
    seed: 87,
    amp: 20,
    opacity: 0.4,
    rim: 0,
  })
  const halo = wash(ellipsePts(cx, cy, 470, 195, 16, 0.2), v('uw-wash'), {
    seed: 82,
    amp: 10,
    opacity: 0.48,
    rim: 0,
  })
  const window = wash(ellipsePts(cx, cy, 290, 118, 16, 0.5), v('cloud'), {
    seed: 83,
    amp: 8,
    opacity: 0.55,
    rim: 0,
    bloom: { color: '#ffffff', scale: 0.5, opacity: 0.4, dy: -8 },
  })
  const chop =
    brush(wavePts(230, 14, 1), { w: 2.4, seed: 84, wobble: 2, color: v('ink'), opacity: 0.6 }) +
    brush(wavePts(275, 12, 2), {
      w: 2.2,
      seed: 85,
      wobble: 2,
      color: v('ink-mid'),
      opacity: 0.46,
    }) +
    brush(wavePts(320, 16, 3), { w: 2, seed: 86, wobble: 2, color: v('ink-mid'), opacity: 0.32 })
  return makeSvgLayer('uw-ceiling', WATER.ceiling, deep + mid + halo + window + chop)
}

/**
 * Light shafts as pale paper washes (no rim, so no line reads at their edges), fanning down
 * from the surface. Same `.rays`/`.ray` group structure and drift animation as before.
 */
function raysLayer(): Layer {
  let rays = ''
  for (let i = 0; i < 6; i++) {
    const shaft: P2[] = [
      [560 + 70 * i, -220],
      [600 + 70 * i, -220],
      [320 + 220 * i, 1420],
      [200 + 220 * i, 1420],
    ]
    rays += wash(shaft, v('cloud'), {
      seed: 60 + i,
      amp: 14,
      opacity: 0.12 + (0.08 * i) / 5,
      rim: 0,
      extra: `class="ray" data-i="${i}"`,
    })
  }
  const inner = `<g class="rays">${rays}</g>`
  const layer = makeSvgLayer('uw-rays', { ...WATER.rays, live: true }, inner)
  const g = layer.el.querySelector('.rays')
  if (g)
    animate(g, {
      translateX: [-30, 30],
      duration: 9000,
      loop: true,
      alternate: true,
      ease: 'inOutSine',
    })
  layer.update = (state) => {
    if (g) attrWrite(g, 'opacity', state.water.rays.toFixed(3))
  }
  return layer
}

/** A short splay of root-flick marks from a stem's base, mostly pointing down into the mud. */
function rootFlick(
  x: number,
  y: number,
  seed: number,
  w: number,
  color: string,
  opacity: number,
): string {
  const rnd = mulberry32(seed)
  let out = ''
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 2 + (rnd() - 0.5) * 1.7
    const len = 14 + rnd() * 18
    out += hatch(x, y, len, a, w, color, opacity)
  }
  return out
}

/** A closed thin ribbon loop beside a curve: the curve shifted out, and shifted in, joined. */
function sideRibbon(pts: readonly P2[], outOffset: number, innerOffset: number): P2[] {
  const outer = pts.map(([x, y]): P2 => [x + outOffset, y])
  const inner = pts.map(([x, y]): P2 => [x + innerOffset, y])
  return [...outer, ...inner.reverse()]
}

function stemsLayer(id: string, opts: { depth: number; restCz: number }, near: boolean): Layer {
  const rnd = mulberry32(near ? 91 : 92)
  let stems = ''
  if (near) {
    // Five long tapered black strokes framing the left/right edges, each with a green wash
    // (a second blade of the clump) bled in toward the centre of frame.
    for (const x of [-40, 60, 1480, 1580, 1660]) {
      const seed = 900 + Math.round(x + 200)
      const r = mulberry32(seed)
      const lean = (r() - 0.5) * 70
      const pts: P2[] = [
        [x, 1440],
        [x + lean * 0.35, 900],
        [x - lean * 0.45, 480],
        [x + lean * 0.2, -220],
      ]
      const side = x < 800 ? 1 : -1
      stems += wash(sideRibbon(pts, side * 24, side * 2), v('rice-wash'), {
        seed: seed + 40,
        amp: 8,
        opacity: 0.48,
        rim: 1,
      })
      stems += brush(pts, { w: 6, seed: seed + 80, wobble: 3, color: v('ink'), opacity: 1 })
    }
  } else {
    // ~26 thin grey brush strokes with small root flicks at the base.
    for (let i = 0; i < 26; i++) {
      const x = -100 + rnd() * 1800
      const top = 120 + rnd() * 60
      const bend = (rnd() - 0.5) * 80
      const pts: P2[] = [
        [x, 980],
        [x + bend * 0.6, 700],
        [x - bend * 0.6, 400],
        [x + bend / 2, top],
      ]
      stems += brush(pts, {
        w: 1.5,
        seed: 400 + i,
        wobble: 1.4,
        color: v('ink-far'),
        opacity: 0.7,
        taper: [0.15, 0.03],
      })
      stems += rootFlick(x, 980, 500 + i, 1, v('ink-far'), 0.55)
    }
  }
  const fog = near ? '' : fogRect('fog', -300, -300, 2200, 1800, v('uw-wash'))
  const layer = makeSvgLayer(id, opts, stems + fog)
  const fogEl = layer.el.querySelector('.fog')
  if (fogEl) fogEl.setAttribute('opacity', '0.18')
  return layer
}

/**
 * The mud bed: a granulated brown wash, one long open ink horizon stroke where mud meets water,
 * a scatter of ink stone contours with grey washes, and a few root/debris marks.
 */
function mudLayer(low: boolean): Layer {
  const rnd = mulberry32(93)
  const bedX = -400
  const bedY = 960
  const bedW = 2400
  const bedH = 640
  const bed = granulated('uwm-bed', bedX, bedY, bedW, bedH, v('mud-wash'), {
    seed: 94,
    amp: 16,
    opacity: 0.6,
    rim: 0,
  })
  const horizon = brush(
    [
      [-400, 986],
      [200, 976],
      [700, 994],
      [1150, 980],
      [1650, 992],
      [2000, 982],
    ],
    { w: 3.6, seed: 95, wobble: 2.5, color: v('ink'), opacity: 0.85 },
  )
  let stones = ''
  for (let i = 0; i < 14; i++) {
    const x = -200 + rnd() * 2000
    const y = 995 + rnd() * 45
    const rx = 12 + rnd() * 18
    const ry = 6 + rnd() * 8
    const pts = ellipsePts(x, y, rx, ry, 7, rnd() * Math.PI)
    const dark = rnd() < 0.4
    stones +=
      wash(pts, dark ? v('stone-wall-dark') : v('stone-wall'), {
        seed: 96 + i,
        amp: 3,
        opacity: 0.55,
        rim: 1,
      }) + contour(pts, 2.6, 97 + i, v('ink'), 0.8)
  }
  const debrisSpots: readonly (readonly [number, number])[] = [
    [420, 1005],
    [1180, 1010],
    [860, 1015],
  ]
  let debris = ''
  for (const [dx, dy] of debrisSpots) {
    debris += hatch(dx, dy, 16, 0.3, 1.6, v('ink'), 0.6)
    debris += hatch(dx + 8, dy + 2, 12, 2.6, 1.3, v('ink-mid'), 0.5)
  }
  const lowCaustic = low ? texRect('causticA', bedX, bedY + 10, bedW, bedH - 20, 512, 0.2, 256) : ''
  return makeSvgLayer('uw-mud', WATER.mud, `${bed}${lowCaustic}${horizon}${stones}${debris}`)
}

/** Dappled light on the mud: two caustic tiles drifting against each other (live plane), plus a compound fog plane. */
function causticsLayer(quality: Quality): Layer {
  const inner = `<g class="caust"><g class="ca">${texRect('causticA', -280 - 512, 992, 2160 + 1024, 430, 512, 0.18, 256)}</g><g class="cb">${texRect(
    'causticB',
    -280 - 666,
    992,
    2160 + 1332,
    430,
    666,
    0.12,
    333,
  )}</g></g>${fogRect('fog', -300, -300, 2200, 1800, v('uw-mid'))}`
  const layer = makeSvgLayer(
    'uw-caustics',
    { ...WATER.caustics, live: !quality.reducedMotion },
    inner,
  )
  const g = layer.el.querySelector('.caust')
  const ca = layer.el.querySelector('.ca')
  const cb = layer.el.querySelector('.cb')
  const fog = layer.el.querySelector('.fog')
  if (fog) fog.setAttribute('opacity', '0.12')
  if (!quality.reducedMotion) {
    // One loop = exactly one tile period in opposite directions, so the wrap never shows.
    if (ca) animate(ca, { translateX: [0, 512], duration: 16000, ease: 'linear', loop: true })
    if (cb) animate(cb, { translateX: [0, -666], duration: 26000, ease: 'linear', loop: true })
  }
  layer.update = (state) => {
    if (g) attrWrite(g, 'opacity', state.water.rays.toFixed(3))
  }
  return layer
}

/** A layer of swimming fish: hidden lanes + rigged fish groups; reveal index picks the fade. */
function fishLayer(
  id: string,
  opts: { depth: number; restCz: number },
  specs: FishSpec[],
  which: 0 | 1,
  quality: Quality,
): Layer {
  const prefix = `${id}-`
  const inner = `${fishDefs(prefix)}${specs.map((spec) => fishMarkup(spec, prefix, which === 0)).join('')}`
  const layer = makeSvgLayer(id, { ...opts, live: !quality.reducedMotion }, inner)
  const svgEl = layer.el.querySelector('svg')
  layer.mount = () => {
    startSwim(layer.el, specs, quality.reducedMotion)
  }
  layer.update = (state) => {
    if (svgEl) attrWrite(svgEl, 'opacity', state.water.fishReveal[which].toFixed(3))
  }
  return layer
}

const LANES = {
  lensHigh: 'M-260 600C300 500 1300 500 1860 600C1300 700 300 700 -260 600Z',
  lensLow: 'M-260 780C300 700 1300 720 1860 790C1300 860 300 850 -260 780Z',
  hero: 'M-500 520C200 380 1300 640 2100 560C1400 780 300 720 -500 520Z',
  mud: 'M-400 930C200 890 700 985 1200 940C1500 915 1700 960 2000 940C1600 1000 900 1010 300 980C0 970 -300 990 -400 930Z',
  school: 'M-300 470C300 420 900 440 1900 480C1300 560 500 540 -300 470Z',
} as const

export function buildWaterLayers(quality: Quality): Layer[] {
  const low = quality.tier === 'low'
  const layers: (Layer | null)[] = [
    ceilingLayer(),
    raysLayer(),
    stemsLayer('uw-stems-far', WATER.stemsFar, false),
    low
      ? null
      : fishLayer(
          'fish-back',
          WATER.fishBack,
          [0, 1, 2, 3, 4].map((i) => ({
            id: `funa${i}`,
            species: 'funa' as const,
            scale: 0.5 + (i % 3) * 0.07,
            lane: LANES.school,
            duration: 30,
            offset: 0.3 - i * 0.05,
            rank: i,
            ...(i > 0 ? { leader: 'funa0' } : {}),
          })),
          1,
          quality,
        ),
    mudLayer(low),
    low ? null : causticsLayer(quality),
    fishLayer(
      'fish-mid',
      WATER.fishMid,
      [
        {
          id: 'koiA',
          species: 'koi',
          scale: 1.3,
          lane: LANES.lensHigh,
          duration: 22,
          offset: 0.1,
          variant: 'kohaku',
        },
        {
          id: 'koiB',
          species: 'koi',
          scale: 1.1,
          lane: LANES.lensLow,
          duration: 26,
          offset: 0.62,
          variant: 'orange',
        },
      ],
      0,
      quality,
    ),
    fishLayer(
      'fish-near',
      WATER.fishNear,
      [
        { id: 'dojo', species: 'dojo', scale: 1.5, lane: LANES.mud, duration: 18, offset: 0.3 },
        {
          id: 'koiC',
          species: 'koi',
          scale: 1.9,
          lane: LANES.hero,
          duration: 25,
          offset: 0.55,
          variant: 'white',
        },
      ],
      0,
      quality,
    ),
    stemsLayer('uw-stems-near', WATER.stemsNear, true),
  ]
  return layers.filter((l): l is Layer => l !== null)
}
