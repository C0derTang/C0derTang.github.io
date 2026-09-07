import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
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
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Quality } from '../../config/quality'
import { clamp, monotoneCubic, mulberry32, smoothstep } from '../../util/math'
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
  [0.025, 0.19],
  [0.09, 0.27],
  [0.22, 0.57],
  [0.4, 0.92],
  [0.56, 1.0],
  [0.72, 0.88],
  [0.84, 0.66],
  [0.93, 0.46],
  [0.985, 0.2],
  [1, 0],
] as const
const LOACH_SHAPE = [
  [0, 0],
  [0.035, 0.3],
  [0.15, 0.6],
  [0.34, 0.87],
  [0.55, 0.98],
  [0.76, 1.0],
  [0.9, 0.8],
  [0.97, 0.46],
  [1, 0],
] as const
const FUNA_SHAPE = [
  [0, 0],
  [0.035, 0.2],
  [0.14, 0.39],
  [0.34, 0.87],
  [0.52, 1.0],
  [0.67, 0.89],
  [0.82, 0.64],
  [0.93, 0.34],
  [0.985, 0.14],
  [1, 0],
] as const

type FishKind = 'koi' | 'funa' | 'loach'

function bodyProfile(
  shape: readonly (readonly [number, number])[],
  length: number,
  maxR: number,
): Vector2[] {
  const radius = monotoneCubic(shape)
  // Extra samples at the lips keep the rounded snout from ending in a long cone.
  const samples = [...Array.from({ length: 25 }, (_, i) => i / 25), 0.98, 0.99, 1]
  return samples.map((u) => new Vector2(Math.max(0, radius(u)) * maxR, u * length))
}

/** Curved fin membrane with a swept outline, a little camber, and rays converging at its root.
 *  The atlas strip carries the rays; vertex alpha thins toward the scalloped trailing edge. */
