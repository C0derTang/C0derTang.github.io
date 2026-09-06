import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Quality } from '../../config/quality'
import { clamp, mulberry32, smoothstep } from '../../util/math'
import type { Materials } from '../materials'
import { WATER_Y, type SceneState } from '../state'
import type { WorldPart } from './types'

/**
 * Three procedural fish species swimming closed CatmullRom lanes underwater. Every fish's pose
 * is a pure lookup from `state.time`: arc-length position, tail-beat phase and the turn-driven
 * bend all come from a small piecewise-linear "cycle" table (burst-and-glide for koi/funa,
 * rest/dart/cruise for the loach) that is evaluated - and analytically integrated - at the
 * current time, never stepped forward with a per-frame delta, so a frozen or rewound
 * `state.time` reproduces the exact frame. The body undulation is a vertex-shader sine keyed off
 * that same phase, growing toward the tail; turns bend and bank the body by an amount derived
 * from how fast the lane's tangent is rotating. Funa followers reuse their leader's lane and
 * cycle at a time-shifted instant instead of a stateful spring - equally smooth, equally pure.
 */

/* ---------------------------- closed-form cycle table ---------------------------- */

interface Cycle {
  /** the integral of the table over one full period (u: 0..1) */
  readonly total: number
  /** value at u in [0,1), wrapping */
  value(u: number): number
  /** integral from 0 to u (wrapping to match `value`) */
  integral(u: number): number
}

/**
 * A periodic piecewise-linear curve over u in [0,1): `keys` gives points starting at u=0; the
 * table implicitly closes by interpolating from the last key back to the first at u=1. `value`
 * and `integral` are both pure lookups (a binary search plus a trapezoid sum) so a fish's speed
 * and the arc length it has covered read from the same table with no simulation.
 */
function makeCycle(keys: readonly (readonly [number, number])[]): Cycle {
  const first = keys[0]
  const closeValue = first ? first[1] : 0
  const pts: (readonly [number, number])[] = [...keys, [1, closeValue]]
  const n = pts.length
  const cum = new Float64Array(n)
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (!a || !b) continue
    cum[i + 1] = (cum[i] ?? 0) + ((a[1] + b[1]) / 2) * (b[0] - a[0])
  }
  const total = cum[n - 1] ?? 0
  const segmentAt = (uu: number): number => {
    let lo = 0
    let hi = n - 2
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      const pm = pts[mid]
      if (pm && pm[0] <= uu) lo = mid
      else hi = mid - 1
    }
    return lo
  }
  const wrap = (u: number): number => ((u % 1) + 1) % 1
  return {
    total,
    value(u) {
      const uu = wrap(u)
      const i = segmentAt(uu)
      const a = pts[i]
      const b = pts[i + 1]
      if (!a || !b) return 0
      const span = b[0] - a[0]
      const t = span > 0 ? (uu - a[0]) / span : 0
      return a[1] + (b[1] - a[1]) * t
    },
    integral(u) {
      const uu = wrap(u)
      const i = segmentAt(uu)
      const a = pts[i]
      const b = pts[i + 1]
      if (!a || !b) return 0
      const span = b[0] - a[0]
      const t = span > 0 ? (uu - a[0]) / span : 0
      const vAtU = a[1] + (b[1] - a[1]) * t
      return (cum[i] ?? 0) + ((a[1] + vAtU) / 2) * (uu - a[0])
    },
  }
}

/** Burst-and-glide: roughly a third of the cycle accelerating to 1.6x, the rest decaying to
 *  0.55x (koi and the funa school leader share this shape; only their period/base speed differ). */
const CRUISE_CYCLE = makeCycle([
  [0, 0.55],
  [0.06, 1.05],
  [0.16, 1.6],
  [0.3, 1.5],
  [0.42, 1.0],
  [0.65, 0.65],
  [0.88, 0.55],
])

