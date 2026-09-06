import { linGrad, path, v } from './draw'

/**
 * The meniscus strip that sweeps up the screen during the dive. Lives in the fixed `.waterline`
 * element (translated by the director); the wave drifts on a CSS animation. Drawn as one ink
 * brush line tracing the crest, sitting over a paper-white wash where light pools on the water,
 * with a faint depth wash below so the strip reads as one surface with the water world beneath it.
 */
export function mountWaterline(root: HTMLElement): void {
  const width = 4400
  const lambda = 220
  const amp = 8
  let wiggle = ''
  for (let x = 0; x <= width; x += lambda)
    wiggle += ` q${lambda / 4} ${-amp * 2} ${lambda / 2} 0 t${lambda / 2} 0`
  const waveAt = (y0: number): string => `M0 ${y0}${wiggle}`
  const line = waveAt(60)
  root.innerHTML = `<svg class="waterline-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 160" width="${width}" height="160" preserveAspectRatio="none">
    <defs>
      ${linGrad('wl-depth', [
        [0, v('uw-wash'), 0.4],
        [1, v('uw-wash'), 0],
      ])}
    </defs>
    <g class="wl-drift">
      ${path(`${waveAt(60)} V150 H0 Z`, 'url(#wl-depth)')}
      ${path(`${waveAt(55)} V78 H0 Z`, v('cloud'), 'fill-opacity=".3"')}
      ${path(`${waveAt(59)} V69 H0 Z`, v('cloud'), 'fill-opacity=".55"')}
      ${path(line, 'none', `stroke="${v('ink')}" stroke-width="2" stroke-linecap="round"`)}
    </g>
  </svg>`
}
