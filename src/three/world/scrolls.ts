import {
  AdditiveBlending,
  type BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { lerp, smoothstep } from '../../util/math'
import { ART, CPH2H_GLYPH } from '../../config/art'
import { PROJECTS, type ProjectId } from '../../config/projects'
import type { Quality } from '../../config/quality'
import type { Materials } from '../materials'
import type { SceneState } from '../state'
import { beat } from './beat'
import type { Interactive, OpenState, Pickable, WorldPart } from './types'

/**
 * The three banners (kakejiku), one per featured project, side by side on the +x wall where
 * the turn's first hold faces them. They carry an image and a seal, no words. All three faces
 * are painted into one canvas atlas; each banner is its own mesh and material so it can glow,
 * be hovered and be picked on its own. The mounts are there from the start; the ink goes on
 * once the seal's font and the two images are in (never behind the curtain on a normal start).
 * Nothing here casts a shadow.
 */

// The whole banner (mount included) in metres, and one atlas cell in design units (same
// proportions). Everything is painted in these units; the canvas is `cellScale` times as fine.
const W = 0.6
const H = 1.5
const CW = 384
const CH = 960
// The bare paper inside a cell, in design units.
const PX = 32
const PY = 92
const PW = CW - PX * 2
const PH = 760

const INK = '#1a1c1e'
const PAPER = '#e9dfc6'
const RED = '#a8402e'
const CYAN = '#57a9c9'
const FONT = '"Shippori Mincho", Georgia, serif'
const SEAL = 'CT'

/**
 * Where they hang. From the banner hold the camera stands at (0.70, 1.45, -3.40) looking down
 * +x, and three things in the room stand in front of this wall: the doma post (it hides
 * z -3.76..-3.37 of the wall), the rail from that post to the back wall (it crosses the wall
 * left of the post at y 2.07..2.23) and the roof braces (above y 2.35). So the banners hang
 * below the rail's line, evenly spaced with the post in the first gap, and inside the
 * z -5.6..-1.2 a portrait phone sees.
 */
const WALL_X = 5.25
const FACE_X = WALL_X - 0.035
const TOP_Y = 2.03
const CENTER_Y = TOP_Y - H / 2
const CENTER_Z: Record<ProjectId, number> = {
  cph2h: -4.2,
  'waifu-focus': -2.96,
  robotics: -1.72,
}

/**
 * Canvas pixels per design unit. An opened banner stands about 0.9 of the screen high, so the
 * desktop cell is 768 x 1920 (the atlas is 2304 x 1920, about 24 MB on the GPU with its mips);
 * `low` gets 512 x 1280 (about 10 MB) and a software rasterizer the design size.
 */
function cellScale(quality: Quality): number {
  return quality.software ? 1 : quality.tier === 'high' ? 2 : 4 / 3
}

// The glow: emissive on the face plus the halo behind it. Until a banner has been opened it
// pulses on the room's shared beat (`beat.ts`), in step with everything else; once opened it
// settles to a steady, dimmer glow with no halo, and can still be opened again. Hover lifts both (eased); an open banner is evenly lit
// with no halo, and the other two fade out behind it (nothing of them shows past the panel).
const GLOW = 0.3
const GLOW_SWING = 0.34
const GLOW_HOVER = 0.22
const GLOW_OPEN = 0.85
const GLOW_VISITED = 0.12
const HALO = 0.1
const HALO_SWING = 0.4
const HALO_HOVER = 0.3
const HALO_VISITED = 0
const HALO_MARGIN = 0.3
const WARM = 0xffd9a0
/** How long (ms) a visited banner takes to settle from its pulse to the steady glow. */
const SETTLE_MS = 1000
/** Time constant (ms) of the hover's rise and fall. */
const HOVER_TAU = 90

export interface PaperRect {
  /** centre of the bare paper, world space */
  center: Vector3
  /** unit normal, pointing into the room */
  normal: Vector3
  width: number
  height: number
  /** the whole banner, mount included: same plane and normal */
  outer: { center: Vector3; width: number; height: number }
}

export interface Scrolls extends WorldPart, Interactive {
  /** resolves with the atlas once the faces are painted (font and images in, or given up on) */
  painted: Promise<CanvasTexture>
  /** the bare-paper rectangle of a banner */
  paper(id: ProjectId): PaperRect
}

const dummy = new Object3D()
function rod(y: number, z: number): BufferGeometry {
  const geo = new CylinderGeometry(0.018, 0.018, W + 0.07, 8)
  dummy.position.set(FACE_X - 0.012, y, z)
  dummy.rotation.set(Math.PI / 2, 0, 0)
  dummy.updateMatrix()
  return geo.applyMatrix4(dummy.matrix)
}

/** The cloth mount, its two gold bands and the bare paper. */
function paintMount(ctx: CanvasRenderingContext2D, x0: number): void {
  ctx.fillStyle = '#2f3a4d'
  ctx.fillRect(x0, 0, CW, CH)
  ctx.fillStyle = '#b79a5e'
  ctx.fillRect(x0, PY - 24, CW, 8)
  ctx.fillRect(x0, PY + PH + 16, CW, 8)
  ctx.fillStyle = PAPER
  ctx.fillRect(x0 + PX, PY, PW, PH)
}

/** A soft grey wash under the image, as if the paper had taken some water there. */
function paintWash(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(rx, ry)
  const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  wash.addColorStop(0, 'rgba(26, 28, 30, 0.13)')
  wash.addColorStop(0.6, 'rgba(26, 28, 30, 0.07)')
  wash.addColorStop(1, 'rgba(26, 28, 30, 0)')
  ctx.fillStyle = wash
  ctx.fillRect(-1, -1, 2, 2)
  ctx.restore()
}

/** The logo glyph in ink over faint cyan and red offset copies, a ring behind, crossed strokes. */
function paintGlyph(ctx: CanvasRenderingContext2D): void {
  const cx = PW / 2
  const cy = 330
  paintWash(ctx, cx, cy + 10, 135, 170)

  ctx.lineCap = 'round'
  ctx.strokeStyle = INK
  // The ring: one brushed turn that stops short of closing.
  ctx.globalAlpha = 0.22
  ctx.lineWidth = 20
  ctx.beginPath()
  ctx.ellipse(cx, cy, 118, 148, 0, -0.9, Math.PI * 2 - 1.45)
  ctx.stroke()

  // The glyph's own box is 64 units with the mark centred on (32, 32).
  const s = 5.2
  const glyph = new Path2D(CPH2H_GLYPH)
  const stamp = (colour: string, alpha: number, dx: number, dy: number): void => {
    ctx.save()
    ctx.translate(cx - 32 * s, cy - 32 * s)
    ctx.scale(s, s)
    ctx.translate(dx, dy)
    ctx.globalAlpha = alpha
    ctx.fillStyle = colour
    ctx.fill(glyph)
    ctx.restore()
  }
  stamp(CYAN, 0.5, -2.4, 0.6)
  stamp(RED, 0.5, 2.4, -0.4)
  stamp(INK, 1, 0, 0)

  ctx.globalAlpha = 1
  ctx.lineWidth = 11
  ctx.beginPath()
  ctx.moveTo(cx - 76, 612)
  ctx.lineTo(cx + 78, 676)
  ctx.moveTo(cx + 76, 610)
  ctx.lineTo(cx - 78, 678)
  ctx.stroke()
}

/** An ink image, `width` of the paper wide, centred on `cx` with its top at `top`. */
function paintImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  width: number,
  cx: number,
  top: number,
): void {
  if (!image || image.naturalWidth === 0) return
  const w = PW * width
  const h = (w * image.naturalHeight) / image.naturalWidth
  paintWash(ctx, PW / 2, top + h / 2, PW * 0.5, h * 0.6)
  // The sources are 512 px wide and land larger than that on the desktop atlas.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, cx - w / 2, top, w, h)
}

