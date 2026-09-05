export interface Quality {
  tier: 'high' | 'low'
  dprCap: number
  particleMul: number
  reducedMotion: boolean
}

export function detectQuality(): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const small = matchMedia('(max-width: 640px)').matches
  const lowMem = (nav.deviceMemory ?? 8) < 4
  const fewCores = (navigator.hardwareConcurrency || 8) <= 4
  const low = small || lowMem || fewCores
  return {
    tier: low ? 'low' : 'high',
    dprCap: low ? 1.5 : 2,
    particleMul: low ? 0.35 : 1,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }
}
