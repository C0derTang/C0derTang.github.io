export interface Quality {
  tier: 'high' | 'low'
  /** software WebGL (SwiftShader in headless browsers and CI): everything at its minimum */
  software: boolean
  /** device pixel ratio cap for the WebGL canvas */
  dpr: number
  dof: boolean
  /** water transmission (refraction pass) */
  refraction: boolean
  shadowSize: number
  rainCount: number
  riceCount: number
  reducedMotion: boolean
}

/** True when WebGL runs on a software rasterizer (SwiftShader, llvmpipe), as in headless test runs. */
function isSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return true
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return /swiftshader|llvmpipe|software/i.test(name)
  } catch {
    return false
  }
}

/**
 * Desktop is the target. Small or touch viewports get a `low` tier that still runs (DPR 1, no
 * depth of field, no refraction, fewer instances) but is not tuned; a software rasterizer gets
 * the minimum of everything so headless test runs stay fast. `?tier=high|low`, `?dpr=<n>` and
 * `?post=off` override detection for benches and screenshots.
 */
export function detectQuality(params?: URLSearchParams): Quality {
  const forced = params?.get('tier')
  const small = matchMedia('(max-width: 900px)').matches || matchMedia('(pointer: coarse)').matches
  const software = isSoftwareGl()
  const low = forced === 'low' ? true : forced === 'high' ? false : small || software
  const dprParam = Number(params?.get('dpr') ?? 0)
  const postOff = params?.get('post') === 'off' || software
  return {
    tier: low ? 'low' : 'high',
    software,
    dpr: dprParam > 0 ? dprParam : software ? 0.5 : low ? 1 : 1.5,
    dof: !low && !postOff,
    refraction: !low,
    shadowSize: software ? 512 : low ? 1024 : 1536,
    rainCount: software ? 400 : low ? 1500 : 6000,
    riceCount: software ? 1000 : low ? 4000 : 20000,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }
}
