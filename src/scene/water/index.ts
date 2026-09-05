import type { Quality } from '../../config/quality'
import { WATER } from '../../config/layers'
import { ellipse, linGrad, path, polygon, rect, v, wobbly } from '../draw'
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
  const inner = `
    ${path(`${wave(300, 20)}V-220H-200Z`, '#7fb3a8', 'opacity=".55"')}
    ${ellipse(800, 170, 450, 130, '#d7efe6', 'opacity=".35"')}
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
  const layer = makeSvgLayer('uw-rays', WATER.rays, inner)
  const g = layer.el.querySelector('.rays')
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
  return makeSvgLayer(id, opts, stems)
}

function mudLayer(): Layer {
  const rnd = mulberry32(93)
  let stones = ''
  for (let i = 0; i < 14; i++)
    stones += ellipse(
      -200 + rnd() * 2000,
      990 + rnd() * 40,
      12 + rnd() * 18,
      6 + rnd() * 8,
      i % 2 ? '#5f5546' : '#6f6656',
    )
  const inner = `
    ${rect(-280, 980, 2160, 440, v('mud'))}
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
    ${stones}
    ${ellipse(420, 1000, 14, 6, '#2e2418')}${ellipse(1180, 1006, 12, 5, '#2e2418')}${ellipse(860, 1012, 10, 5, '#2e2418')}`
  return makeSvgLayer('uw-mud', WATER.mud, inner)
}

/** Placeholder fish (rigs come in the fish pass). */
function fishLayer(
  id: string,
  opts: { depth: number; restCz: number },
  which: 0 | 1,
  seed: number,
): Layer {
  const rnd = mulberry32(seed)
  let fish = ''
  const n = which === 0 ? 3 : 4
  for (let i = 0; i < n; i++) {
    const x = 200 + rnd() * 1200
    const y = 400 + rnd() * 500
    const s = which === 0 ? 1.3 : 0.7
    const dir = rnd() > 0.5 ? 1 : -1
    fish += `<g transform="translate(${x} ${y}) scale(${dir * s} ${s})">${ellipse(0, 0, 80, 26, which === 0 ? v('koi-white') : v('funa'))}${polygon(
      [
        [-70, 0],
        [-120, -30],
        [-120, 30],
      ],
      which === 0 ? v('koi-white') : v('funa'),
    )}${ellipse(20, -8, 30, 12, v('koi-orange'))}</g>`
  }
  const layer = makeSvgLayer(id, opts, `<g class="school">${fish}</g>`)
  const svg = layer.el.querySelector('svg')
  layer.update = (state) => {
    if (svg) attrWrite(svg, 'opacity', state.water.fishReveal[which].toFixed(3))
  }
  return layer
}

export function buildWaterLayers(quality: Quality): Layer[] {
  const low = quality.tier === 'low'
  const layers: (Layer | null)[] = [
    ceilingLayer(),
    raysLayer(),
    stemsLayer('uw-stems-far', WATER.stemsFar, false),
    low ? null : fishLayer('fish-back', WATER.fishBack, 1, 95),
    mudLayer(),
    fishLayer('fish-mid', WATER.fishMid, 0, 96),
    fishLayer('fish-near', WATER.fishNear, 0, 97),
    stemsLayer('uw-stems-near', WATER.stemsNear, true),
  ]
  return layers.filter((l): l is Layer => l !== null)
}
