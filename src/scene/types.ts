import type { BeatId, SlotId } from '../config/beats'

export interface StageSize {
  w: number
  h: number
  /** design px -> css px */
  unit: number
  /** offset of the design canvas inside the stage (slice centering) */
  ox: number
  oy: number
  /** vanishing point in stage px */
  vx: number
  vy: number
  dpr: number
}

export interface Cam {
  cz: number
  cx: number
  cy: number
}

export interface Projection {
  s: number
  tx: number
  ty: number
  opacity: number
  hidden: boolean
  zr: number
  /** projection factor P / dist */
  k: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export interface Pt {
  x: number
  y: number
}

export interface LayerOpts {
  depth: number
  restCz?: number
  fade?: readonly [number, number]
  range?: readonly [number, number]
  raster?: 'locked' | 'dynamic'
  /** Member of the clip group that is masked to the doorway while the front wall is visible. */
  portal?: boolean
}

export interface Layer {
  id: string
  el: HTMLElement
  depth: number
  restCz: number
  fade?: readonly [number, number]
  range?: readonly [number, number]
  raster: 'locked' | 'dynamic'
  portal: boolean
  /** Per-frame hook, only called while the layer is visible. Writes only. */
  update?(state: SceneState, p: Projection): void
  resize?(size: StageSize): void
}

export interface GradeVars {
  tint: string
  strength: number
  glowColor: string
  /** glow center in 0..1 viewport fractions */
  glowX: number
  glowY: number
  glow: number
  vignette: number
  fogColor: string
  fogFar: number
  fogMid: number
  fogNear: number
  grain: number
  paperCool: string
}

export interface RainState {
  alpha: number
  /** screen-space rects the rain is confined to (null = whole viewport) */
  clip: Rect[] | null
  /** screen y where near drops splash (null = no splashes) */
  groundY: number | null
}

export interface RippleState {
  strength: number
  horizonY: number
  /** screen-space water polygon (null = none) */
  polygon: Pt[] | null
  clip: Rect[] | null
}

export interface SceneState {
  /** Screen rect the interior/paddy group is clipped to (doorway) while the front wall shows. */
  portal: Rect | null
  t: number
  time: number
  dt: number
  beat: BeatId
  u: Record<BeatId, number>
  cam: Cam
  waterCam: Cam
  doors: number
  rain: RainState
  ripples: RippleState
  wl: number
  sinkTy: number
  air: { visible: boolean }
  water: { visible: boolean; grade: number; rays: number; fishReveal: readonly [number, number] }
  grade: GradeVars
  slots: Record<SlotId, number>
  hint: number
  reduced: boolean
}
