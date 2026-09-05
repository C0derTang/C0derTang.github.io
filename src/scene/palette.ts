/** Hex mirrors of tokens.css for canvas drawing (canvas cannot read CSS custom properties). */
export const PALETTE = {
  rainStreak: '#dfe6ea',
  rainWarm: '#e8e2d2',
  ripple: '#e6eef0',
  bubbleRim: '#cfe8dd',
  splash: '#e6eef0',
  uwDeep: '#1c3f4e',
} as const

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`
}
