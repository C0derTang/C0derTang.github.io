import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Quality } from '../../config/quality'
import { at, clamp01, lerp, mulberry32, smoothstep } from '../../util/math'
import type { Materials } from '../materials'
import { WATER_Y, type SceneState } from '../state'
import { insidePuddle, PUDDLES } from './puddles'
import type { WorldPart } from './types'

/**
 * The ground heightfield (yard, paddy bed, terraced hillside, rolling hills), the terraces'
 * dry-stone retaining walls, cedars (instanced), far ridges with a jagged skyline, drifting low
 * cloud bands, and two small background props (shed, scarecrow). `terrainHeight()` is the single
 * source of truth for ground level, shared by the mesh and by every prop placed on it, so nothing
 * drifts out of sync with the surface it stands on.
 */

const shadowed = <T extends Mesh>(m: T, cast = true, receive = true): T => {
  m.castShadow = cast
  m.receiveShadow = receive
  return m
}

// --- Longitudinal (z) ground profile -----------------------------------------------------
const YARD_Z = -6 // behind the house threshold the yard starts easing down
const BED_Z = -16 // by here the paddy bed has reached full depth
const BED_Y = WATER_Y - 0.3 // paddy bed sits 0.3 m under the still water so the dikes read
const TERRACE_Z0 = -47
const TERRACE_Z1 = -70
const TERRACE_STEPS = 4
const TERRACE_STEP = 1.4 // metres of tread rise per step
const TERRACE_BAND = (TERRACE_Z0 - TERRACE_Z1) / TERRACE_STEPS
const RISE_WIDTH = 2 // metres of each tread's depth spent climbing (rest is flat, for crisp steps)
const HILL_Z = -120
const HILL_Y = 12
const EDGE_Z = -195
const EDGE_Y = 22
const BOWL_X = 60 // half-width of the terrace/valley curvature
const VALLEY_HALF = 45 // beyond this the hillside starts framing the valley
const WALL_HEIGHTS = [1.1, 1.2, 1.3, 1.35] as const

/** The terrace's shallow bowl in x: highest at the centreline, curving down toward the flanks. */
const bowl = (x: number): number => {
  const ax = Math.min(Math.abs(x), BOWL_X)
  return 2 * (ax / BOWL_X) ** 2
}
/** Hillside rise framing the valley sides, beyond the paddy/terrace width. */
const lateral = (x: number): number => Math.max(0, Math.min(Math.abs(x), 100) - VALLEY_HALF) * 0.22
/** World z where terrace step `i` (0-based) begins; its retaining wall sits here. */
const riserZ = (i: number): number => TERRACE_Z0 - i * TERRACE_BAND
/** Height of the flat tread above step `i` (0-based), terrace bowl curve included. */
const treadTop = (i: number, x: number): number => BED_Y - bowl(x) + TERRACE_STEP * (i + 1)

/**
 * Ground height in metres at world (x, z): flat yard, a shallow paddy bowl, four curved terrace
 * steps (each climbing over `RISE_WIDTH` m so a retaining wall of realistic height can front it
 * flush with no gap), then rolling hills fading into the fog. Pure and cheap enough to call for
 * every prop that needs to sit on the surface, not just the ground mesh itself.
 */
/**
 * The dive pool: the flooded field is only knee-deep, but the camera swims through a deep
 * depression between the dikes (x within ±16, z -17..-41, bottom about y -3.3) so the underwater
 * world (mud bed at y -3, stems, fish) has room. Smooth rims, entirely inside the paddy bed.
 */
const POOL_DEPTH = 2.7
const pool = (x: number, z: number): number => {
  const sx = 1 - smoothstep(16, 24, Math.abs(x))
  const sz = 1 - smoothstep(12, 16, Math.abs(z + 29))
  return POOL_DEPTH * sx * sz
}