function finMembrane(
  base: Vector3,
  outline: Vector3[],
  camber: Vector3,
  segments = 8,
): BufferGeometry {
  const edge = new CatmullRomCurve3(outline, false, 'centripetal')
  const rings = 3
  const positions: number[] = []
  const uvs: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  for (let r = 0; r <= rings; r++) {
    const v = r / rings
    for (let i = 0; i <= segments; i++) {
      const u = i / segments
      const p = edge.getPoint(u).multiplyScalar(v).add(base)
      p.addScaledVector(camber, Math.sin(v * Math.PI) * Math.sin(u * Math.PI))
      positions.push(p.x, p.y, p.z)
      uvs.push(0.02 + u * 0.7, 0.02 + v * 0.2)
      colors.push(1, 1, 1, 1 - 0.62 * v * v)
      if (r < rings && i < segments) {
        const a = r * (segments + 1) + i
        const b = a + segments + 1
        indices.push(a, b, a + 1, a + 1, b, b + 1)
      }
    }
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geo.setAttribute('color', new BufferAttribute(new Float32Array(colors), 4))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/** Small anatomical details sample solid atlas swatches, preserving one material per species. */
function detailSwatch(geo: BufferGeometry, u: number, v = 0.1): BufferGeometry {
  const count = geo.attributes.position?.count ?? 0
  const uv = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    uv[i * 2] = u
    uv[i * 2 + 1] = v
  }
  geo.setAttribute('uv', new BufferAttribute(uv, 2))
  geo.setAttribute('color', new BufferAttribute(new Float32Array(count * 4).fill(1), 4))
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

/** Rounded body, swept fins, eyes, lips and gill seams share one instanced geometry and atlas. */
function buildFishGeometry(sp: SpeciesTuning, kind: FishKind): BufferGeometry {
  const L = sp.length
  const R = sp.maxR
  const profile = bodyProfile(sp.shape, L, R)
  const radiusAt = monotoneCubic(sp.shape)
  const body = new LatheGeometry(profile, sp.radialSegments)
  body.scale(sp.squashX, 1, 1)
  const bodyVerts = body.attributes.position?.count ?? 0
  const bodyColor = new Float32Array(bodyVerts * 4).fill(1)
  body.setAttribute('color', new BufferAttribute(bodyColor, 4))
  const bodyUv = body.attributes.uv
  if (bodyUv) for (let i = 0; i < bodyUv.count; i++) bodyUv.setY(i, 0.25 + bodyUv.getY(i) * 0.75)
  const pieces: BufferGeometry[] = [body]
  const fork = kind === 'loach' ? 0.21 : 0.12
  pieces.push(
    finMembrane(
      new Vector3(0, 0.025 * L, 0),
      [
        new Vector3(0, -0.008 * L, -0.18 * R),
        new Vector3(0, -0.1 * L, -0.95 * R),
        new Vector3(0, -0.22 * L, -1.2 * R),
        new Vector3(0, -0.2 * L, -0.65 * R),
        new Vector3(0, -fork * L, 0),
        new Vector3(0, -0.2 * L, 0.65 * R),
        new Vector3(0, -0.22 * L, 1.2 * R),
        new Vector3(0, -0.1 * L, 0.95 * R),
        new Vector3(0, -0.008 * L, 0.18 * R),
      ],
      new Vector3(R * 0.14, 0, 0),
      12,
    ),
  )
  for (const side of [-1, 1]) {
    pieces.push(
      finMembrane(
        new Vector3(side * R * sp.squashX * 0.83, 0.69 * L, -R * 0.24),
        [
          new Vector3(side * R * 0.12, 0.015 * L, R * 0.1),
          new Vector3(side * R * 0.75, -0.025 * L, -R * 0.1),
          new Vector3(side * R * 1.18, -0.09 * L, -R * 0.35),
          new Vector3(side * R * 0.8, -0.15 * L, -R * 0.32),
          new Vector3(0, -0.14 * L, -R * 0.04),
        ],
        new Vector3(0, 0, -R * 0.14),
      ),
      finMembrane(
        new Vector3(side * R * sp.squashX * 0.64, 0.34 * L, -R * 0.5),
        [
          new Vector3(0, 0.025 * L, 0),
          new Vector3(side * R * 0.62, -0.025 * L, -R * 0.36),
          new Vector3(side * R * 0.5, -0.09 * L, -R * 0.42),
          new Vector3(0, -0.09 * L, 0),
        ],
        new Vector3(0, 0, -R * 0.08),
        6,
      ),
    )

    const headR = radiusAt(0.87) * R
    const eyeR = R * 0.115
    const eyePos = new Vector3(side * headR * sp.squashX * 0.97, 0.87 * L, headR * 0.28)
    const eye = new SphereGeometry(eyeR, 8, 6)
    eye.scale(0.6, 1, 1)
    eye.translate(eyePos.x, eyePos.y, eyePos.z)
    const pupil = new SphereGeometry(eyeR, 8, 4)
    pupil.scale(0.24, 0.63, 0.7)
    pupil.translate(eyePos.x + side * eyeR * 0.52, eyePos.y + eyeR * 0.08, eyePos.z)
    pieces.push(detailSwatch(eye, 0.8125), detailSwatch(pupil, 0.895))

    const gillPoints = Array.from({ length: 7 }, (_, i) => {
      const a = -0.9 + (i / 6) * 2.05
      const fy = 0.735 + 0.035 * Math.abs(Math.sin(a))
      const r = radiusAt(fy) * R * 1.012
      return new Vector3(side * Math.cos(a) * r * sp.squashX, fy * L, Math.sin(a) * r)
    })
    pieces.push(
      detailSwatch(
        new TubeGeometry(new CatmullRomCurve3(gillPoints), 8, R * 0.009, 4, false),
        0.966,
      ),
    )
  }
  pieces.push(
    finMembrane(
      new Vector3(0, 0.5 * L, R * 0.7),
      [
        new Vector3(0, -0.27 * L, -R * 0.06),
        new Vector3(0, -0.14 * L, R * 0.48),
        new Vector3(0, 0.025 * L, R * 0.72),
        new Vector3(0, 0.15 * L, R * 0.9),
        new Vector3(0, 0.24 * L, R * 0.04),
      ],
      new Vector3(R * 0.08, 0, 0),
    ),
    finMembrane(
      new Vector3(0, 0.26 * L, -R * 0.64),
      [
        new Vector3(0, -0.13 * L, R * 0.2),
        new Vector3(0, -0.09 * L, -R * 0.58),
        new Vector3(0, 0.025 * L, -R * 0.58),
        new Vector3(0, 0.095 * L, -R * 0.04),
      ],
      new Vector3(R * 0.06, 0, 0),
      6,
    ),
  )
  const lips = new TorusGeometry(R * 0.105, R * 0.024, 4, 12)
  lips.rotateX(Math.PI / 2)
  lips.scale(1, 1, 0.7)
  lips.translate(0, L * 0.997, -R * 0.025)
  const mouth = new CircleGeometry(R * 0.085, 12)
  mouth.rotateX(Math.PI / 2)
  mouth.scale(1, 1, 0.7)
  mouth.translate(0, L * 0.999, -R * 0.025)
  pieces.push(detailSwatch(lips, 0.8125, 0.1875), detailSwatch(mouth, 0.895))

  const merged = mergeGeometries(pieces, false)
  if (!merged) throw new Error('fish geometry merge failed')
  for (const piece of pieces) piece.dispose()
  return merged
}

/* ---------------------------- albedo ---------------------------- */

function fishAlbedo(kind: FishKind, seed: number, mudColor: string): CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const tex = new CanvasTexture(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return tex
  const rnd = mulberry32(seed)
  const bodyHeight = size * 0.75
  ctx.fillStyle = kind === 'koi' ? '#ece5d4' : kind === 'funa' ? '#959780' : mudColor
  ctx.fillRect(0, 0, size, size)
  if (kind === 'koi') {
    // Overlapping soft-edged islands give the koi an irregular patch boundary.
    for (let i = 0; i < 5; i++) {
      const cx = 22 + rnd() * (size - 44)
      const cy = 12 + rnd() * (bodyHeight - 24)
      const radius = 18 + rnd() * 25
      for (let lobe = 0; lobe < 3; lobe++) {
        const x = cx + (rnd() - 0.5) * radius
        const y = cy + (rnd() - 0.5) * radius
        const r = radius * (0.65 + rnd() * 0.35)
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, '#bc5030')
        g.addColorStop(0.88, '#bc5030')
        g.addColorStop(1, 'rgba(188, 80, 48, 0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.ellipse(x, y, r, r * 0.78, rnd() * Math.PI, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  } else if (kind === 'loach') {
    ctx.fillStyle = 'rgba(35, 26, 18, 0.45)'
    for (let i = 0; i < 34; i++) {
      const x = rnd() * size
      const y = rnd() * bodyHeight
      const r = 2 + rnd() * 4.5
      ctx.beginPath()
      ctx.ellipse(x, y, r, r * 0.7, rnd() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // Lathe U wraps the body: dorsal at the seam, lighter belly halfway around.
  const countershade = ctx.createLinearGradient(0, 0, size, 0)
  countershade.addColorStop(0, 'rgba(23, 39, 29, 0.28)')
  countershade.addColorStop(0.24, 'rgba(23, 39, 29, 0)')
  countershade.addColorStop(0.5, 'rgba(255, 241, 204, 0.2)')
  countershade.addColorStop(0.76, 'rgba(23, 39, 29, 0)')
  countershade.addColorStop(1, 'rgba(23, 39, 29, 0.28)')
  ctx.fillStyle = countershade
  ctx.fillRect(0, 0, size, bodyHeight)
  if (kind !== 'loach') {
    ctx.lineWidth = 0.65
    for (let row = 0; row < 19; row++) {
      for (let col = 0; col < 30; col++) {
        const x = col * 9 + (row % 2) * 4.5
        const y = 40 + row * 7.5
        ctx.strokeStyle = 'rgba(35, 46, 35, 0.13)'
        ctx.beginPath()
        ctx.ellipse(x, y, 4.3, 4.5, 0, 0.05, Math.PI - 0.05)
        ctx.stroke()
        ctx.strokeStyle = 'rgba(248, 245, 218, 0.13)'
        ctx.beginPath()
        ctx.ellipse(x, y - 0.8, 4.2, 4.4, 0, 0.1, Math.PI - 0.1)
        ctx.stroke()
      }
    }
  }
  // The lower atlas strip supplies translucent fin rays and solid eye/gill/lip swatches.
  const fin = ctx.createLinearGradient(0, 196, 0, 256)
  fin.addColorStop(0, kind === 'loach' ? '#776951' : '#aeb7a4')
  fin.addColorStop(1, kind === 'loach' ? '#68543c' : '#d8cfb5')
  ctx.fillStyle = fin
  ctx.fillRect(0, 194, 194, 62)
  ctx.lineWidth = 1.05
  ctx.strokeStyle = 'rgba(54, 66, 47, 0.3)'
  for (let x = 4; x < 194; x += 12) {
    ctx.beginPath()
    ctx.moveTo(x, 256)
    ctx.quadraticCurveTo(x + 1.5, 222, x - 1, 194)
    ctx.stroke()
  }
  for (const [x, y, color] of [
    [200, 224, '#a79968'],
    [222, 224, '#101b18'],
    [240, 224, kind === 'loach' ? '#433e2d' : '#686d58'],
    [200, 200, kind === 'loach' ? '#b3a17c' : '#ccb899'],
  ] as const) {
    ctx.fillStyle = color
    ctx.fillRect(x, y, 16, 20)
  }
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
  radialSegments: 16,
  k: (2 * Math.PI) / 0.6,
  ampGlide: 0.013,
  ampBurst: 0.052,
}
const FUNA_TUNING: SpeciesTuning = {
  length: 0.3,
  maxR: 0.085,
  squashX: 0.58,
  shape: FUNA_SHAPE,
  radialSegments: 14,
  k: (2 * Math.PI) / 0.32,
  ampGlide: 0.009,
  ampBurst: 0.032,
}
const LOACH_TUNING: SpeciesTuning = {
  length: 0.35,
  maxR: 0.032,
  squashX: 0.88,
  shape: LOACH_SHAPE,
  radialSegments: 10,
  k: (2 * Math.PI) / 0.15,
  ampGlide: 0,
  ampBurst: 0.026,
}

const KOI_LOOPS: readonly (readonly [number, number, number, number, number, number])[] = [
  [-3, -1.5, -26, 6, 8, 0.65],
  // Keep the rear lane ahead of the final camera and inside the deep pool's far rim.
  [0, -1.4, -39, 2.7, 1.8, 0.45],
]
const FUNA_SCHOOL_CENTERS: readonly (readonly [number, number, number])[] = [
  [-9, -0.8, -22],
  [9, -0.75, -30],
  [-5, -0.85, -36],
  [4, -0.8, -38],
]

function buildSpecies(
  tuning: SpeciesTuning,
  count: number,
  mudColor: string,
  kind: FishKind,
  seed: number,
): { mesh: InstancedMesh; waveArr: Float32Array; waveAttr: InstancedBufferAttribute } {
  const geo = buildFishGeometry(tuning, kind)
  const mat = new MeshStandardMaterial({
    map: fishAlbedo(kind, seed, mudColor),
    roughness: kind === 'koi' ? 0.36 : kind === 'funa' ? 0.43 : 0.46,
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
    const curve = loopLane(rnd, c[0], c[1], c[2], 3 + rnd(), (sIdx < 2 ? 4 : 2.5) + rnd(), 0.35)
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
    const cx = -12 + rnd() * 24
    const cz = -22 - rnd() * 16
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
