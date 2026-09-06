import { AIR } from '../../config/layers'
import { INK, brush, hatch, inkCedar, inkFoliage, inkStyle, v } from '../draw'
import type { P2 } from '../draw'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'

/**
 * Foreground cedars framing the left side and a bough crossing the roof, on three depths in
 * front of the screen plane so the trees slide against each other as the camera pushes in. Ink
 * and wash: black tapered strokes (`inkStyle` at this depth is weight 6, full black) over green
 * washes, no filled silhouettes.
 */
export function treesForeLayer(): Layer {
  const ink = inkStyle(AIR.treesFore.depth)
  const cedarOpts = { ink, detail: INK.detail, tiers: 7 } as const

  // On-curve samples of the bough's sweep from the upper-left bleed down across the roofline,
  // plus a tip point past the last needle cluster where the stroke tapers to nothing.
  const bough: readonly P2[] = [
    [190, 50],
    [327, 109],
    [465, 165],
    [611, 229],
    [760, 300],
    [823, 331],
  ]
  /** A short sprig of needle hatches fanned out from the point at t (0..1) along `bough`. */
  const sprigAt = (t: number, spread: number, n: number, seed: number): string => {
    const u = t * (bough.length - 1)
    const i = Math.min(bough.length - 2, Math.floor(u))
    const a = bough[i] ?? [0, 0]
    const b = bough[i + 1] ?? a
    const k = u - i
    const x = a[0] + (b[0] - a[0]) * k
    const y = a[1] + (b[1] - a[1]) * k
    const base = Math.atan2(b[1] - a[1], b[0] - a[0])
    let out = ''
    for (let j = 0; j < n; j++) {
      const angle = base + Math.PI / 2 + (j / Math.max(1, n - 1) - 0.5) * 1.4
      const len = spread * (0.7 + 0.3 * Math.sin(seed + j * 1.7))
      out += hatch(x, y, len, angle, ink.w * 0.5, ink.color, 0.7 * ink.opacity)
    }
    return out
  }
  let needles = ''
  const nodes = [0.1, 0.3, 0.48, 0.66, 0.84, 0.97]
  for (let i = 0; i < nodes.length; i++) {
    needles += sprigAt(nodes[i] ?? 0, 24, Math.round(4 * INK.detail), i * 3 + 1)
  }

  return makeSvgLayer('trees-fore', AIR.treesFore, [
    {
      part: 'mid',
      inner: `${inkCedar(430, 1160, 1.25, 13, cedarOpts)}${inkCedar(1650, 1200, 1.6, 14, cedarOpts)}`,
    },
    {
      part: 'near',
      inner: `${inkCedar(120, 1180, 1.7, 11, cedarOpts)}${inkCedar(-60, 1200, 1.9, 12, cedarOpts)}`,
    },
    {
      part: 'bough',
      inner:
        brush(bough, {
          w: 12,
          seed: 19,
          wobble: 3,
          color: ink.color,
          opacity: ink.opacity,
          taper: [0.55, 0.02],
          peak: 0.22,
        }) +
        inkFoliage(340, 120, 190, 15, { ink, detail: INK.detail, wash: v('cedar-wash') }) +
        inkFoliage(520, 195, 155, 16, { ink, detail: INK.detail, wash: v('cedar-wash-2') }) +
        inkFoliage(715, 285, 115, 17, { ink, detail: INK.detail, wash: v('cedar-wash') }) +
        needles,
    },
  ])
}
