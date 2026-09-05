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
  tr: string
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
  let lastClip = ''

  const cache = new Map<string, WriteCache>()
  const projections = new Map<string, Projection>()
  let live = 0

  const cacheFor = (id: string): WriteCache => {
    let c = cache.get(id)
    if (!c) {
      c = { vis: '', tr: '', op: '' }
      cache.set(id, c)
    }
    return c
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
        // 2D transforms: 3D transforms on siblings made Chrome reorder composited layers.
        const tr = `translate(${p.tx.toFixed(2)}px, ${p.ty.toFixed(2)}px) scale(${p.s.toFixed(4)})`
        if (c.tr !== tr) {
          c.tr = tr
          L.el.style.transform = tr
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
