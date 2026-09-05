import { DESIGN } from '../config/beats'
import type { Layer, LayerOpts } from './types'

export const VIEWBOX = `0 0 ${DESIGN.w} ${DESIGN.h}`

/**
 * Wrap SVG markup in a canvas document. The stage rewrites the viewBox every frame to the
 * visible design-space window, so the aspect always matches the stage and `none` is exact.
 */
export const svgDoc = (inner: string, extra = ''): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}" preserveAspectRatio="none" ${extra}>${inner}</svg>`

export function makeSvgLayer(
  id: string,
  opts: LayerOpts,
  inner: string,
  hooks: Pick<Layer, 'update' | 'resize' | 'mount'> = {},
): Layer {
  const el = document.createElement('div')
  el.className = 'layer'
  el.dataset.layer = id
  if (opts.live) el.dataset.live = '1'
  el.innerHTML = svgDoc(inner)
  return {
    id,
    el,
    depth: opts.depth,
    restCz: opts.restCz ?? 0,
    fade: opts.fade,
    range: opts.range,
    live: opts.live ?? false,
    portal: opts.portal ?? false,
    ...hooks,
  }
}
