import type { Quality } from './quality'

type Tier = Quality['tier']

/**
 * CC0 PBR sets under public/assets/tex/<tier>/<name>/{color,normal,orm}.webp, built from
 * assets-src/ by `pnpm assets` (see ATTRIBUTION.md). `orm` packs ambient occlusion in red and
 * roughness in green. The `low` tier ships every map at half the edge length.
 */
export const TEX_SETS = [
  'thatch',
  'planks',
  'plaster',
  'gravel',
  'moss',
  'stone',
  'bark',
  'mud',
  'tatami',
] as const
export type TexSet = (typeof TEX_SETS)[number]

/** Each map's flat stand-in colour: mid grey, a straight normal, full occlusion and roughness. */
export const TEX_MAPS = { color: '#8f8f8f', normal: '#8080ff', orm: '#ffff00' } as const
export type TexMap = keyof typeof TEX_MAPS

/**
 * Sets the opening view never shows (the room's mats; the dikes, earth floor and pond bed).
 * They load after the curtain lifts and render as their flat stand-in until then.
 */
export const DEFERRED_SETS: ReadonlySet<TexSet> = new Set<TexSet>(['tatami', 'mud'])

export const textureUrl = (tier: Tier, set: TexSet, map: TexMap): string =>
  `/assets/tex/${tier}/${set}/${map}.webp`

/** The overcast sky only lights and reflects (the background is fog); `low` takes it at 256 px. */
export const hdriUrl = (tier: Tier): string =>
  `/assets/hdri/kloofendal_overcast_${tier === 'low' ? '256' : '1k'}.hdr`

/** The textures the curtain waits for, so the entry can request them before three.js arrives. */
export function curtainTextureUrls(tier: Tier): string[] {
  const maps = Object.keys(TEX_MAPS) as TexMap[]
  return TEX_SETS.filter((set) => !DEFERRED_SETS.has(set)).flatMap((set) =>
    maps.map((map) => textureUrl(tier, set, map)),
  )
}
