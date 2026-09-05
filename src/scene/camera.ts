import { CAM_X_KEYS, CAM_Y_KEYS, CAM_Z_KEYS } from '../config/beats'
import { monotoneCubic, smoothstep } from '../util/math'
import type { Cam, Projection, Pt, Rect, StageSize } from './types'

/** Focal length in design px. */
export const P = 1000
/** Planes closer to the eye than this pass-through ratio are hidden. */
export const NEAR_CLIP = 0.88

export const HIDDEN: Projection = { s: 1, tx: 0, ty: 0, opacity: 0, hidden: true, zr: 0, k: 1 }

interface Projectable {
  depth: number
  restCz: number
  fade?: readonly [number, number]
}

/**
 * Project a parallel plane at `depth` for camera `cam`.
 * s = 1 when cam.cz === restCz, grows to infinity as the plane reaches the eye.
 */
export function project(L: Projectable, cam: Cam, unit: number): Projection {
  const dist = P + L.depth - cam.cz
  const zr = (cam.cz - L.depth) / P
  if (dist <= P * (1 - NEAR_CLIP)) return { ...HIDDEN, zr }
  const k = P / dist
  return {
    s: (P + L.depth - L.restCz) / dist,
    tx: -cam.cx * k * unit,
    ty: -cam.cy * k * unit,
    opacity: L.fade ? 1 - smoothstep(L.fade[0], L.fade[1], zr) : 1,
    hidden: false,
    zr,
    k,
  }
}

const czOf = monotoneCubic(CAM_Z_KEYS)
const cyOf = monotoneCubic(CAM_Y_KEYS)
const cxOf = monotoneCubic(CAM_X_KEYS)

export const camera = (t: number): Cam => ({ cz: czOf(t), cx: cxOf(t), cy: cyOf(t) })

/** Design px -> stage px (before the layer transform). */
export const designToStage = (pt: Pt, size: StageSize): Pt => ({
  x: size.ox + pt.x * size.unit,
  y: size.oy + pt.y * size.unit,
})

/** Stage px -> screen px through a layer projection (scale about VP, then translate). */
export const stageToScreen = (pt: Pt, p: Projection, size: StageSize): Pt => ({
  x: size.vx + (pt.x - size.vx) * p.s + p.tx,
  y: size.vy + (pt.y - size.vy) * p.s + p.ty,
})

export const designToScreen = (pt: Pt, p: Projection, size: StageSize): Pt =>
  stageToScreen(designToStage(pt, size), p, size)

export function designRectToScreen(r: Rect, p: Projection, size: StageSize): Rect {
  const a = designToScreen({ x: r.x, y: r.y }, p, size)
  const b = designToScreen({ x: r.x + r.w, y: r.y + r.h }, p, size)
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }
}
