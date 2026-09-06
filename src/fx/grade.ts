import { lerp, lerpColor } from '../util/math'
import { mustGet, styleWrite } from '../util/dom'
import type { GradeVars } from '../scene/types'

interface Key {
  t: number
  g: Omit<GradeVars, 'glowX' | 'glowY'>
}

const k = (
  t: number,
  tint: string,
  strength: number,
  glowColor: string,
  glow: number,
  vignette: number,
  fogColor: string,
  fogFar: number,
  fogMid: number,
  fogNear: number,
  grain: number,
  paperCool: string,
): Key => ({
  t,
  g: {
    tint,
    strength,
    glowColor,
    glow,
    vignette,
    fogColor,
    fogFar,
    fogMid,
    fogNear,
    grain,
    paperCool,
  },
})

/** Lighting story keyframes over t. Positions are matched to the beats table. */
export const GRADE_KEYS: readonly Key[] = [
  k(0.0, '#6f8090', 0.18, '#f2b45a', 0.0, 0.12, '#dfe5e4', 0.55, 0.3, 0.08, 0.14, '#d9d5c8'),
  k(0.26, '#6f8090', 0.18, '#f2b45a', 0.0, 0.12, '#dfe5e4', 0.55, 0.3, 0.08, 0.14, '#d9d5c8'),
  k(0.3, '#5a4a3c', 0.28, '#f2b45a', 0.25, 0.28, '#dfe5e4', 0.35, 0.15, 0.0, 0.14, '#d9d5c8'),
  k(0.34, '#6a4a30', 0.25, '#f2b45a', 0.5, 0.32, '#3a2a22', 0.2, 0.05, 0.0, 0.14, '#d9d5c8'),
  k(0.5, '#6a4a30', 0.25, '#f2b45a', 0.5, 0.32, '#3a2a22', 0.2, 0.05, 0.0, 0.14, '#d9d5c8'),
  k(0.58, '#7f9a8c', 0.2, '#e8eef0', 0.3, 0.2, '#dfe5e4', 0.5, 0.3, 0.08, 0.14, '#e7ebe0'),
  k(0.68, '#7f958c', 0.18, '#e8eef0', 0.0, 0.12, '#dfe5e4', 0.6, 0.35, 0.1, 0.14, '#e7ebe0'),
  k(0.82, '#2f6b6a', 0.45, '#cfe8dd', 0.2, 0.3, '#2f6b6a', 0.55, 0.3, 0.1, 0.14, '#e7ebe0'),
  k(0.92, '#1e4f5a', 0.4, '#cfe8dd', 0.35, 0.4, '#2f6b6a', 0.55, 0.3, 0.1, 0.14, '#e7ebe0'),
  k(1.0, '#1e4f5a', 0.4, '#cfe8dd', 0.35, 0.4, '#2f6b6a', 0.55, 0.3, 0.1, 0.14, '#e7ebe0'),
]

export function gradeAt(t: number): GradeVars {
  let a = GRADE_KEYS[0]
  let b = GRADE_KEYS[GRADE_KEYS.length - 1]
  if (!a || !b) throw new Error('grade keys empty')
  for (let i = 0; i < GRADE_KEYS.length - 1; i++) {
    const p = GRADE_KEYS[i]
    const q = GRADE_KEYS[i + 1]
    if (p && q && t >= p.t && t <= q.t) {
      a = p
      b = q
      break
    }
  }
  const span = b.t - a.t
  const u = span > 0 ? (t - a.t) / span : 0
  return {
    tint: lerpColor(a.g.tint, b.g.tint, u),
    strength: lerp(a.g.strength, b.g.strength, u),
    glowColor: lerpColor(a.g.glowColor, b.g.glowColor, u),
    glowX: 0.5,
    glowY: 0.5,
    glow: lerp(a.g.glow, b.g.glow, u),
    vignette: lerp(a.g.vignette, b.g.vignette, u),
    fogColor: lerpColor(a.g.fogColor, b.g.fogColor, u),
    fogFar: lerp(a.g.fogFar, b.g.fogFar, u),
    fogMid: lerp(a.g.fogMid, b.g.fogMid, u),
    fogNear: lerp(a.g.fogNear, b.g.fogNear, u),
    grain: lerp(a.g.grain, b.g.grain, u),
    paperCool: lerpColor(a.g.paperCool, b.g.paperCool, u),
  }
}

/** Writes the fixed grade elements directly (never per-frame :root custom properties). */
export function createGradeStack() {
  const glow = mustGet('#glow')
  const grade = mustGet('#grade')
  const vignette = mustGet('#vignette')
  const grain = mustGet('#grain')
  return {
    apply(g: GradeVars) {
      styleWrite(grade, 'background-color', g.tint)
      styleWrite(grade, 'opacity', g.strength.toFixed(3))
      styleWrite(
        glow,
        'background',
        `radial-gradient(circle at ${(g.glowX * 100).toFixed(1)}% ${(g.glowY * 100).toFixed(1)}%, ${g.glowColor} 0%, transparent 55%)`,
      )
      styleWrite(glow, 'opacity', g.glow.toFixed(3))
      styleWrite(vignette, 'opacity', g.vignette.toFixed(3))
      styleWrite(grain, 'opacity', g.grain.toFixed(3))
    },
  }
}

/**
 * The paper surface on the fixed grain element: the procedural paper tile (data URL) when the
 * textures produced one, else a 256 px noise tile. Rasterized once, tiled by the compositor.
 */
export function installGrainTile(paperUrl?: string): void {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">` +
    `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/>` +
    `<feColorMatrix type="saturate" values="0"/></filter>` +
    `<rect width="256" height="256" filter="url(#n)"/></svg>`
  document.documentElement.style.setProperty(
    '--grain-tile',
    paperUrl ? `url("${paperUrl}")` : `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
  )
  document.documentElement.style.setProperty('--grain-size', paperUrl ? '512px' : '256px')
}
