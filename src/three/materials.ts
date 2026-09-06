import {
  CanvasTexture,
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  type Texture,
} from 'three'
import { mulberry32 } from '../util/math'
import type { Quality } from '../config/quality'
import type { Loader } from './loader'

/** CC0 PBR sets under public/assets/tex/<name>/{color,normal,rough,ao}.jpg (see ATTRIBUTION.md). */
export type TexSet =
  'thatch' | 'planks' | 'plaster' | 'gravel' | 'moss' | 'stone' | 'mud' | 'bark' | 'tatami'

export interface PbrOpts {
  /** texture repeats per metre of UV (set the mesh UVs in metres) */
  repeat?: number
  roughness?: number
  color?: string
  metalness?: number
}

/**
 * One registry for every surface material so lighting, wetness and texture maps are tuned in
 * one place. `make()` builds a variant of a CC0 set (own repeat / tint / roughness) for meshes
 * whose UVs are laid out in metres; the named members are the defaults world modules share.
 * The water is a physical material with transmission and procedural normals.
 */
export interface Materials {
  make(set: TexSet, opts?: PbrOpts): MeshStandardMaterial
  ground: MeshStandardMaterial
  gravel: MeshStandardMaterial
  plaster: MeshStandardMaterial
  wood: MeshStandardMaterial
  woodDark: MeshStandardMaterial
  thatch: MeshStandardMaterial
  tatami: MeshStandardMaterial
  paper: MeshStandardMaterial
  stone: MeshStandardMaterial
  mud: MeshStandardMaterial
  needle: MeshStandardMaterial
  bark: MeshStandardMaterial
  rice: MeshStandardMaterial
  cloth: MeshStandardMaterial
  water: MeshPhysicalMaterial
  waterNormals: Texture
  /** the fir twig alpha card (CC0) for cedar tiers */
  needleAlpha: Texture
  /** per-frame uniform drive for the water normal scroll */
  update(time: number): void
}

const std = (color: string, roughness: number, metalness = 0): MeshStandardMaterial =>
  new MeshStandardMaterial({ color: new Color(color), roughness, metalness })

/**
 * Tileable water normal map generated at boot: a heightfield of layered sines plus value noise,
 * converted to a tangent-space normal map by finite differences (no CC0 water normals exist).
 */
export function makeWaterNormals(size = 512, seed = 7): CanvasTexture {
  const rnd = mulberry32(seed)
  const waves = Array.from({ length: 7 }, () => ({
    kx: Math.round((rnd() - 0.5) * 12),
    ky: Math.round((rnd() - 0.5) * 12),
    amp: 0.3 + rnd() * 0.7,
    phase: rnd() * Math.PI * 2,
  }))
  const h = (u: number, v: number): number => {
    let s = 0
    for (const w of waves) s += w.amp * Math.sin(2 * Math.PI * (w.kx * u + w.ky * v) + w.phase)
    return s
  }
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const tex = new CanvasTexture(canvas)
  if (!ctx) return tex
  const img = ctx.createImageData(size, size)
  const d = img.data
  const e = 1 / size
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      const dx = (h(u + e, v) - h(u - e, v)) / (2 * e)
      const dy = (h(u, v + e) - h(u, v - e)) / (2 * e)
      const k = 0.012
      let nx = -dx * k
      let ny = -dy * k
      let nz = 1
      const m = Math.hypot(nx, ny, nz)
      nx /= m
      ny /= m
      nz /= m
      const i = (y * size + x) * 4
      d[i] = Math.round((nx * 0.5 + 0.5) * 255)
      d[i + 1] = Math.round((ny * 0.5 + 0.5) * 255)
      d[i + 2] = Math.round((nz * 0.5 + 0.5) * 255)
      d[i + 3] = 255
    }
  ctx.putImageData(img, 0, 0)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.needsUpdate = true
  return tex
}

export function createMaterials(quality: Quality, loader: Loader): Materials {
  const waterNormals = makeWaterNormals()
  const make = (set: TexSet, opts: PbrOpts = {}): MeshStandardMaterial => {
    const repeat = opts.repeat ?? 1
    const base = `/assets/tex/${set}`
    const m = new MeshStandardMaterial({
      color: new Color(opts.color ?? '#ffffff'),
      roughness: opts.roughness ?? 1,
      metalness: opts.metalness ?? 0,
      map: loader.texture(`${base}/color.jpg`, { srgb: true, repeat }),
      normalMap: loader.texture(`${base}/normal.jpg`, { repeat }),
      roughnessMap: loader.texture(`${base}/rough.jpg`, { repeat }),
      aoMap: loader.texture(`${base}/ao.jpg`, { repeat }),
    })
    m.aoMapIntensity = 0.8
    return m
  }
  const needleAlpha = loader.texture('/assets/tex/needles_alpha.png')
  needleAlpha.flipY = false
  const water = new MeshPhysicalMaterial({
    color: new Color('#5f7a76'),
    roughness: 0.12,
    metalness: 0,
    transmission: quality.refraction ? 0.85 : 0,
    thickness: 0.4,
    ior: 1.33,
    attenuationColor: new Color('#3e5753'),
    attenuationDistance: 1.0,
    transparent: !quality.refraction,
    opacity: quality.refraction ? 1 : 0.85,
    normalMap: waterNormals,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })
  water.normalScale.set(0.35, 0.35)
  waterNormals.repeat.set(24, 24)
  const paper = std('#f7e6c0', 0.9)
  paper.emissive = new Color('#f2b45a')
  paper.emissiveIntensity = 0.35
  paper.side = DoubleSide
  const needle = std('#2f4a3e', 0.95)
  needle.side = DoubleSide
  const rice = std('#7f9a5d', 0.9)
  rice.side = DoubleSide
  const cloth = std('#2f3a63', 0.95)
  cloth.side = DoubleSide
  return {
    make,
    ground: make('moss', { repeat: 0.5, color: '#b9c9a8' }),
    gravel: make('gravel', { repeat: 0.8, roughness: 0.45, color: '#cfd3d2' }),
    plaster: make('plaster', { repeat: 0.5, color: '#e6ded0' }),
    wood: make('planks', { repeat: 0.7, roughness: 0.8, color: '#a88a6c' }),
    woodDark: make('planks', { repeat: 0.7, roughness: 0.85, color: '#5a4636' }),
    thatch: make('thatch', { repeat: 0.5, color: '#cdbfa2' }),
    tatami: make('tatami', { repeat: 1.1, color: '#d6c98a' }),
    paper,
    stone: make('stone', { repeat: 0.6, color: '#cfd1cc' }),
    mud: make('mud', { repeat: 0.5, roughness: 0.6, color: '#a89478' }),
    needle,
    bark: make('bark', { repeat: 1, color: '#8a7460' }),
    rice,
    cloth,
    water,
    waterNormals,
    needleAlpha,
    update(time) {
      waterNormals.offset.set((time / 60000) % 1, (time / 90000) % 1)
    },
  }
}
