import { linGrad, rect, ellipse } from './draw'

/**
 * The meniscus strip that sweeps up the screen during the dive. Lives in the fixed `.waterline`
 * element (translated by the director); the wave drifts on a CSS animation.
 */
export function mountWaterline(root: HTMLElement): void {
  const width = 4400
  const lambda = 220
  const amp = 8
  let wave = `M0 60`
  for (let x = 0; x <= width; x += lambda)
    wave += ` q${lambda / 4} ${-amp * 2} ${lambda / 2} 0 t${lambda / 2} 0`
  root.innerHTML = `<svg class="waterline-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 160" width="${width}" height="160" preserveAspectRatio="none">
    <defs>
      ${linGrad('wl-above', [
        [0, '#9aa8a6', 0],
        [1, '#7d918e', 0.85],
      ])}
      ${linGrad('wl-below', [
        [0, '#6fa39a', 0.6],
        [1, '#6fa39a', 0],
      ])}
      ${linGrad('wl-tir', [
        [0, '#e6f3ee', 0.55],
        [1, '#e6f3ee', 0],
      ])}
    </defs>
    <g class="wl-drift">
      ${rect(0, 0, width, 60, 'url(#wl-above)')}
      <path d="${wave} V150 H0 Z" fill="url(#wl-below)"/>
      <path d="${wave} V86 H0 Z" fill="url(#wl-tir)"/>
      <path d="${wave}" fill="none" stroke="#3f5d5a" stroke-width="2" opacity=".5" transform="translate(0 -3)"/>
      <path d="${wave}" fill="none" stroke="#c9dfd9" stroke-width="12" opacity=".25"/>
      <path d="${wave}" fill="none" stroke="#e6eef0" stroke-width="5" opacity=".8"/>
      ${ellipse(300, 84, 5, 3, '#e6f3ee', 'opacity=".6"')}${ellipse(1240, 96, 4, 2.5, '#e6f3ee', 'opacity=".6"')}${ellipse(2100, 80, 6, 3.5, '#e6f3ee', 'opacity=".6"')}${ellipse(3300, 92, 4, 2.5, '#e6f3ee', 'opacity=".6"')}${ellipse(760, 100, 3, 2, '#e6f3ee', 'opacity=".5"')}${ellipse(2700, 88, 4, 2.5, '#e6f3ee', 'opacity=".5"')}
    </g>
  </svg>`
}
