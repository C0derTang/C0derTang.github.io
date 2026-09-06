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
  const zr = (cam.cz - L.depth) / P
  if (P + L.depth - cam.cz <= P * (1 - NEAR_CLIP)) return { ...HIDDEN, zr }
  // Lens breathing changes the focal length for scale and parallax only; zr and the near clip
  // keep the constant P so fade windows never move.
  const p = cam.p ?? P
  const dist = p + L.depth - cam.cz
  const k = p / dist
  return {
    s: (p + L.depth - L.restCz) / dist,
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

const bump = (t: number, c: number, w: number): number => Math.max(0, 1 - Math.abs(t - c) / w) ** 2

/**
 * Camera path plus, unless `still`, a handheld sway (pure in t: ±6 / ±4 design px, ~11 screen px on
 * the house plane and under 1 px on the mountains) and a lens-breathing pulse at the two
 * pass-throughs. Nothing here depends on wall-clock time, so frames stay reproducible.
 */
export const camera = (t: number, still = false): Cam => {
  const base = { cz: czOf(t), cx: cxOf(t), cy: cyOf(t) }
  if (still) return base
  return {
    cz: base.cz,
    cx: base.cx + 6 * Math.sin(t * Math.PI * 58 + 0.7),
    cy: base.cy + 4 * Math.sin(t * Math.PI * 34 + 1.3),
    p: P - 50 * (bump(t, 0.375, 0.035) + bump(t, 0.605, 0.03)),
  }
}

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
