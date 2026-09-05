import { DESIGN } from '../config/beats'
import type { Layer, LayerOpts } from './types'

export const VIEWBOX = `0 0 ${DESIGN.w} ${DESIGN.h}`

/** Wrap SVG markup in a full-canvas document (slice fit, overflow visible for bleed). */
export const svgDoc = (inner: string, extra = ''): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}" preserveAspectRatio="xMidYMid slice" ${extra}>${inner}</svg>`

export function makeSvgLayer(
  id: string,
  opts: LayerOpts,
  inner: string,
  hooks: Pick<Layer, 'update' | 'resize'> = {},
): Layer {
  const el = document.createElement('div')
  el.className = 'layer'
  el.dataset.layer = id
  el.dataset.raster = opts.raster ?? 'locked'
  el.innerHTML = svgDoc(inner)
  return {
    id,
    el,
    depth: opts.depth,
    restCz: opts.restCz ?? 0,
    fade: opts.fade,
    range: opts.range,
    raster: opts.raster ?? 'locked',
    portal: opts.portal ?? false,
    ...hooks,
  }
}