function paintSeal(ctx: CanvasRenderingContext2D): void {
  const size = 46
  const x = 24
  const y = PH - 40 - size
  ctx.fillStyle = RED
  ctx.beginPath()
  ctx.roundRect(x, y, size, size, 3)
  ctx.fill()
  ctx.fillStyle = PAPER
  // The same weight the atlas waits for: a second face could arrive after the paint.
  ctx.font = `500 23px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(SEAL, x + size / 2, y + size / 2 + 2)
}

interface Art {
  waifu: HTMLImageElement | null
  robot: HTMLImageElement | null
}

/** One face, drawn in paper coordinates and clipped to the paper. */
function paintFace(ctx: CanvasRenderingContext2D, x0: number, id: ProjectId, art: Art): void {
  ctx.save()
  ctx.translate(x0 + PX, PY)
  ctx.beginPath()
  ctx.rect(0, 0, PW, PH)
  ctx.clip()
  if (id === 'cph2h') paintGlyph(ctx)
  else if (id === 'waifu-focus') {
    paintImage(ctx, art.waifu, 1.3, PW / 2, 150)
    // A small red sun in the corner, the one spot of colour on this face.
    ctx.fillStyle = RED
    ctx.beginPath()
    ctx.arc(PW - 62, 78, 15, 0, Math.PI * 2)
    ctx.fill()
  } else paintImage(ctx, art.robot, 1.08, PW / 2 + 4, 132)
  ctx.globalAlpha = 1
  paintSeal(ctx)
  ctx.restore()
}

/** A failed or undecodable image resolves to null: its banner is painted without it. */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  const image = new Image()
  image.src = url
  return image.decode().then(
    () => image,
    () => null,
  )
}

/** The halo's falloff around the banner's outline: white, alpha fading out over the margin. */
function haloTexture(): CanvasTexture {
  const w = 48
  const h = 96
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('scrolls: no 2d context')
  const pixels = ctx.createImageData(w, h)
  const fullW = W + HALO_MARGIN * 2
  const fullH = H + HALO_MARGIN * 2
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const dx = Math.max(0, Math.abs(((i + 0.5) / w - 0.5) * fullW) - W / 2)
      const dy = Math.max(0, Math.abs(((j + 0.5) / h - 0.5) * fullH) - H / 2)
      const fall = Math.max(0, 1 - Math.hypot(dx, dy) / HALO_MARGIN)
      const o = (j * w + i) * 4
      pixels.data[o] = 255
      pixels.data[o + 1] = 255
      pixels.data[o + 2] = 255
      pixels.data[o + 3] = Math.round(255 * fall * fall)
    }
  ctx.putImageData(pixels, 0, 0)
  return new CanvasTexture(canvas)
}

interface Banner {
  id: ProjectId
  face: MeshStandardMaterial
  halo: MeshBasicMaterial
  /** its rods, in their own (shared-texture) material so they fade with the face */
  rod: MeshStandardMaterial
  /** face, halo and rods: hidden while another banner is open, so none of it draws */
  meshes: readonly Mesh[]
  /** wall clock when it was first opened this page load; null until then */
  visitedAt: number | null
  /** the eased hover (0..1): its value when the pointer last arrived or left, and when */
  hoverFrom: number
  hoverAt: number
}

/**
 * `after` delays the two image downloads (a normal start passes the curtain's own loading, so
 * they never compete with it); an eager start passes nothing and `painted` holds its curtain.
 */
export function createScrolls(
  mats: Materials,
  quality: Quality,
  after?: Promise<unknown>,
): Scrolls {
  const group = new Group()

  const scale = cellScale(quality)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(CW * scale) * PROJECTS.length
  canvas.height = Math.round(CH * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('scrolls: no 2d context')
  // Paint in design units whatever the canvas size: every width, radius and font follows.
  ctx.scale(canvas.width / (CW * PROJECTS.length), canvas.height / CH)
  PROJECTS.forEach((_, i) => {
    paintMount(ctx, i * CW)
  })
  const atlas = new CanvasTexture(canvas)
  atlas.colorSpace = SRGBColorSpace
  atlas.anisotropy = quality.anisotropy

  const glow = haloTexture()
  const haloGeo = new PlaneGeometry(W + HALO_MARGIN * 2, H + HALO_MARGIN * 2)
  const banners: Banner[] = []
  const pickables: Pickable[] = []
  PROJECTS.forEach((project, i) => {
    const z = CENTER_Z[project.id]
    const geo = new PlaneGeometry(W, H)
    const uv = geo.getAttribute('uv')
    for (let v = 0; v < uv.count; v++) uv.setX(v, (i + uv.getX(v)) / PROJECTS.length)
    // Transparent (at opacity 1 it draws exactly as an opaque one) so it can fade into the wall
    // while another banner is open.
    const face = new MeshStandardMaterial({
      map: atlas,
      roughness: 0.9,
      emissive: new Color(WARM),
      emissiveMap: atlas,
      emissiveIntensity: GLOW,
      transparent: true,
    })
    const mesh = new Mesh(geo, face)
    mesh.position.set(FACE_X, CENTER_Y, z)
    // A plane faces +z; turn it to face -x, into the room.
    mesh.rotation.y = -Math.PI / 2

    const halo = new MeshBasicMaterial({
      map: glow,
      color: WARM,
      transparent: true,
      opacity: HALO,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    const haloMesh = new Mesh(haloGeo, halo)
    haloMesh.position.set(WALL_X - 0.012, CENTER_Y, z)
    haloMesh.rotation.y = -Math.PI / 2
    haloMesh.renderOrder = 1

    const rodGeo = mergeGeometries([rod(CENTER_Y + H / 2, z), rod(CENTER_Y - H / 2, z)], false)
    if (!rodGeo) throw new Error('scrolls: geometry merge failed')
    // A clone shares the set's textures: no download, no GPU memory, only its own opacity.
    const rodMat = mats.woodDark.clone()
    rodMat.transparent = true
    const rodMesh = new Mesh(rodGeo, rodMat)

    const meshes = [mesh, haloMesh, rodMesh]
    for (const m of meshes) {
      m.castShadow = false
      m.receiveShadow = false
      group.add(m)
    }
    banners.push({
      id: project.id,
      face,
      halo,
      rod: rodMat,
      meshes,
      visitedAt: null,
      hoverFrom: 0,
      hoverAt: 0,
    })
    pickables.push({ id: project.id, kind: 'banner', object: mesh })
  })

  // A font that never arrives must not leave the seals blank: paint with the fallback.
  const font = Promise.race([
    document.fonts.load(`500 64px ${FONT}`, SEAL),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ])
    // A rejected load falls through to the same fallback paint.
    .catch(() => undefined)
  const art: Promise<Art> = (after ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => Promise.all([loadImage(ART.waifu), loadImage(ART.robot)]))
    .then(([waifu, robot]) => ({ waifu, robot }))
  const painted = Promise.all([art, font]).then(([images]) => {
    PROJECTS.forEach((project, i) => {
      paintFace(ctx, i * CW, project.id, images)
    })
    atlas.needsUpdate = true
    return atlas
  })

  let hovered: string | null = null
  let opened: OpenState | null = null

  /**
   * The hover eases toward 0 or 1 as a closed form of the wall clock since it last changed
   * (interaction state, like the opened view's own tween; never part of `computeState`).
   */
  const hoverOf = (b: Banner, now: number): number => {
    const goal = hovered === b.id ? 1 : 0
    return goal + (b.hoverFrom - goal) * Math.exp(-(now - b.hoverAt) / HOVER_TAU)
  }

  const paperWidth = (W * PW) / CW
  const paperHeight = (H * PH) / CH
  const paperY = CENTER_Y + (0.5 - (PY + PH / 2) / CH) * H

  return {
    group,
    painted,
    pickables,
    setHover(id) {
      if (id === hovered) return
      const now = performance.now()
      for (const b of banners) {
        b.hoverFrom = hoverOf(b, now)
        b.hoverAt = now
      }
      hovered = id
    },
    setOpen(open) {
      opened = open
    },
    setVisited(ids) {
      let now: number | null = null
      for (const b of banners)
        if (b.visitedAt === null && ids.has(b.id)) b.visitedAt = now ??= performance.now()
    },
    paper(id) {
      const z = CENTER_Z[id]
      return {
        center: new Vector3(FACE_X, paperY, z),
        normal: new Vector3(-1, 0, 0),
        width: paperWidth,
        height: paperHeight,
        outer: { center: new Vector3(FACE_X, CENTER_Y, z), width: W, height: H },
      }
    },
    update(state: SceneState) {
      const now = performance.now()
      const open = opened ? Math.min(1, Math.max(0, opened.k)) : 0
      for (const b of banners) {
        const swing = state.reduced ? 0 : beat(state.time)
        const hover = state.reduced ? (hovered === b.id ? 1 : 0) : hoverOf(b, now)
        // 0 while it still calls for a click, 1 once it has settled after its first opening.
        const visited =
          b.visitedAt === null ? 0 : state.reduced ? 1 : smoothstep(0, SETTLE_MS, now - b.visitedAt)
        const mine = opened?.id === b.id
        const k = mine ? open : 0
        const glow = lerp(GLOW + GLOW_SWING * swing, GLOW_VISITED, visited) + GLOW_HOVER * hover
        const halo = lerp(HALO + HALO_SWING * swing, HALO_VISITED, visited) + HALO_HOVER * hover
        // While another banner is open this one fades into the wall, gone well before the panel
        // shows, and comes back exactly as it was on close.
        const shown = mine ? 1 : 1 - smoothstep(0, 0.6, open)
        b.face.emissiveIntensity = (glow + (GLOW_OPEN - glow) * k) * shown
        b.face.opacity = shown
        b.rod.opacity = shown
        b.halo.opacity = halo * (1 - k) * shown
        for (const m of b.meshes) m.visible = shown > 0
      }
    },
  }
}
