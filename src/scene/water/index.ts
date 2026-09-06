import { animate } from 'animejs'
import type { Quality } from '../../config/quality'
import { WATER } from '../../config/layers'
import {
  aoGrad,
  cyl,
  ellipse,
  fogRect,
  linGrad,
  path,
  polygon,
  radGrad,
  rect,
  shadow,
  texRect,
  v,
  wobbly,
} from '../draw'
import { fishDefs, fishMarkup, startLane, startRig, type FishSpec } from '../fish'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'
import { attrWrite } from '../../util/dom'
import { mulberry32 } from '../../util/math'

function ceilingLayer(): Layer {
  const wave = (y: number, amp: number) => {
    let d = `M-200 ${y}`
    for (let x = -200; x <= 1800; x += 130) d += `q65 ${amp} 130 0`
    return d
  }
  const inner = `<defs>${radGrad('uw-snell', [
    [0, '#e4f3ec', 0.5],
    [0.6, '#9fcabf', 0.25],
    [1, '#9fcabf', 0],
  ])}</defs>
    ${path(`${wave(300, 20)}V-220H-200Z`, '#4f8a80', 'opacity=".55"')}
    ${texRect('water', -200, -220, 2000, 520, 512, 0.3, 256)}
    ${ellipse(800, 170, 450, 130, 'url(#uw-snell)')}
    ${path(wave(200, 16), 'none', `stroke="${v('uw-ray')}" stroke-width="3" opacity=".5"`)}
    ${path(wave(240, 14), 'none', `stroke="${v('uw-ray')}" stroke-width="2" opacity=".3"`)}
    ${path(wave(280, 18), 'none', `stroke="${v('uw-ray')}" stroke-width="2" opacity=".2"`)}`
  return makeSvgLayer('uw-ceiling', WATER.ceiling, inner)
}

function raysLayer(): Layer {
  let rays = ''
  for (let i = 0; i < 6; i++) {
    rays += polygon(
      [
        [560 + 70 * i, -220],
        [600 + 70 * i, -220],
        [320 + 220 * i, 1420],
        [200 + 220 * i, 1420],
      ],
      'url(#uw-ray)',
      `class="ray" data-i="${i}"`,
    )
  }
  const inner = `<defs>${linGrad('uw-ray', [
    [0, v('uw-ray'), 0.3],
    [0.5, v('uw-ray'), 0.12],
    [0.85, v('uw-ray'), 0],
  ])}</defs><g class="rays">${rays}</g>`
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

function stemsLayer(id: string, opts: { depth: number; restCz: number }, near: boolean): Layer {
  const rnd = mulberry32(near ? 91 : 92)
  let stems = ''
  if (near) {
    for (const x of [-40, 60, 1480, 1580, 1660]) {
      const w = 12 + rnd() * 6
      const d = `M${x} 1420C${x + 20} 900 ${x - 30} 500 ${x + 10} -100`
      stems += path(
        d,
        'none',
        `stroke="${v('uw-stem-near')}" stroke-width="${(w + 8).toFixed(1)}" opacity=".35" stroke-linecap="round"`,
      )
      stems += path(
        d,
        'none',
        `stroke="${v('uw-stem-near')}" stroke-width="${w.toFixed(1)}" stroke-linecap="round"`,
      )
    }
  } else {
    for (let i = 0; i < 26; i++) {
      const x = -100 + rnd() * 1800
      const top = 120 + rnd() * 60
      const w = 3 + rnd() * 2
      const bend = (rnd() - 0.5) * 80
      stems += path(
        `M${x} 980C${x + bend} 700 ${x - bend} 400 ${x + bend / 2} ${top}`,
        'none',
        `stroke="${v('uw-stem')}" stroke-width="${w.toFixed(1)}" opacity=".75" stroke-linecap="round"`,
      )
      stems += path(
        `M${x} 980l-14 24M${x} 980l10 26M${x} 980l-4 30M${x} 980l18 16`,
        'none',
        `stroke="#5b6a52" stroke-width="2" opacity=".6"`,
      )
    }
  }
  const fog = near ? '' : fogRect('fog', -300, -300, 2200, 1800, v('uw-mid'))
  const layer = makeSvgLayer(id, opts, stems + fog)
  const fogEl = layer.el.querySelector('.fog')
  if (fogEl) fogEl.setAttribute('opacity', '0.18')
  return layer
}

function mudLayer(low: boolean): Layer {
  const rnd = mulberry32(93)
  let stones = ''
  for (let i = 0; i < 14; i++) {
    const x = -200 + rnd() * 2000
    const y = 990 + rnd() * 40
    const rx = 12 + rnd() * 18
    const ry = 6 + rnd() * 8
    stones +=
      shadow(x, y + ry * 0.6, rx * 1.3, ry * 0.7, 'uw-ao', 0.8) +
      ellipse(x, y, rx, ry, 'url(#uw-stone)')
  }
  const inner = `<defs>${linGrad('uw-mudGrad', [
    [0, v('mud-light')],
    [0.2, v('mud')],
    [1, v('mud-dark')],
  ])}${cyl('uw-stone', '#4a4034', '#5f5546', '#7d7466', 0.3)}${aoGrad('uw-ao', v('uw-abyss'), 0.6)}</defs>
    ${rect(-280, 980, 2160, 440, 'url(#uw-mudGrad)')}
    ${path(
      wobbly(
        [
          [-280, 980],
          [1880, 980],
          [1880, 1010],
          [-280, 1010],
        ],
        6,
        94,
      ),
      v('mud-light'),
    )}
    ${low ? texRect('causticA', -280, 990, 2160, 430, 512, 0.2, 256) : ''}
    ${stones}
    ${ellipse(420, 1000, 14, 6, '#2e2418')}${ellipse(1180, 1006, 12, 5, '#2e2418')}${ellipse(860, 1012, 10, 5, '#2e2418')}`
  return makeSvgLayer('uw-mud', WATER.mud, inner)
}

/** Dappled light on the mud: two caustic tiles drifting against each other (live plane), plus a compound fog plane. */
function causticsLayer(quality: Quality): Layer {
  const inner = `<g class="caust"><g class="ca">${texRect('causticA', -280 - 512, 992, 2160 + 1024, 430, 512, 0.2, 256)}</g><g class="cb">${texRect(
    'causticB',
    -280 - 666,
    992,
    2160 + 1332,
    430,
    666,
    0.14,
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
    for (const spec of specs) {
      const mover = layer.el.querySelector(`[data-fish="${spec.id}"]`)
      const lane = layer.el.querySelector<SVGPathElement>(`[data-lane="${spec.id}"]`)
      const shadowEl = layer.el.querySelector(`[data-shadow="${spec.id}"]`)
      if (!mover || !lane) continue
      startLane(mover, lane, spec, quality.reducedMotion, shadowEl)
      if (!quality.reducedMotion) startRig(mover, spec.species)
    }
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
            duration: 30 + i * 1.5,
            offset: 0.05 + i * 0.13,
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
