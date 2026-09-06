/** Hex mirrors of tokens.css for canvas drawing (canvas cannot read CSS custom properties). */
export const PALETTE = {
  rainStreak: '#dfe6ea',
  rainWarm: '#e8e2d2',
  ripple: '#e6eef0',
  bubbleRim: '#cfe8dd',
  splash: '#e6eef0',
  uwDeep: '#1c3f4e',
  silt: '#c8d6c9',
  /* ink and wash */
  ink: '#1a1c1e',
  inkMid: '#3b4448',
  inkFar: '#6b767c',
  paper: '#e8ebe8',
  rainInk: '#3b4448',
} as const

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`
}
