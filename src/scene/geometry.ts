import type { P2 } from './draw'
import type { Rect } from './types'

/** Shared design-space geometry (1600x1200 canvas, VP (800,700)). Layers draw it; state reads it. */

/** Open engawa bay in the front wall — the portal the camera flies through. Centered on VP. */
export const DOORWAY: Rect = { x: 612, y: 590, w: 376, h: 220 }
export const HOUSE = {
  wallTop: 590,
  wallBottom: 810,
  eaveY: 600, // drip line
  gravelY: 857, // where near rain drops splash
  ridgeY: 350,
  left: 380,
  right: 1180,
  sideRight: 1250,
} as const

/** Pendant lamp in the interior room (interior coords, restCz 1000). */
export const LAMP = { x: 1080, y: 520 } as const

/** Back wall shoji: 4 panels of 210x400 starting at x 380 (y 400-800); inner two slide open. */
export const SHOJI = {
  panelW: 210,
  panelH: 400,
  x0: 380,
  y: 400,
  floorY: 800,
  opening: { x: 590, y: 400, w: 420, h: 400 },
  sideWindow: { x: 200, y: 440, w: 100, h: 80 },
} as const

/** Visible gap between the two sliding panels for a door progress 0..1. */
export function openingRect(doors: number): Rect {
  const half = (SHOJI.opening.w / 2) * doors
  return { x: 800 - half, y: SHOJI.opening.y, w: half * 2, h: SHOJI.opening.h }
}

export const PADDY = {
  horizonY: 700,
  water: [
    [-300, 700],
    [1900, 700],
    [1900, 1760],
    [-300, 1760],
  ] as readonly P2[],
} as const
