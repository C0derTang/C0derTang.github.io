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
  /** the same water as a thin film: puddles on the path (tiny thickness, shorter attenuation) */
  puddle: MeshPhysicalMaterial
  waterNormals: Texture
  /** procedural cedar spray mask, shared by the instanced canopy cards */
  needleAlpha: Texture
  /** per-frame uniform drive for the water normal scroll */
  update(time: number): void
}

const std = (color: string, roughness: number, metalness = 0): MeshStandardMaterial =>
  new MeshStandardMaterial({ color: new Color(color), roughness, metalness })

/** A complete cedar spray per card; the source model's packed UV atlas is not a twig mask. */
function makeNeedleAlpha(size = 512): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const tex = new CanvasTexture(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return tex
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = '#fff'
  ctx.lineCap = 'round'
  const rnd = mulberry32(19)
  const line = (x0: number, y0: number, x1: number, y1: number, width: number): void => {
    ctx.lineWidth = width * size
    ctx.beginPath()
    ctx.moveTo(x0 * size, y0 * size)
    ctx.lineTo(x1 * size, y1 * size)
    ctx.stroke()
  }
  line(0.5, 0.02, 0.5, 0.97, 0.009)
  for (let row = 0; row < 27; row++) {
    const y = 0.08 + (row / 27) * 0.84
    const spread = 0.42 * Math.sin(Math.PI * Math.pow(y, 0.7))
    for (const side of [-1, 1]) {
      const endX = 0.5 + side * spread * (0.88 + rnd() * 0.12)
      const endY = Math.min(0.98, y + 0.12 + rnd() * 0.04)
      line(0.5, y, endX, endY, 0.005)
      for (let needle = 1; needle <= 18; needle++) {
        const f = needle / 19
        const x = 0.5 + (endX - 0.5) * f
        const ny = y + (endY - y) * f
        const length = (0.022 + rnd() * 0.016) * (1 - f * 0.45)
        line(x, ny, x + side * length, ny - length * 0.75, 0.004)
        line(x, ny, x + side * length * 0.55, ny + length, 0.004)
      }
    }
  }
  tex.flipY = false
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

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
  const needleAlpha = makeNeedleAlpha()
  const softenPlaster = (m: MeshStandardMaterial): MeshStandardMaterial => {
    m.normalScale.set(0.25, 0.25)
    m.aoMapIntensity = 0.3
    // Keep the CC0 surface wear as variation under a limewash, not exposed concrete patches.
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, diffuse, 0.62);',
      )
    }
    return m
  }
  const water = new MeshPhysicalMaterial({
    color: new Color('#5f7a76'),
    roughness: 0.18,
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
  water.normalScale.set(0.18, 0.18)
  waterNormals.repeat.set(24, 24)
  const puddle = water.clone()
  puddle.thickness = 0.03
  puddle.attenuationDistance = 0.4
  puddle.roughness = 0.16
  puddle.color.set('#67756e')
  puddle.normalScale.set(0.12, 0.12)
  const paper = std('#e3decf', 0.9)
  paper.emissive = new Color('#bfcbcf')
  paper.emissiveIntensity = 0.1
  paper.side = DoubleSide
  const needle = std('#2f4a3e', 0.95)
  needle.side = DoubleSide
  const rice = std('#7f9a5d', 0.9)
  rice.side = DoubleSide
  const cloth = std('#30394c', 0.95)
  cloth.side = DoubleSide
  const tatami = make('tatami', { color: '#d6c98a' })
  // The source image contains eight bordered mats. Sample only one woven interior; the room
  // models the actual 0.9 × 1.8 m mats and cloth borders as geometry, so no miniature grid repeats.
  for (const tex of [tatami.map, tatami.normalMap, tatami.roughnessMap, tatami.aoMap]) {
    if (!tex) continue
    tex.repeat.set(0.205 / 0.9, 0.445 / 1.8)
    tex.offset.set(0.025, 0.025)
  }
  tatami.normalScale.set(0.4, 0.4)
  return {
    make,
    ground: make('moss', { repeat: 0.5, color: '#b9c9a8' }),
    gravel: make('gravel', { repeat: 0.8, roughness: 0.45, color: '#cfd3d2' }),
    plaster: softenPlaster(make('plaster', { repeat: 0.5, color: '#f1eadc' })),
    wood: make('planks', { repeat: 0.7, roughness: 0.8, color: '#a88a6c' }),
    woodDark: make('planks', { repeat: 0.7, roughness: 0.85, color: '#5a4636' }),
    thatch: make('thatch', { repeat: 0.5, color: '#e2d4b6' }),
    tatami,
    paper,
    stone: make('stone', { repeat: 0.6, color: '#cfd1cc' }),
    mud: make('mud', { repeat: 0.5, roughness: 0.6, color: '#a89478' }),
    needle,
    bark: make('bark', { repeat: 1, color: '#8a7460' }),
    rice,
    cloth,
    water,
    puddle,
    waterNormals,
    needleAlpha,
    update(time) {
      waterNormals.offset.set((time / 60000) % 1, (time / 90000) % 1)
    },
  }
}