export function terrainHeight(x: number, z: number): number {
  let h: number
  if (z >= YARD_Z) {
    h = 0
  } else if (z >= BED_Z) {
    h = lerp(0, BED_Y - bowl(x), smoothstep(YARD_Z, BED_Z, z))
  } else if (z >= TERRACE_Z0) {
    h = BED_Y - bowl(x)
  } else if (z >= TERRACE_Z1) {
    const local = (TERRACE_Z0 - z) / TERRACE_BAND
    const stepIndex = Math.min(TERRACE_STEPS - 1, Math.floor(local))
    const z0 = riserZ(stepIndex)
    const prev = stepIndex === 0 ? BED_Y - bowl(x) : treadTop(stepIndex - 1, x)
    const k = clamp01((z0 - z) / RISE_WIDTH)
    h = prev + k * TERRACE_STEP
  } else if (z >= HILL_Z) {
    h = lerp(treadTop(TERRACE_STEPS - 1, x), HILL_Y, smoothstep(TERRACE_Z1, HILL_Z, z))
  } else {
    h = lerp(HILL_Y, EDGE_Y, smoothstep(HILL_Z, EDGE_Z, z))
  }
  return h + lateral(x) - pool(x, z)
}

/** The ground plane: a 400x400 heightfield with a vertex-colour hint of mud at each riser. */
function buildGround(mats: Materials): Mesh {
  const geo = new PlaneGeometry(400, 400, 200, 200)
  const pos = geo.attributes.position
  const uv = geo.attributes.uv
  if (pos) {
    const colors = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i)
      const wz = -pos.getY(i)
      pos.setZ(i, terrainHeight(wx, wz))
      uv?.setXY(i, wx, -wz)
      let mud = 0
      for (let s = 0; s < TERRACE_STEPS; s++)
        mud = Math.max(mud, 1 - smoothstep(0, 1.3, Math.abs(wz - riserZ(s))))
      const m = mud * 0.55
      const yard =
        smoothstep(0.5, 2, wz) *
        (1 - smoothstep(26, 34, wz)) *
        (1 - smoothstep(12, 20, Math.abs(wx)))
      const patch =
        0.5 + 0.25 * Math.sin(wx * 0.72 + wz * 0.31) + 0.25 * Math.sin(wx * 0.27 - wz * 0.83)
      colors[i * 3] = lerp(1, 0.66, m) * lerp(1, 0.66 + patch * 0.2, yard)
      colors[i * 3 + 1] = lerp(1, 0.55, m) * lerp(1, 0.8 + patch * 0.16, yard)
      colors[i * 3 + 2] = lerp(1, 0.42, m) * lerp(1, 0.57 + patch * 0.18, yard)
    }
    pos.needsUpdate = true
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3))
  }
  if (uv) uv.needsUpdate = true
  geo.computeVertexNormals()
  // Metre UVs make the leaf litter a fine ground layer: a 1.25 m tile instead of a 10 m tile.
  const mat = mats.make('moss', { repeat: 0.8, color: '#a9bd93', roughness: 0.95 })
  mat.normalScale.set(0.6, 0.6)
  mat.vertexColors = true
  const mesh = new Mesh(geo, mat)
  mesh.rotation.x = -Math.PI / 2
  return shadowed(mesh, false, true)
}

