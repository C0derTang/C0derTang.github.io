import { HIDDEN, designToScreen, project } from './camera'
import type { Cam, Layer, Projection, Pt, Rect, SceneState, StageSize } from './types'

export interface Stage {
  readonly layers: readonly Layer[]
  render(state: SceneState, cam: Cam): void
  /** Clip the portal group (layers flagged `portal`) to a screen-space rect, or release it. */
  setPortalClip(rect: Rect | null): void
  projection(id: string): Projection | undefined
  toScreen(id: string, pt: Pt): Pt | null
  resize(size: StageSize): void
  /** Force every cached write to be re-emitted next frame. */
  invalidate(): void
  liveCount(): number
}

interface WriteCache {
  vis: string
  vb: string
  op: string
}

export function createStage(world: HTMLElement, layers: Layer[], size: StageSize): Stage {
  // Layers flagged `portal` are wrapped in one clip group (e.g. everything seen through the doorway).
  const frag = document.createDocumentFragment()
  let portal: HTMLElement | null = null
  for (const L of layers) {
    if (L.portal) {
      if (!portal) {
        portal = document.createElement('div')
        portal.className = 'portal'
        frag.append(portal)
      }
      portal.append(L.el)
    } else {
      frag.append(L.el)
    }
  }
  world.append(frag)
  for (const L of layers) L.mount?.()
  let lastClip = ''

  const cache = new Map<string, WriteCache>()
  const projections = new Map<string, Projection>()
  let live = 0

  const cacheFor = (id: string): WriteCache => {
    let c = cache.get(id)
    if (!c) {
      c = { vis: '', vb: '', op: '' }
      cache.set(id, c)
    }
    return c
  }
  const svgOf = new Map<string, SVGSVGElement>()
  for (const L of layers) {
    const svg = L.el.querySelector('svg')
    if (svg) svgOf.set(L.id, svg)
  }

  return {
    layers,
    render(state, cam) {
      live = 0
      for (const L of layers) {
        const r = L.range
        const inRange = !r || (state.t >= r[0] && state.t <= r[1])
        const p = inRange ? project(L, cam, size.unit) : HIDDEN
        projections.set(L.id, p)
        const vis = inRange && !p.hidden && p.opacity > 0.001
        const c = cacheFor(L.id)
        const visStr = vis ? 'visible' : 'hidden'
        if (c.vis !== visStr) {
          c.vis = visStr
          L.el.style.visibility = visStr
        }
        if (!vis) continue
        live++
        // The projection is applied as an SVG viewBox window instead of a CSS transform: the
        // raster stays viewport-sized whatever the scale (a scaled composited plane made Chrome
        // rasterize bleed x scale^2 pixels per layer and run out of GPU tile memory), and the
        // vectors stay crisp. Screen = vx + (stage - vx) * s + tx, inverted for the stage box.
        const k = 1 / (p.s * size.unit)
        const x0 = ((-p.tx - size.vx) / p.s + size.vx - size.ox) / size.unit
        const y0 = ((-p.ty - size.vy) / p.s + size.vy - size.oy) / size.unit
        const vb = `${x0.toFixed(2)} ${y0.toFixed(2)} ${(size.w * k).toFixed(2)} ${(size.h * k).toFixed(2)}`
        if (c.vb !== vb) {
          c.vb = vb
          svgOf.get(L.id)?.setAttribute('viewBox', vb)
        }
        const op = p.opacity.toFixed(3)
        if (c.op !== op) {
          c.op = op
          L.el.style.opacity = op
        }
        L.update?.(state, p)
      }
    },
    setPortalClip(rect) {
      if (!portal) return
      const clip = rect
        ? `inset(${rect.y.toFixed(1)}px ${(size.w - rect.x - rect.w).toFixed(1)}px ${(size.h - rect.y - rect.h).toFixed(1)}px ${rect.x.toFixed(1)}px)`
        : 'none'
      if (clip !== lastClip) {
        lastClip = clip
        portal.style.clipPath = clip
      }
    },
    projection: (id) => projections.get(id),
    toScreen(id, pt) {
      const p = projections.get(id)
      if (!p || p.hidden) return null
      return designToScreen(pt, p, size)
    },
    resize(s) {
      for (const L of layers) L.resize?.(s)
      cache.clear()
      lastClip = ''
    },
    invalidate() {
      cache.clear()
      lastClip = ''
    },
    liveCount: () => live,
  }
}