/** Rest (near-zero, no wave) / dart (a sharp spike) / cruise, sized to one loach's own durations. */
function loachCycle(restU: number, dartU: number): Cycle {
  return makeCycle([
    [0, 0.03],
    [Math.max(0.001, restU * 0.85), 0.03],
    [restU, 0.4],
    [restU + dartU * 0.4, 3.0],
    [restU + dartU, 1.15],
    [Math.min(0.98, restU + dartU + (1 - restU - dartU) * 0.75), 1.0],
  ])
}

/* ---------------------------- lanes ---------------------------- */

/** A closed, gently irregular loop in the XZ plane with a little vertical undulation. */
function loopLane(
  rnd: () => number,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  rz: number,
  ry: number,
): CatmullRomCurve3 {
  const n = 9
  const twist = rnd() * Math.PI * 2
  const points: Vector3[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const jitter = 0.8 + rnd() * 0.4
    points.push(
      new Vector3(
        cx + Math.cos(a) * rx * jitter,
        cy + Math.sin(a * 2 + twist) * ry,
        cz + Math.sin(a) * rz * jitter,
      ),
    )
  }
  return new CatmullRomCurve3(points, true, 'catmullrom', 0.5)
}

/* ---------------------------- fish geometry ---------------------------- */

// Body silhouettes as [fraction of length, fraction of max radius] pairs, tail (0) to nose (1).
const KOI_SHAPE = [
  [0, 0],
  [0.07, 0.28],
  [0.18, 0.62],
  [0.32, 0.92],
  [0.46, 1.0],
  [0.6, 0.86],
  [0.75, 0.55],
  [0.9, 0.22],
  [1, 0],
] as const
const LOACH_SHAPE = [
  [0, 0],
  [0.08, 0.4],
  [0.22, 0.75],
  [0.4, 0.92],
  [0.55, 1.0],
  [0.7, 0.85],
  [0.85, 0.5],
  [0.95, 0.22],
  [1, 0],
] as const
const FUNA_SHAPE = [
  [0, 0],
  [0.1, 0.45],
  [0.24, 0.8],
  [0.4, 1.0],
  [0.55, 0.94],
  [0.7, 0.7],
  [0.85, 0.4],
  [1, 0],
] as const

function bodyProfile(
  shape: readonly (readonly [number, number])[],
  length: number,
  maxR: number,
): Vector2[] {
  return shape.map(([fy, fr]) => new Vector2(Math.max(0, fr ?? 0) * maxR, (fy ?? 0) * length))
}

/** A flat kite-shaped card from `base`, reaching `length` along `outDir` and `width` wide across
 *  `spreadDir`, narrowing at the tip; vertex alpha fades from 1 at the base to `tipAlpha`. */
function finCard(
  base: Vector3,
  outDir: Vector3,
  spreadDir: Vector3,
  length: number,
  width: number,
  tipAlpha: number,
): BufferGeometry {
  const tip = base.clone().addScaledVector(outDir, length)
  const a = base.clone().addScaledVector(spreadDir, width * 0.5)
  const b = base.clone().addScaledVector(spreadDir, -width * 0.5)
  const t1 = tip.clone().addScaledVector(spreadDir, width * 0.16)
  const t2 = tip.clone().addScaledVector(spreadDir, -width * 0.16)
  const geo = new BufferGeometry()
  const positions = new Float32Array([
    a.x,
    a.y,
    a.z,
    t1.x,
    t1.y,
    t1.z,
    t2.x,
    t2.y,
    t2.z,
    b.x,
    b.y,
    b.z,
  ])
  const e1 = new Vector3().subVectors(t1, a)
  const e2 = new Vector3().subVectors(b, a)
  const nrm = new Vector3().crossVectors(e1, e2).normalize()
  const normals = new Float32Array([
    nrm.x,
    nrm.y,
    nrm.z,
    nrm.x,
    nrm.y,
    nrm.z,
    nrm.x,
    nrm.y,
    nrm.z,
    nrm.x,
    nrm.y,
    nrm.z,
  ])
  const uvs = new Float32Array([0.01, 0.01, 0.05, 0.01, 0.05, 0.05, 0.01, 0.05])
  const colors = new Float32Array([1, 1, 1, 1, 1, 1, 1, tipAlpha, 1, 1, 1, tipAlpha, 1, 1, 1, 1])
  geo.setAttribute('position', new BufferAttribute(positions, 3))
  geo.setAttribute('normal', new BufferAttribute(normals, 3))
  geo.setAttribute('uv', new BufferAttribute(uvs, 2))
  geo.setAttribute('color', new BufferAttribute(colors, 4))
  geo.setIndex([0, 1, 2, 0, 2, 3])
  return geo
}

