import { HIDDEN, designToScreen, project } from './camera'
import { TEX_MAX_SCALE } from './textures'
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
  /** Visible layers this frame. */
  liveCount(): number
  /** Visible part viewports this frame (viewBox writes per frame when scrolling). */
  partCount(): number
}

interface WriteCache {
  vis: string
  vb: string
  op: string
}
interface PartCache {
  vis: string
  vb: string
  tex: string
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
  const partCache = new Map<string, PartCache>()
  const projections = new Map<string, Projection>()
  let live = 0
  let parts = 0

  const cacheFor = (id: string): WriteCache => {
    let c = cache.get(id)
    if (!c) {
      c = { vis: '', vb: '', op: '' }
      cache.set(id, c)
    }
    return c
  }
  const partCacheFor = (key: string): PartCache => {
    let c = partCache.get(key)
    if (!c) {
      c = { vis: '', vb: '', tex: '' }
      partCache.set(key, c)
    }
    return c
  }
  const texGroups = new Map<string, Element[]>()
  for (const L of layers)
    for (const part of L.parts) {
      const groups = [...part.svg.querySelectorAll('.tex')]
      if (groups.length) texGroups.set(`${L.id}/${part.id}`, groups)
    }
  /** The visible design-space window for a projection: screen = vx + (stage - vx) * s + tx. */
  const windowOf = (p: Projection): string => {
    const k = 1 / (p.s * size.unit)
    const x0 = ((-p.tx - size.vx) / p.s + size.vx - size.ox) / size.unit
    const y0 = ((-p.ty - size.vy) / p.s + size.vy - size.oy) / size.unit
    return `${x0.toFixed(2)} ${y0.toFixed(2)} ${(size.w * k).toFixed(2)} ${(size.h * k).toFixed(2)}`
  }

  return {
    layers,
    render(state, cam) {
      live = 0
      parts = 0
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
        // The projection is applied as SVG viewBox windows instead of CSS transforms: the raster
        // stays viewport-sized whatever the scale (a scaled composited plane made Chrome rasterize
        // bleed x scale^2 pixels per layer and run out of GPU tile memory), and vectors stay
        // crisp. Each part is a nested viewport at its own depth (micro-parallax in one paint).
        for (const part of L.parts) {
          const pr = part.range
          const partIn = !pr || (state.t >= pr[0] && state.t <= pr[1])
          const same = part.depth === L.depth && part.restCz === L.restCz
          const pp = !partIn ? HIDDEN : same ? p : project(part, cam, size.unit)
          const key = `${L.id}/${part.id}`
          projections.set(key, pp)
          const pc = partCacheFor(key)
          // Never write visibility="visible": a descendant's explicit visible overrides the
          // layer's hidden state. Parts only ever set hidden or inherit.
          const pvis = partIn && !pp.hidden ? 'inherit' : 'hidden'
          if (pc.vis !== pvis) {
            pc.vis = pvis
            if (pvis === 'hidden') part.svg.setAttribute('visibility', 'hidden')
            else part.svg.removeAttribute('visibility')
          }
          if (pvis === 'hidden') continue
          parts++
          const vb = windowOf(pp)
          if (pc.vb !== vb) {
            pc.vb = vb
            part.svg.setAttribute('viewBox', vb)
          }
          const groups = texGroups.get(key)
          if (groups) {
            const tex = pp.s > TEX_MAX_SCALE ? 'hidden' : 'inherit'
            if (pc.tex !== tex) {
              pc.tex = tex
              for (const g of groups) {
                if (tex === 'hidden') g.setAttribute('visibility', 'hidden')
                else g.removeAttribute('visibility')
              }
            }
          }
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
      partCache.clear()
      lastClip = ''
    },
    invalidate() {
      cache.clear()
      partCache.clear()
      lastClip = ''
    },
    liveCount: () => live,
    partCount: () => parts,
  }
}