/** Five curved, tapering blades form a short three-dimensional tuft, without alpha cards. */
function yardGrassGeometry(): BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const rnd = mulberry32(82)
  for (let blade = 0; blade < 5; blade++) {
    const angle = (blade / 5) * Math.PI * 2 + rnd() * 0.35
    const outwardX = Math.cos(angle)
    const outwardZ = Math.sin(angle)
    const sideX = -outwardZ
    const sideZ = outwardX
    const height = 0.07 + rnd() * 0.03
    const width = 0.018 + rnd() * 0.009
    const lean = 0.035 + rnd() * 0.03
    const base = positions.length / 3
    for (const [fraction, edge] of [
      [0, -1],
      [0, 1],
      [0.55, -0.55],
      [0.55, 0.55],
      [1, 0],
    ] as const) {
      const bend = 0.012 + lean * fraction * fraction
      positions.push(
        outwardX * bend + sideX * width * edge * 0.5,
        height * fraction,
        outwardZ * bend + sideZ * width * edge * 0.5,
      )
      uvs.push(width * (edge + 1) * 0.5, height * fraction)
      colors.push(lerp(0.55, 1, fraction), lerp(0.64, 1, fraction), lerp(0.45, 0.82, fraction))
    }
    indices.push(
      base,
      base + 1,
      base + 2,
      base + 1,
      base + 3,
      base + 2,
      base + 2,
      base + 3,
      base + 4,
    )
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/** Restrict actual grass to the front yard; keep the path, standing water, and props clear. */
function buildYardGrass(
  mats: Materials,
  quality: Quality,
): { mesh: InstancedMesh; update(state: SceneState): void } {
  const count = quality.software ? 350 : quality.tier === 'low' ? 1800 : 8000
  // Blades share the registry's lit vegetation material; leaf-litter albedo made them brown.
  const mat = mats.rice.clone()
  mat.color.set('#7e9b64')
  mat.roughness = 0.86
  mat.side = DoubleSide
  mat.vertexColors = true
  const time = { value: 0 }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrassTime = time
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uGrassTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float grassHeight = clamp(position.y / 0.1, 0.0, 1.0);
        float grassPhase = instanceMatrix[3].x * 0.8 + instanceMatrix[3].z * 0.45;
        transformed.x += sin(uGrassTime * 1.4 + grassPhase) * grassHeight * grassHeight * 0.008;
        transformed.z += sin(uGrassTime * 1.1 + grassPhase * 0.7) * grassHeight * grassHeight * 0.005;`,
      )
  }
  const mesh = new InstancedMesh(yardGrassGeometry(), mat, count)
  mesh.castShadow = false
  mesh.receiveShadow = true
  const rnd = mulberry32(83)
  const o = new Object3D()
  const tint = new Color()
  const clearings = [
    [-3.5, 2, 0.65],
    [3.5, 2, 0.65],
    [-2, 12, 0.55],
    [2, 12, 0.55],
    [5, 4, 0.45],
  ] as const
  for (let i = 0; i < count; i++) {
    let x: number
    let z: number
    let patch: number
    do {
      x = (rnd() - 0.5) * 26
      z = 1.85 + rnd() * 26
      patch = 0.5 + 0.5 * Math.sin(x * 1.7 + Math.sin(z * 0.9)) * Math.sin(z * 1.1 - x * 0.3)
    } while (
      Math.abs(x) < 1.67 ||
      rnd() > 0.4 + patch * 0.6 ||
      clearings.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < r * r) ||
      PUDDLES.some((_, index) => insidePuddle(index, x, z))
    )
    o.position.set(x, terrainHeight(x, z), z)
    o.rotation.set(0, rnd() * Math.PI * 2, 0)
    const scale = 0.65 + rnd() * 0.65 + patch * 0.25
    o.scale.set(scale, scale * (0.7 + rnd() * 0.45), scale)
    o.updateMatrix()
    mesh.setMatrixAt(i, o.matrix)
    tint.setRGB(0.72 + patch * 0.22, 0.8 + patch * 0.18, 0.64 + patch * 0.22)
    mesh.setColorAt(i, tint)
  }
  return {
    mesh,
    update(state) {
      time.value = state.reduced ? 0 : state.time / 1000
    },
  }
}

/**
 * One retaining wall's geometry: a vertical stone face at the riser plus a flat cap running back
 * into the slope, sized so its top edge meets the ground's own climb with no gap or overlap.
 */
function buildWallGeometry(
  stepIndex: number,
  x0: number,
  x1: number,
  segments: number,
): BufferGeometry {
  const wallH = at(WALL_HEIGHTS, stepIndex)
  const z0 = riserZ(stepIndex)
  const thickness = (wallH / TERRACE_STEP) * RISE_WIDTH
  const prevAt = (x: number): number =>
    stepIndex === 0 ? BED_Y - bowl(x) : treadTop(stepIndex - 1, x)
  const topAt = (x: number): number => prevAt(x) + wallH

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  let arc = 0
  let prevX = x0
  for (let i = 0; i <= segments; i++) {
    const x = lerp(x0, x1, i / segments)
    arc += Math.abs(x - prevX)
    prevX = x
    positions.push(x, prevAt(x), z0, x, topAt(x), z0)
    uvs.push(arc, 0, arc, wallH)
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2
    const b = i * 2 + 1
    const c = (i + 1) * 2
    const d = (i + 1) * 2 + 1
    indices.push(a, c, b, b, c, d)
  }
  const front = (segments + 1) * 2
  for (let i = 0; i <= segments; i++) {
    const x = lerp(x0, x1, i / segments)
    const y = topAt(x)
    positions.push(x, y, z0, x, y, z0 - thickness)
    uvs.push(0, 0, thickness, 0)
  }
  for (let i = 0; i < segments; i++) {
    const a = front + i * 2
    const b = front + i * 2 + 1
    const c = front + (i + 1) * 2
    const d = front + (i + 1) * 2 + 1
    indices.push(a, c, b, c, d, b)
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/** All four terrace walls share one material: merge them into a single draw call. */
function buildWalls(mats: Materials): Mesh {
  const mat = mats.make('stone', { repeat: 1, roughness: 0.95, color: '#a19d8c' })
  mat.side = DoubleSide
  const geos: BufferGeometry[] = []
  for (let i = 0; i < TERRACE_STEPS; i++) geos.push(buildWallGeometry(i, -60, 60, 24))
  const merged = mergeGeometries(geos)
  if (!merged) throw new Error('terrain: failed to merge wall geometries')
  return shadowed(new Mesh(merged, mat), true, true)
}

// --- Cedars: instanced trunks, instanced filler cones (small and dark, hidden inside the
// canopy), and one instanced ring of drooping needle cards per tier so the silhouette reads as
// dense conifer foliage instead of a stack of flat-shaded cones. -----------------------------
interface CedarSpec {
  x: number
  z: number
  s: number
}

function cedarSpecs(quality: Quality): CedarSpec[] {
  const specs: CedarSpec[] = [
    { x: -10, z: 9, s: 1.4 },
    { x: -15, z: 3, s: 1.7 },
    { x: 10, z: 5, s: 1.2 },
    { x: 14, z: 9, s: 1.5 },
  ]
  const farCount = quality.tier === 'low' ? 8 : 14
  const rnd = mulberry32(5)
  const step = 78 / Math.max(1, farCount - 1)
  for (let i = 0; i < farCount; i++)
    specs.push({ x: -40 + i * step + (rnd() - 0.5) * 3, z: -70 - rnd() * 10, s: 1 + rnd() * 0.6 })
  return specs
}

const CEDAR_TIERS = 5
const CEDAR_TRUNK_H = 4
const cedarTierCenter = (i: number): number => 3.5 + i * 1.9
const cedarTierRadius = (i: number): number => 3.2 - i * 0.5
/** Ring cards per tier: 14 on the lowest, widest tier down to 10 on the top one. */
const cardsForTier = (i: number): number => 14 - i
const CROWN_CARDS = 4
const CARDS_PER_TREE =
  Array.from({ length: CEDAR_TIERS }, (_, i) => cardsForTier(i)).reduce((a, b) => a + b, 0) +
  CROWN_CARDS

const NEEDLE_DARK = new Color('#2c4633')
const NEEDLE_LIGHT = new Color('#5d7c56')

// Scratch objects for cardMatrix (mount-time only, reused and copied out by setMatrixAt/setColorAt
// immediately, so sharing them across calls is safe).
const _out = new Vector3()
const _tan = new Vector3()
const _up = new Vector3(0, 1, 0)
const _len = new Vector3()
const _nrm = new Vector3()
const _pos = new Vector3()
const _quat = new Quaternion()
const _scale = new Vector3()
const _basis = new Matrix4()
const _result = new Matrix4()

/**
 * A needle card that attaches near its base edge (the geometry is pre-translated so its local
 * origin is the base, not the centre) and hangs down and out from a branch. `tilt` is measured
 * from the "hangs straight down, face dead-on outward" baseline (tilt = 0): as it increases the
 * card swings toward sticking straight out (less droopy, more upright). The face normal is
 * `outward*cos(tilt) + up*sin(tilt)` -- it stays outward-*dominant* for every tilt in the range
 * this module uses, which is the point: an earlier version derived the normal as
 * `outward*sin(tilt) + up*cos(tilt)`, so at low tilt (the droopiest, most common cards) the face
 * pointed mostly *up* -- nearly edge-on to a horizontal camera -- and the canopy read as a few
 * huge translucent shards with sky showing through the gaps instead of dense foliage. The length
 * axis (base to tip) is the perpendicular in the same vertical plane, so tip offset is always
 * mostly downward with a `sin(tilt)`-sized outward lean.
 */
function cardMatrix(
  px: number,
  py: number,
  pz: number,
  angle: number,
  tilt: number,
  w: number,
  h: number,
): Matrix4 {
  _out.set(Math.cos(angle), 0, Math.sin(angle))
  _nrm.copy(_out).multiplyScalar(Math.cos(tilt)).addScaledVector(_up, Math.sin(tilt)).normalize()
  _len.copy(_out).multiplyScalar(Math.sin(tilt)).addScaledVector(_up, -Math.cos(tilt)).normalize()
  _tan.crossVectors(_len, _nrm).normalize()
  _basis.makeBasis(_tan, _len, _nrm)
  _quat.setFromRotationMatrix(_basis)
  _pos.set(px, py, pz)
  _scale.set(w, h, 1)
  return _result.compose(_pos, _quat, _scale)
}

/**
 * Trunk + the five filler cones as ONE unit-scale geometry (vertex-coloured: the trunk darkens
 * top-down, the cone collars are a flat dark tone), so one InstancedMesh and one draw call covers
 * both instead of two. Measured render-call cost does not scale 1:1 with logical mesh count in
 * this scene (an extra depth/shadow pass per mesh beyond the naive count), so cutting a mesh here
 * is what actually buys the draw-call budget back; the collars casting a shadow along with the
 * trunk (an InstancedMesh casts shadows for the whole mesh, not per sub-geometry) is a harmless
 * side effect since they sit hidden inside the canopy anyway.
 */
const CONE_FILLER_SHADE = 0.14
function buildCedarSkeleton(): BufferGeometry {
  const trunkGeo = new CylinderGeometry(0.11, 0.3, CEDAR_TRUNK_H, 8, 1, true)
  const tPos = trunkGeo.attributes.position
  if (tPos) {
    // Colour while the cylinder is still centred on local Y=0 (getY ranges -H/2..H/2), before
    // it's shifted to sit base-at-0 so it shares a "0 = ground" reference with the tier cones
    // (positioned at their absolute cedarTierCenter() heights).
    const colors = new Float32Array(tPos.count * 3)
    for (let i = 0; i < tPos.count; i++) {
      const shade = lerp(1, 0.4, clamp01(tPos.getY(i) / CEDAR_TRUNK_H + 0.5))
      colors[i * 3] = shade
      colors[i * 3 + 1] = shade
      colors[i * 3 + 2] = shade
    }
    trunkGeo.setAttribute('color', new Float32BufferAttribute(colors, 3))
  }
  trunkGeo.translate(0, CEDAR_TRUNK_H / 2, 0)
  const geos: BufferGeometry[] = [trunkGeo]
  for (let tier = 0; tier < CEDAR_TIERS; tier++) {
    const r = cedarTierRadius(tier) * 0.8
    const cone = new ConeGeometry(1, 1, 10)
    cone.scale(r, 3, r)
    cone.translate(0, cedarTierCenter(tier), 0)
    const cPos = cone.attributes.position
    if (cPos) {
      const colors = new Float32Array(cPos.count * 3).fill(CONE_FILLER_SHADE)
      cone.setAttribute('color', new Float32BufferAttribute(colors, 3))
    }
    geos.push(cone)
  }
  const merged = mergeGeometries(geos)
  if (!merged) throw new Error('terrain: failed to merge cedar skeleton geometries')
  return merged
}

function buildCedars(
  mats: Materials,
  quality: Quality,
): { trunks: InstancedMesh; needles: InstancedMesh } {
  const specs = cedarSpecs(quality)
  const n = specs.length

  const trunkMat = mats.make('bark', { repeat: 1, color: '#8a7460' })
  trunkMat.vertexColors = true
  const trunks = shadowed(new InstancedMesh(buildCedarSkeleton(), trunkMat, n), true, true)

  const needleMat = new MeshStandardMaterial({
    color: new Color('#ffffff'),
    roughness: 0.9,
    alphaMap: mats.needleAlpha,
    alphaTest: 0.45,
    side: DoubleSide,
  })
  // Pre-translated so the plane's local origin is its base edge, not its centre: scaling and
  // orienting it then makes it hang from the attachment point instead of straddling it.
  const needleGeo = new PlaneGeometry(1, 1).translate(0, 0.5, 0)
  const needles = shadowed(
    new InstancedMesh(needleGeo, needleMat, n * CARDS_PER_TREE),
    false,
    false,
  )

  const o = new Object3D()
  const tint = new Color()
  let needleI = 0
  specs.forEach((c, ci) => {
    const gy = terrainHeight(c.x, c.z)
    const rnd = mulberry32(1000 + ci * 37)

    // Trunk + its five filler cones move together as one rigid skeleton per tree.
    o.position.set(c.x, gy, c.z)
    o.rotation.set(0, rnd() * Math.PI * 2, 0)
    o.scale.set(c.s, c.s, c.s)
    o.updateMatrix()
    trunks.setMatrixAt(ci, o.matrix)

    for (let tier = 0; tier < CEDAR_TIERS; tier++) {
      const r = cedarTierRadius(tier) * c.s
      const tierY = gy + cedarTierCenter(tier) * c.s

      const count = cardsForTier(tier)
      const ringOffset = (tier % 2) * (Math.PI / count)
      // Lower, wider tiers hang lower (heavier, older branches); the top tier is nearest upright.
      // Kept modest (<= ~40 deg) so cos(tilt), the normal's outward component, always dominates.
      const tiltBase = 0.24 + tier * 0.11
      const arc = (2 * Math.PI * r) / count
      tint.copy(NEEDLE_DARK).lerp(NEEDLE_LIGHT, tier / (CEDAR_TIERS - 1))
      for (let j = 0; j < count; j++) {
        const angle = (j / count) * Math.PI * 2 + ringOffset + (rnd() - 0.5) * 0.35
        // Cards attach near the tier's own silhouette radius (not the trunk core) -- they are
        // the droop hanging past that point, not a straight line all the way from the trunk.
        const attachR = r * (0.85 + rnd() * 0.3)
        const attachY = tierY + (rnd() - 0.5) * 0.7 * c.s
        const px = c.x + Math.cos(angle) * attachR
        const pz = c.z + Math.sin(angle) * attachR
        const tilt = tiltBase + (rnd() - 0.5) * 0.16
        const height = (2.2 + rnd() * 1.4) * c.s
        const width = arc * (2.0 + rnd() * 0.8)
        needles.setMatrixAt(needleI, cardMatrix(px, attachY, pz, angle, tilt, width, height))
        needles.setColorAt(needleI, tint)
        needleI++
      }
    }

    // Crown: a few small, mostly-upright cards above the top tier for a leader shoot.
    const crownY = gy + (cedarTierCenter(CEDAR_TIERS - 1) + 1.7) * c.s
    const crownR = cedarTierRadius(CEDAR_TIERS - 1) * c.s * 0.5
    tint.copy(NEEDLE_LIGHT)
    for (let j = 0; j < CROWN_CARDS; j++) {
      const angle = (j / CROWN_CARDS) * Math.PI * 2 + rnd() * Math.PI
      const tilt = 0.55 + rnd() * 0.15
      const height = (1.1 + rnd() * 0.5) * c.s
      const width = height * (0.55 + rnd() * 0.2)
      const px = c.x + Math.cos(angle) * crownR * 0.4
      const pz = c.z + Math.sin(angle) * crownR * 0.4
      needles.setMatrixAt(needleI, cardMatrix(px, crownY, pz, angle, tilt, width, height))
      needles.setColorAt(needleI, tint)
      needleI++
    }
  })
  return { trunks, needles }
}

// --- Ridges: flat far skylines with a sine-noise silhouette. ---------------------------------
// The three depths only differ by tint, so they are baked as vertex colours and merged into one
// draw call instead of three separate materials.
function buildRidges(): Mesh {
  // Placed much closer than a literal "distant mountain" read would suggest: this scene's
  // FogExp2 falls off as 1 - exp(-(density*depth)^2), so at the exterior beat's density (~0.028)
  // anything past ~60 m from camera is already fully fog-coloured (verified empirically) -- a
  // ridge at -150 m+ is never visible from anywhere on the camera path. These sit just behind the
  // terraced hillside instead, so the nearest one reads as a hazy silhouette and fog still does
  // the softening for the two behind it.
  const specs = [
    { z: -70, h: 40, color: '#7c8f99' },
    { z: -95, h: 90, color: '#6a7e88' },
    { z: -125, h: 160, color: '#5b6f7a' },
  ] as const
  const geos = specs.map(({ z, h, color }) => {
    const geo = new PlaneGeometry(1200, h, 120, 1)
    const pos = geo.attributes.position
    if (pos) {
      const tint = new Color(color)
      const colors = new Float32Array(pos.count * 3)
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        if (pos.getY(i) > 0) pos.setY(i, h * (0.5 + 0.5 * Math.sin(x / 90) * Math.cos(x / 37)))
        colors[i * 3] = tint.r
        colors[i * 3 + 1] = tint.g
        colors[i * 3 + 2] = tint.b
      }
      pos.needsUpdate = true
      geo.setAttribute('color', new Float32BufferAttribute(colors, 3))
      geo.computeVertexNormals()
    }
    geo.translate(0, 0, z)
    return geo
  })
  const merged = mergeGeometries(geos)
  if (!merged) throw new Error('terrain: failed to merge ridge geometries')
  return new Mesh(merged, new MeshStandardMaterial({ vertexColors: true, roughness: 1 }))
}

// --- Low cloud bands: soft procedural billboards drifting slowly in x. -----------------------
function makeCloudTexture(seed: number, size = 256): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const tex = new CanvasTexture(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return tex
  const rnd = mulberry32(seed)
  for (let i = 0; i < 16; i++) {
    const cx = size * (0.1 + rnd() * 0.8)
    const cy = size * (0.25 + rnd() * 0.5)
    const r = size * (0.14 + rnd() * 0.22)
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    g.addColorStop(0, 'rgba(255,255,255,0.95)')
    g.addColorStop(0.55, 'rgba(255,255,255,0.5)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }
  // Every bank must disappear before its card edge, including overlapping off-canvas puffs.
  const pixels = ctx.getImageData(0, 0, size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const edgeX = smoothstep(0, 0.18, Math.min(x, size - 1 - x) / size)
      const edgeY = smoothstep(0, 0.22, Math.min(y, size - 1 - y) / size)
      const alpha = (y * size + x) * 4 + 3
      pixels.data[alpha] = (pixels.data[alpha] ?? 0) * edgeX * edgeY
    }
  }
  ctx.putImageData(pixels, 0, 0)
  tex.needsUpdate = true
  return tex
}

function buildClouds(): InstancedMesh {
  const mat = new MeshStandardMaterial({
    map: makeCloudTexture(41),
    color: new Color('#b9c4c2'),
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    opacity: 0.32,
    roughness: 1,
    // Clouds ARE the atmosphere: letting scene fog blend them too pulls their already-pale
    // colour toward the (very similar) fog colour and makes them vanish at any real distance.
    fog: false,
  })
  // Kept close for the same fog-falloff reason as the ridges (see buildRidges): banked between
  // the terraces and the nearest two ridges instead of far behind the farthest one.
  const count = 8
  const mesh = new InstancedMesh(new PlaneGeometry(1, 1), mat, count)
  const rnd = mulberry32(41)
  const o = new Object3D()
  for (let i = 0; i < count; i++) {
    const z = lerp(-60, -130, rnd())
    const y = 16 + rnd() * 30
    const x = (rnd() - 0.5) * 260
    const w = 45 + rnd() * 30
    const h = 6 + rnd() * 5
    o.position.set(x, y, z)
    o.rotation.set(0, (rnd() - 0.5) * 0.5, 0)
    o.scale.set(w, h, 1)
    o.updateMatrix()
    mesh.setMatrixAt(i, o.matrix)
  }
  return mesh
}

// --- Small background props on the second terrace. -------------------------------------------
function buildShed(mats: Materials): Group {
  const group = new Group()
  const x = 14
  const z = -56
  const gy = terrainHeight(x, z)
  const wallH = 1.6
  const wall = new Mesh(new BoxGeometry(2.2, wallH, 1.8), mats.wood)
  wall.position.set(x, gy + wallH / 2, z)
  group.add(shadowed(wall))
  const roof = new Mesh(new CylinderGeometry(0.05, 1.5, 0.8, 4), mats.thatch)
  roof.rotation.y = Math.PI / 4
  roof.scale.set(1.15, 1, 0.85)
  roof.position.set(x, gy + wallH + 0.4, z)
  group.add(shadowed(roof))
  return group
}

/** Post, crossbar and head all share one material: merge them into a single draw call. */
function buildScarecrow(mats: Materials): Mesh {
  const x = -6
  const z = -55
  const gy = terrainHeight(x, z)
  const post = new BoxGeometry(0.12, 1.7, 0.12).translate(x, gy + 0.85, z)
  const arms = new BoxGeometry(1.1, 0.1, 0.1).translate(x, gy + 1.3, z)
  const head = new BoxGeometry(0.24, 0.24, 0.24).translate(x, gy + 1.75, z)
  const merged = mergeGeometries([post, arms, head])
  if (!merged) throw new Error('terrain: failed to merge scarecrow geometries')
  return shadowed(new Mesh(merged, mats.woodDark), true, true)
}

export function createTerrain(mats: Materials, quality: Quality): WorldPart {
  const group = new Group()
  group.add(buildGround(mats))
  const yardGrass = buildYardGrass(mats, quality)
  group.add(yardGrass.mesh)
  group.add(buildWalls(mats))

  const cedars = buildCedars(mats, quality)
  group.add(cedars.trunks, cedars.needles)

  group.add(buildRidges())

  const cloudGroup = new Group()
  cloudGroup.add(buildClouds())
  group.add(cloudGroup)

  group.add(buildShed(mats))
  group.add(buildScarecrow(mats))

  return {
    group,
    update(state: SceneState) {
      yardGrass.update(state)
      cloudGroup.position.x = state.reduced ? 0 : Math.sin(state.time / 9000) * 8
    },
  }
}
