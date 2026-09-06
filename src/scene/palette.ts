/** Hex mirrors of tokens.css for canvas drawing (canvas cannot read CSS custom properties). */
export const PALETTE = {
  /* ink and wash: ink weight by depth (near -> far) and the paper-white of a wash highlight */
  ink: '#1a1c1e',
  inkMid: '#3b4448',
  inkFar: '#6b767c',
  paper: '#e8ebe8',
  /** rain streak ink for the mid-depth band (the near/far bands draw with ink/inkFar directly) */
  rainInk: '#3b4448',
} as const

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`
}
