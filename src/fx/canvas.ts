import type { StageSize } from '../scene/types'

export interface Canvas2D {
  el: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  w: number
  h: number
  resize(size: StageSize): void
  clear(): void
}

/** A DPR-aware 2D canvas that draws in CSS px. */
export function createCanvas2D(el: HTMLCanvasElement): Canvas2D {
  const ctx = el.getContext('2d', { alpha: true })
  if (!ctx) throw new Error('2D canvas unavailable')
  const c: Canvas2D = {
    el,
    ctx,
    w: 1,
    h: 1,
    resize(size) {
      c.w = size.w
      c.h = size.h
      el.width = Math.round(size.w * size.dpr)
      el.height = Math.round(size.h * size.dpr)
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
    },
    clear() {
      ctx.clearRect(0, 0, c.w, c.h)
    },
  }
  return c
}

export function clipRects(
  ctx: CanvasRenderingContext2D,
  rects: readonly { x: number; y: number; w: number; h: number }[],
): void {
  ctx.beginPath()
  for (const r of rects) if (r.w > 0 && r.h > 0) ctx.rect(r.x, r.y, r.w, r.h)
  ctx.clip()
}