interface SpeciesTuning {
  length: number
  maxR: number
  squashX: number
  shape: readonly (readonly [number, number])[]
  radialSegments: number
  k: number
  ampGlide: number
  ampBurst: number
}

/** Body (a Lathe of revolution, squashed sideways for a laterally-compressed silhouette) plus
 *  tail/pectoral/dorsal fin cards, merged into one draw call with a shared vertex-alpha channel. */
function buildFishGeometry(sp: SpeciesTuning): BufferGeometry {
  const L = sp.length
  const R = sp.maxR
  const profile = bodyProfile(sp.shape, L, R)
  const body = new LatheGeometry(profile, sp.radialSegments)
  body.scale(sp.squashX, 1, 1)
  const bodyVerts = body.attributes.position?.count ?? 0
  const bodyColor = new Float32Array(bodyVerts * 4).fill(1)
  body.setAttribute('color', new BufferAttribute(bodyColor, 4))

  const tail = finCard(
    new Vector3(0, 0.03 * L, 0),
    new Vector3(0, -1, 0),
    new Vector3(0, 0, 1),
    0.17 * L,
    R * 2.0,
    0.3,
  )
  const pecL = finCard(
    new Vector3(R * sp.squashX * 0.75, 0.6 * L, 0),
    new Vector3(1, -0.2, -0.3).normalize(),
    new Vector3(0, 0, 1),
    R * 1.3,
    R * 1.05,
    0.35,
  )
  const pecR = finCard(
    new Vector3(-R * sp.squashX * 0.75, 0.6 * L, 0),
    new Vector3(-1, -0.2, -0.3).normalize(),
    new Vector3(0, 0, 1),
    R * 1.3,
    R * 1.05,
    0.35,
  )
  const dorsal = finCard(
    new Vector3(0, 0.48 * L, R * 0.7),
    new Vector3(0, 0, 1),
    new Vector3(0, 1, 0),
    R * 1.3,
    0.12 * L,
    0.4,
  )

  const merged = mergeGeometries([body, tail, pecL, pecR, dorsal], false)
  if (!merged) throw new Error('fish geometry merge failed')
  return merged
}

/* ---------------------------- albedo ---------------------------- */

