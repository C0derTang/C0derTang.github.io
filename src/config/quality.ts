export interface Quality {
  tier: 'high' | 'low'
  dprCap: number
  particleMul: number
  reducedMotion: boolean
  /** Split layers into nested viewports at different depths (off on the low tier). */
  microParallax: boolean
  /** Multiplier for ink detail marks (hatching, needles, weave) and rice clumps. */
  detail: number
}

/** `?tier=high|low` overrides detection (bench and screenshots on any machine). */
export function detectQuality(params?: URLSearchParams): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const small = matchMedia('(max-width: 640px)').matches
  const lowMem = (nav.deviceMemory ?? 8) < 4
  const fewCores = (navigator.hardwareConcurrency || 8) <= 4
  const forced = params?.get('tier')
  const low = forced === 'low' ? true : forced === 'high' ? false : small || lowMem || fewCores
  return {
    tier: low ? 'low' : 'high',
    dprCap: low ? 1.5 : 2,
    particleMul: low ? 0.35 : 1,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    microParallax: !low,
    detail: low ? 0.5 : 1,
  }
}
