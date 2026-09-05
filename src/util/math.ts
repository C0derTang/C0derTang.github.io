export const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x)
export const clamp01 = (x: number): number => clamp(x, 0, 1)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Hermite smoothstep between edges a and b (a === b degenerates to a step). */
export const smoothstep = (a: number, b: number, x: number): number => {
  if (a === b) return x < a ? 0 : 1
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3
export const easeInCubic = (t: number): number => t * t * t

/** Triangle pulse: 1 at `center`, 0 at |x - center| >= halfWidth. */
export const tri = (x: number, center: number, halfWidth: number): number =>
  Math.max(0, 1 - Math.abs(x - center) / halfWidth)

/** Safe indexed read for numeric arrays under noUncheckedIndexedAccess. */
export const at = (a: ArrayLike<number>, i: number): number => a[i] ?? 0

export type Key = readonly [number, number]

/**
 * Fritsch–Carlson monotone cubic interpolation through (x, y) keys.
 * Flat key pairs are exact holds, tangents are continuous, no overshoot.
 * Outside the key range the end values are held.
 */
export function monotoneCubic(keys: readonly Key[]): (x: number) => number {
  const n = keys.length
  if (n === 0) throw new Error('monotoneCubic needs at least one key')
  const xs = Float64Array.from(keys, (k) => k[0])
  const ys = Float64Array.from(keys, (k) => k[1])
  if (n === 1) return () => at(ys, 0)

  const d = new Float64Array(n - 1)
  for (let i = 0; i < n - 1; i++) d[i] = (at(ys, i + 1) - at(ys, i)) / (at(xs, i + 1) - at(xs, i))

  const m = new Float64Array(n)
  m[0] = at(d, 0)
  m[n - 1] = at(d, n - 2)
  for (let i = 1; i < n - 1; i++) {
    const a = at(d, i - 1)
    const b = at(d, i)
    m[i] = a * b <= 0 ? 0 : (a + b) / 2
  }
  for (let i = 0; i < n - 1; i++) {
    const di = at(d, i)
    if (di === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = at(m, i) / di
    const b = at(m, i + 1) / di
    const s = a * a + b * b
    if (s > 9) {
      const tau = 3 / Math.sqrt(s)
      m[i] = tau * a * di
      m[i + 1] = tau * b * di
    }
  }

  return (x: number): number => {
    if (x <= at(xs, 0)) return at(ys, 0)
    if (x >= at(xs, n - 1)) return at(ys, n - 1)
    let lo = 0
    let hi = n - 2
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (at(xs, mid) <= x) lo = mid
      else hi = mid - 1
    }
    const h = at(xs, lo + 1) - at(xs, lo)
    const t = (x - at(xs, lo)) / h
    const t2 = t * t
    const t3 = t2 * t
    const h00 = 2 * t3 - 3 * t2 + 1
    const h10 = t3 - 2 * t2 + t
    const h01 = -2 * t3 + 3 * t2
    const h11 = t3 - t2
    return h00 * at(ys, lo) + h10 * h * at(m, lo) + h01 * at(ys, lo + 1) + h11 * h * at(m, lo + 1)
  }
}

/** Deterministic 32-bit PRNG (mulberry32). Returns numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Parse #rgb / #rrggbb to [r, g, b] in 0..255. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (x: number) =>
    Math.round(clamp(x, 0, 255))
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

export function lerpColor(a: string, b: string, t: number): string {
  if (t <= 0) return a
  if (t >= 1) return b
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return rgbToHex(lerp(r1, r2, t), lerp(g1, g2, t), lerp(b1, b2, t))
}
