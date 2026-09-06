import { DESIGN } from '../config/beats'
import type { Layer, LayerOpts, Part } from './types'

export const VIEWBOX = `0 0 ${DESIGN.w} ${DESIGN.h}`

/** Markup for one part of a layer. Parts paint in array order (far -> near). */
export interface PartMarkup {
  part: string
  inner: string
}

/**
 * One nested viewport. The stage rewrites its viewBox every frame to the visible design-space
 * window for the part's depth; the aspect always matches the stage, so `none` is exact.
 */
const partDoc = (id: string, inner: string): string =>
  `<svg data-part="${id}" x="0" y="0" width="100%" height="100%" viewBox="${VIEWBOX}" preserveAspectRatio="none" overflow="visible">${inner}</svg>`

/** Outer document in stage px (no viewBox) holding the nested part viewports. */
export const svgDoc = (parts: readonly PartMarkup[]): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">${parts
    .map((p) => partDoc(p.part, p.inner))
    .join('')}</svg>`

export function makeSvgLayer(
  id: string,
  opts: LayerOpts,
  inner: string | readonly PartMarkup[],
  hooks: Pick<Layer, 'update' | 'resize' | 'mount'> = {},
): Layer {
  const el = document.createElement('div')
  el.className = 'layer'
  el.dataset.layer = id
  if (opts.live) el.dataset.live = '1'
  const list: readonly PartMarkup[] = typeof inner === 'string' ? [{ part: 'main', inner }] : inner
  // Low tier: one viewport (one write per frame), paint order preserved.
  const merged =
    list.length > 1 && opts.microParallax === false
      ? [{ part: 'main', inner: list.map((p) => p.inner).join('') }]
      : list
  el.innerHTML = svgDoc(merged)
  const restCz = opts.restCz ?? 0
  const parts: Part[] = []
  for (const svg of el.querySelectorAll<SVGSVGElement>('svg[data-part]')) {
    const pid = svg.dataset.part ?? 'main'
    const po = opts.parts?.[pid]
    parts.push({
      id: pid,
      svg,
      depth: po?.depth ?? opts.depth,
      restCz: po?.restCz ?? restCz,
      range: po?.range,
    })
  }
  assertParts(id, opts, parts)
  return {
    id,
    el,
    depth: opts.depth,
    restCz,
    fade: opts.fade,
    range: opts.range,
    live: opts.live ?? false,
    portal: opts.portal ?? false,
    parts,
    ...hooks,
  }
}

/**
 * A part nearer than the layer must not reach the near clip (zr .88) while the layer still has
 * opacity: nearest part depth >= depth + 1000 * fade[1] - 880. Dev-only warning.
 */
function assertParts(id: string, opts: LayerOpts, parts: readonly Part[]): void {
  if (!import.meta.env.DEV || !opts.fade) return
  const min = opts.depth + 1000 * opts.fade[1] - 880
  for (const p of parts) {
    if (p.depth < min)
      console.warn(
        `[layer ${id}] part "${p.id}" depth ${p.depth} < ${min}: it will hide before the layer fades`,
      )
  }
}