function fishAlbedo(kind: 'koi' | 'funa' | 'loach', seed: number, mudColor: string): CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const tex = new CanvasTexture(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return tex
  const rnd = mulberry32(seed)
  ctx.fillStyle = kind === 'koi' ? '#f3ecdb' : kind === 'funa' ? '#7c854c' : mudColor
  ctx.fillRect(0, 0, size, size)
  if (kind === 'koi') {
    for (let i = 0; i < 4; i++) {
      const x = 24 + rnd() * (size - 48)
      const y = 16 + rnd() * (size - 32)
      const r = 16 + rnd() * 20
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, 'rgba(214, 88, 28, 1)')
      g.addColorStop(0.72, 'rgba(214, 88, 28, 1)')
      g.addColorStop(1, 'rgba(214, 88, 28, 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(x, y, r, r * (0.65 + rnd() * 0.3), rnd() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (kind === 'loach') {
    ctx.fillStyle = 'rgba(35, 26, 18, 0.55)'
    for (let i = 0; i < 12; i++) {
      const x = rnd() * size
      const y = rnd() * size
      const r = 2 + rnd() * 3.5
      ctx.beginPath()
      ctx.ellipse(x, y, r, r * 0.7, rnd() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, size)
    g.addColorStop(0, 'rgba(35, 45, 18, 0.4)')
    g.addColorStop(0.55, 'rgba(35, 45, 18, 0)')
    g.addColorStop(1, 'rgba(224, 214, 172, 0.3)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  // a small plain swatch the fin cards' UVs sample (their own UV lives outside the body pattern)
  ctx.fillStyle = kind === 'koi' ? '#e7d6bd' : kind === 'funa' ? '#596634' : '#42331f'
  ctx.fillRect(0, 0, size * 0.08, size * 0.08)
  tex.colorSpace = SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/* ---------------------------- body-wave shader ---------------------------- */

/**
 * Local-space (pre-instance-transform) vertex displacement: lateral offset growing toward the
 * tail, `amp * sin(k*y - phase)` plus a steady `bend` from the current turn rate, both read from
 * the per-instance `aWave` attribute the caller refreshes every frame from a pure function of
 * `state.time`. Injected right after `begin_vertex` so it runs before `instanceMatrix`.
 */
function installBodyWave(mat: MeshStandardMaterial, k: number, length: number): void {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aWave;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float grow = clamp(1.0 - transformed.y / ${Math.max(0.0001, length).toFixed(5)}, 0.0, 1.0);
          grow *= grow;
          float wob = aWave.y * grow * sin(${k.toFixed(5)} * transformed.y - aWave.x);
          transformed.x += wob + aWave.z * grow;
        }`,
      )
  }
}

/* ---------------------------- locomotion ---------------------------- */

interface Rig {
  curve: CatmullRomCurve3
  total: number
  s0: number
  /** reference speed in m/s; the cycle table is a dimensionless multiplier of this */
  base: number
  cycleLen: number
  cycle: Cycle
  ampGlide: number
  ampBurst: number
  freqBase: number
  freqGain: number
  lateralAmp: number
  lateralFreq: number
  lateralPhase: number
  /** followers evaluate the leader's own fields at `lt - timeShift` */
  timeShift: number
  /** followers subtract this from the resulting arc length (a fixed spacing behind the leader) */
  spacingOffset: number
  scale: number
}

interface Pose {
  pos: Vector3
  fwd: Vector3
  amp: number
  phase: number
  bend: number
  bank: number
}

const WORLD_UP = new Vector3(0, 1, 0)

/** Everything about a fish's instant, purely looked up from `lt` (already time-shifted for
 *  followers) - no term here is carried over from the previous frame. */
function swimPose(rig: Rig, lt: number): Pose {
  const t = lt - rig.timeShift
  const cycleLen = rig.cycleLen
  const nFull = Math.floor(t / cycleLen)
  const u = t / cycleLen - nFull
  const perCycle = cycleLen * rig.cycle.total
  const within = cycleLen * rig.cycle.integral(u)
  const distSinceZero = nFull * perCycle + within
  const s = rig.s0 + distSinceZero - rig.spacingOffset
  const speedRatio = rig.cycle.value(u)
  const v = rig.base * speedRatio
  const phase =
    2 * Math.PI * (rig.freqBase * t + (rig.freqGain / Math.max(0.02, rig.base)) * distSinceZero)
  const blend = smoothstep(0.9, 1.5, speedRatio)
  const amp = rig.ampGlide + (rig.ampBurst - rig.ampGlide) * blend

  const uu = (((s / rig.total) % 1) + 1) % 1
  const pos = rig.curve.getPointAt(uu, new Vector3())
  const fwd = rig.curve.getTangentAt(uu, new Vector3())

  if (rig.lateralAmp > 0) {
    const lateral =
      rig.lateralAmp * Math.sin((2 * Math.PI * lt) / rig.lateralFreq + rig.lateralPhase)
    const right = new Vector3(fwd.z, 0, -fwd.x)
    if (right.lengthSq() > 1e-6) pos.addScaledVector(right.normalize(), lateral)
  }

  // Turn rate from a small forward probe along the lane, scaled back to a per-second rate by
  // the time it takes to cover that arc length at the current speed.
  const dsStep = clamp(Math.abs(v) * 0.08, 0.03, 0.5)
  const uu2 = ((((s + dsStep) / rig.total) % 1) + 1) % 1
  const fwd2 = rig.curve.getTangentAt(uu2, new Vector3())
  const cross = new Vector3().crossVectors(fwd, fwd2)
  const timeForStep = dsStep / Math.max(0.05, Math.abs(v))
  const turnRate =
    timeForStep > 0 ? Math.atan2(cross.dot(WORLD_UP), fwd.dot(fwd2)) / timeForStep : 0
  const bend = clamp(turnRate * 0.5, -1, 1) * amp * 1.6
  const bank = clamp(turnRate * 0.4, -0.35, 0.35)

  return { pos, fwd, amp, phase, bend, bank }
}

const tmpMatrix = new Matrix4()
const tmpBasis = new Matrix4()
const tmpQuat = new Quaternion()
const tmpScale = new Vector3()
const tmpRight = new Vector3()
const tmpUp = new Vector3()

/** Local Y (spine/forward) -> `pose.fwd`, local Z -> "up" rolled by `pose.bank` about forward. */
function composeInstance(pose: Pose, scale: number, out: Matrix4): void {
  tmpRight.crossVectors(pose.fwd, WORLD_UP)
  if (tmpRight.lengthSq() < 1e-6) tmpRight.set(1, 0, 0)
  tmpRight.normalize()
  tmpUp.crossVectors(tmpRight, pose.fwd).normalize()
  tmpRight.applyAxisAngle(pose.fwd, pose.bank)
  tmpUp.applyAxisAngle(pose.fwd, pose.bank)
  tmpBasis.makeBasis(tmpRight, pose.fwd, tmpUp)
  tmpQuat.setFromRotationMatrix(tmpBasis)
  tmpScale.set(scale, scale, scale)
  out.compose(pose.pos, tmpQuat, tmpScale)
}

interface SpeciesRuntime {
  mesh: InstancedMesh
  rigs: Rig[]
  waveArr: Float32Array
  waveAttr: InstancedBufferAttribute
}

function updateSpecies(rt: SpeciesRuntime, lt: number): void {
  for (let i = 0; i < rt.rigs.length; i++) {
    const rig = rt.rigs[i]
    if (!rig) continue
    const pose = swimPose(rig, lt)
    composeInstance(pose, rig.scale, tmpMatrix)
    rt.mesh.setMatrixAt(i, tmpMatrix)
    const b = i * 3
    rt.waveArr[b] = pose.phase
    rt.waveArr[b + 1] = pose.amp
    rt.waveArr[b + 2] = pose.bend
  }
  rt.mesh.instanceMatrix.needsUpdate = true
  rt.waveAttr.needsUpdate = true
}

/* ---------------------------- factory ---------------------------- */

const KOI_TUNING: SpeciesTuning = {
  length: 0.7,
  maxR: 0.115,
  squashX: 0.78,
  shape: KOI_SHAPE,
  radialSegments: 12,
  k: (2 * Math.PI) / 0.6,
  ampGlide: 0.013,
  ampBurst: 0.052,
}
const FUNA_TUNING: SpeciesTuning = {
  length: 0.3,
  maxR: 0.085,
  squashX: 0.58,
  shape: FUNA_SHAPE,
  radialSegments: 10,
  k: (2 * Math.PI) / 0.32,
  ampGlide: 0.009,
  ampBurst: 0.032,
}
const LOACH_TUNING: SpeciesTuning = {
  length: 0.35,
  maxR: 0.032,
  squashX: 0.88,
  shape: LOACH_SHAPE,
  radialSegments: 8,
  k: (2 * Math.PI) / 0.15,
  ampGlide: 0,
  ampBurst: 0.026,
}

const KOI_LOOPS: readonly (readonly [number, number, number, number, number, number])[] = [
  [-3, -1.5, -26, 6, 8, 0.65],
  [4, -1.4, -40, 7, 9, 0.7],
]
const FUNA_SCHOOL_CENTERS: readonly (readonly [number, number, number])[] = [
  [-9, -0.8, -22],
  [9, -0.75, -30],
  [-7, -0.85, -42],
  [8, -0.8, -48],
]

function buildSpecies(
  tuning: SpeciesTuning,
  count: number,
  mudColor: string,
  kind: 'koi' | 'funa' | 'loach',
  seed: number,
): { mesh: InstancedMesh; waveArr: Float32Array; waveAttr: InstancedBufferAttribute } {
  const geo = buildFishGeometry(tuning)
  const mat = new MeshStandardMaterial({
    map: fishAlbedo(kind, seed, mudColor),
    roughness: kind === 'koi' ? 0.5 : kind === 'funa' ? 0.55 : 0.6,
    metalness: 0,
    vertexColors: true,
    transparent: true,
    depthWrite: true,
    side: DoubleSide,
  })
  installBodyWave(mat, tuning.k, tuning.length)
  const waveArr = new Float32Array(count * 3)
  const waveAttr = new InstancedBufferAttribute(waveArr, 3)
  waveAttr.setUsage(DynamicDrawUsage)
  geo.setAttribute('aWave', waveAttr)
  const mesh = new InstancedMesh(geo, mat, count)
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.frustumCulled = false
  return { mesh, waveArr, waveAttr }
}

/**
 * Forty procedural fish across three species (koi, funa/crucian carp, loach) swimming closed
 * lanes underwater. `mats` only informs the loach's base tone (matched to the actual mud
 * material) - the fish themselves carry their own canvas albedos, since none of the shared CC0
 * sets are a fish skin.
 */
export function createFish(mats: Materials, quality: Quality): WorldPart {
  const group = new Group()
  const scale = quality.software ? 0.4 : quality.tier === 'low' ? 0.65 : 1
  const rnd = mulberry32(4242)
  const mudColor = `#${mats.mud.color.getHexString()}`

  const koiCount = Math.max(2, Math.round(8 * scale))
  const funaSchools = Math.max(1, Math.round(4 * scale))
  const funaPerSchool = 5
  const loachCount = Math.max(2, Math.round(12 * scale))

  const koi = buildSpecies(KOI_TUNING, koiCount, mudColor, 'koi', 501)
  const funa = buildSpecies(FUNA_TUNING, funaSchools * funaPerSchool, mudColor, 'funa', 502)
  const loach = buildSpecies(LOACH_TUNING, loachCount, mudColor, 'loach', 503)
  group.add(koi.mesh, funa.mesh, loach.mesh)

  const koiRigs: Rig[] = []
  for (let i = 0; i < koiCount; i++) {
    const loopDef = KOI_LOOPS[i % KOI_LOOPS.length]
    if (!loopDef) continue
    const [cx, cy, cz, rx, rz, ry] = loopDef
    const curve = loopLane(rnd, cx, cy, cz, rx, rz, ry)
    const total = curve.getLength()
    koiRigs.push({
      curve,
      total,
      s0: rnd() * total,
      base: 0.32 + rnd() * 0.22,
      cycleLen: 3.4 + rnd() * 2.2,
      cycle: CRUISE_CYCLE,
      ampGlide: KOI_TUNING.ampGlide,
      ampBurst: KOI_TUNING.ampBurst,
      freqBase: 0.8,
      freqGain: 0.7,
      lateralAmp: 0,
      lateralFreq: 1,
      lateralPhase: 0,
      timeShift: 0,
      spacingOffset: 0,
      scale: 0.85 + rnd() * 0.3,
    })
  }

  const funaRigs: Rig[] = []
  for (let sIdx = 0; sIdx < funaSchools; sIdx++) {
    const c = FUNA_SCHOOL_CENTERS[sIdx % FUNA_SCHOOL_CENTERS.length]
    if (!c) continue
    const curve = loopLane(rnd, c[0], c[1], c[2], 3 + rnd(), 4 + rnd(), 0.35)
    const total = curve.getLength()
    const leader: Rig = {
      curve,
      total,
      s0: rnd() * total,
      base: 0.4 + rnd() * 0.2,
      cycleLen: 3 + rnd() * 2,
      cycle: CRUISE_CYCLE,
      ampGlide: FUNA_TUNING.ampGlide,
      ampBurst: FUNA_TUNING.ampBurst,
      freqBase: 0.8,
      freqGain: 0.7,
      lateralAmp: 0,
      lateralFreq: 1,
      lateralPhase: 0,
      timeShift: 0,
      spacingOffset: 0,
      scale: 0.9 + rnd() * 0.2,
    }
    funaRigs.push(leader)
    for (let rank = 1; rank < funaPerSchool; rank++) {
      funaRigs.push({
        ...leader,
        timeShift: rank * 0.28,
        spacingOffset: rank * 0.5,
        lateralAmp: 0.12 + rnd() * 0.08,
        lateralFreq: 2.5 + rnd() * 2,
        lateralPhase: rnd() * Math.PI * 2,
        scale: leader.scale * (0.85 + rnd() * 0.2),
      })
    }
  }

  const loachRigs: Rig[] = []
  for (let i = 0; i < loachCount; i++) {
    const cx = -14 + rnd() * 28
    const cz = -12 - rnd() * 48
    const curve = loopLane(rnd, cx, -2.7, cz, 1 + rnd() * 1.2, 1.4 + rnd() * 1.4, 0.1)
    const total = curve.getLength()
    const restS = 2 + rnd() * 2
    const dartS = 0.8
    const cruiseS = 2 + rnd() * 1.5
    const cycleLen = restS + dartS + cruiseS
    loachRigs.push({
      curve,
      total,
      s0: rnd() * total,
      base: 0.16 + rnd() * 0.1,
      cycleLen,
      cycle: loachCycle(restS / cycleLen, dartS / cycleLen),
      ampGlide: LOACH_TUNING.ampGlide,
      ampBurst: LOACH_TUNING.ampBurst,
      freqBase: 0.8,
      freqGain: 0.7,
      lateralAmp: 0,
      lateralFreq: 1,
      lateralPhase: 0,
      timeShift: 0,
      spacingOffset: 0,
      scale: 0.85 + rnd() * 0.3,
    })
  }

  const koiRuntime: SpeciesRuntime = {
    mesh: koi.mesh,
    rigs: koiRigs,
    waveArr: koi.waveArr,
    waveAttr: koi.waveAttr,
  }
  const funaRuntime: SpeciesRuntime = {
    mesh: funa.mesh,
    rigs: funaRigs,
    waveArr: funa.waveArr,
    waveAttr: funa.waveAttr,
  }
  const loachRuntime: SpeciesRuntime = {
    mesh: loach.mesh,
    rigs: loachRigs,
    waveArr: loach.waveArr,
    waveAttr: loach.waveAttr,
  }

  return {
    group,
    update(state: SceneState) {
      // Fish live under the surface either way; show them a little before the camera crosses it.
      const visible = state.underwater || state.pose.y < WATER_Y + 2
      group.visible = visible
      if (!visible) return
      const lt = state.reduced ? 0 : state.time / 1000
      updateSpecies(koiRuntime, lt)
      updateSpecies(funaRuntime, lt)
      updateSpecies(loachRuntime, lt)
    },
  }
}
