/** Shared standing-water footprint for the yard mesh and its rain impacts. */
export const PUDDLE_Y = 0.016
export const PUDDLE_SEGMENTS = 48
export const PUDDLES = [
  { x: 0.4, z: 8, radius: 0.9 },
  { x: -0.6, z: 14, radius: 1.2 },
  { x: 0.2, z: 19, radius: 0.7 },
] as const

interface Point {
  x: number
  z: number
}

/** The exact polygon rendered by the circle fan, in world metres. */
export const PUDDLE_OUTLINES: readonly (readonly Point[])[] = PUDDLES.map((puddle, phase) =>
  Array.from({ length: PUDDLE_SEGMENTS }, (_, i) => {
    const angle = (i / PUDDLE_SEGMENTS) * Math.PI * 2
    const edge = 1 + 0.12 * Math.sin(angle * 3 + phase) + 0.06 * Math.sin(angle * 7 - phase)
    return {
      x: puddle.x + Math.cos(angle) * puddle.radius * edge,
      z: puddle.z - Math.sin(angle) * puddle.radius * edge * 0.72,
    }
  }),
)

/** An inset keeps the whole expanding ring inside the polygon, including concave edges. */
export function insidePuddle(index: number, x: number, z: number, inset = 0): boolean {
  const outline = PUDDLE_OUTLINES[index]
  if (!outline) return false
  let inside = false
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    if (!a || !b) continue
    const crossesRow = a.z > z !== b.z > z
    if (crossesRow && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside
    if (inset > 0) {
      const dx = b.x - a.x
      const dz = b.z - a.z
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)))
      if ((x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2 < inset * inset) return false
    }
  }
  return inside
}
