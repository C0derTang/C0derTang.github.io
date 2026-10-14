import {
  Matrix4,
  type Object3D,
  type PerspectiveCamera,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
} from 'three'
import { easeInOutCubic, lerp, lerpColor, smoothstep } from '../util/math'
import type { SceneState } from './state'
import type { Interactive, OpenState, Pickable } from './world/types'

/**
 * The opened view: a layer on top of the scroll frame, never part of `computeState`. It owns
 * `{ id, k }` on wall-clock time, picks with one raycaster, tells the world parts what is
 * hovered and open, flies the camera up to an opened banner and dims the room behind an opened
 * trophy. With nothing open `apply` hands back the state it was given and leaves the camera
 * alone, so a frame is exactly the scroll frame.
 */

export type Wall = Pickable['kind']

export interface FocusState {
  /** the object that is opening, open or closing */
  id: string | null
  /** eased openness, 0..1 */
  k: number
  kind: Wall | null
}

/** A rectangle on screen, in fractions of the viewport (may reach past its edges). */
export interface ScreenRect {
  left: number
  top: number
  width: number
  height: number
}

interface Paper {
  center: Vector3
  normal: Vector3
  width: number
  height: number
  /** the whole banner, mount included: same plane and normal */
  outer: { center: Vector3; width: number; height: number }
}

/**
 * How an opened banner is framed. `over`: the paper covers the screen and the text sits on it
 * (tall, narrow screens). `beside`: the whole banner stands left of centre in a dimmed room and
 * the text sits to its right (everything else).
 */
export type BannerLayout = 'over' | 'beside'

export interface FocusExtras {
  /** the bare-paper rectangle of a banner, world space */
  paper(id: string): Paper | null
  reducedMotion: boolean
}

export interface Focus {
  /** The object under a point of the viewport; `pad` (px) also tries a ring around it. */
  pick(clientX: number, clientY: number, pad?: number): Pickable | null
  hover(id: string | null): void
  /** Opens an object of the wall on screen (after closing whatever is open). */
  open(id: string): boolean
  close(): void
  ids(wall: Wall): readonly string[]
  /** Once per frame: after the camera is set from the scroll pose, before the parts update. */
  apply(state: SceneState): SceneState
  readonly state: FocusState
  /** the object that is open or about to be; null once a close has begun */
  readonly opening: string | null
  /** the wall whose objects can be picked at this `t`, if any */
  readonly wall: Wall | null
  readonly active: boolean
  /** where the open banner is on screen: its paper (`over`) or the whole of it (`beside`) */
  readonly paperRect: ScreenRect | null
  /** how the open banner is framed; null when none is open */
  readonly layout: BannerLayout | null
}

const OPEN_MS = 900
const CLOSE_MS = 600
/** The turn faces the banners at yaw 90 and the trophy case at yaw 270 (`faces` in camera.ts). */
const WALL_YAW: Record<Wall, number> = { banner: 90, trophy: 270 }
/** Pickable from when the wall is mostly facing the camera until the turn leaves it. */
const YAW_MARGIN = 25
/** A scroll that moves this far in `t` under an open object closes it. */
const DRIFT = 2e-3
/** `over` shows a little less than the paper, so no mount or wall shows at an edge. */
const COVER = 0.96
/**
 * Covering the screen with a 0.5 m paper only reads on a tall, narrow screen. From this aspect
 * up it would crop over two fifths of the paper's height and magnify the rest, so the banner is
 * shown whole instead.
 */
const BESIDE_ASPECT = 0.75
/** `beside`: the banner's share of the viewport height, and where its centre sits across it. */
const BESIDE_FILL = 0.9
const BESIDE_X = 0.34
/**
 * `beside` ends with the camera to the right of the banner's axis. The sidestep is capped (m)
 * and taken over the last of the approach, so the camera walks in on the axis, clear of the
 * doma post beside the first banner, and only then slides across.
 */
const BESIDE_SHIFT_MAX = 0.46
const BESIDE_SHIFT_FROM = 0.72
/** Where the opened trophy hovers (`HOVER_DIST` in world/trophies.ts). */
const TROPHY_DISTANCE = 0.9
const DIM = { lamp: 0.3, sky: 0.35, sun: 0.35, vignette: 0.82, tint: '#4a4038', strength: 0.5 }
/** A banner stands off centre and near full height: a lighter vignette keeps its ends lit. */
const BANNER_VIGNETTE = 0.55
/**
 * The room behind a trophy dims once the trophy is off the shelf (not with the first of its
 * lift) and brightens along its whole way home, bright again as it lands: `k` through
 * `TROPHY_DIM_OPEN` while opening, `TROPHY_DIM_CLOSE` while closing.
 */
const TROPHY_DIM_OPEN = (k: number): number => smoothstep(0.3, 1, k)
const TROPHY_DIM_CLOSE = (k: number): number => smoothstep(0, 1, k)
const UP = new Vector3(0, 1, 0)

export function createFocus(
  camera: PerspectiveCamera,
  parts: readonly Interactive[],
  extras: FocusExtras,
): Focus {
  const pickables = parts.flatMap((p) => p.pickables)
  const byObject = new Map<Object3D, Pickable>(pickables.map((p) => [p.object, p]))
  const byId = new Map<string, Pickable>(pickables.map((p) => [p.id, p]))
  const targets: Record<Wall, Object3D[]> = { banner: [], trophy: [] }
  for (const p of pickables) targets[p.kind].push(p.object)

  const raycaster = new Raycaster()
  const ndc = new Vector2()

  let wall: Wall | null = null
  let id: string | null = null
  let kind: Wall | null = null
  /** 1 while opening or open, 0 while closing */
  let goal: 0 | 1 = 0
  /** linear progress of the tween; `k` is its eased value */
  let p = 0
  let k = 0
  let last = 0
  let began = 0
  /** the scroll position it was opened at */
  let openT: number | null = null
  let queued: string | null = null
  let paperRect: ScreenRect | null = null
  let layout: BannerLayout | null = null
  /** Every object opened this page load (not kept across reloads): the parts stop its pulse. */
  const visited = new Set<string>()
  /**
   * The trophy dim's direction and where it turned: the curve for the new direction is rescaled
   * to start from the dim it had, so a reversal mid-flight never jumps.
   */
  let dimGoal: 0 | 1 = 0
  let dimFrom = 0
  let dimK = 0
  let dimNow = 0

  const from = new Vector3()
  const fromQ = new Quaternion()
  const to = new Vector3()
  const toQ = new Quaternion()
  const look = new Matrix4()
  const side = new Vector3()
  const right = new Vector3()
  const ahead = new Vector3()
  const corner = new Vector3()

  function begin(next: Pickable): void {
    id = next.id
    kind = next.kind
    goal = 1
    p = extras.reducedMotion ? 1 : 0
    k = p
    last = began = performance.now()
    openT = null
    visited.add(next.id)
    dimGoal = 1
    dimFrom = 0
    dimK = 0
  }

  /** The trophy dim for this `k`, continuous across a reversal of the tween. */
  function trophyDim(): number {
    if (goal !== dimGoal) {
      dimGoal = goal
      dimFrom = dimNow
      dimK = k
    }
    if (extras.reducedMotion) return (dimNow = goal)
    if (goal === 1) {
      const a = TROPHY_DIM_OPEN(dimK)
      const span = 1 - a
      dimNow = span > 0 ? dimFrom + ((1 - dimFrom) * (TROPHY_DIM_OPEN(k) - a)) / span : 1
    } else {
      const a = TROPHY_DIM_CLOSE(dimK)
      dimNow = a > 0 ? (dimFrom * TROPHY_DIM_CLOSE(k)) / a : 0
    }
    return (dimNow = Math.min(1, Math.max(0, dimNow)))
  }

  function setOpen(open: OpenState | null): void {
    for (const part of parts) {
      const mine = open !== null && part.pickables.some((x) => x.id === open.id)
      part.setOpen(mine ? open : null, camera)
    }
  }

  /**
   * Blend the camera from the scroll pose to a pose square to the banner: its paper covering
   * the screen (`over`), or the whole of it left of centre (`beside`).
   */
  function flyTo(paper: Paper): number {
    const half = Math.tan((camera.fov * Math.PI) / 360)
    const beside = camera.aspect >= BESIDE_ASPECT
    layout = beside ? 'beside' : 'over'
    const frame = beside ? paper.outer : paper
    let distance: number
    let shift = 0
    if (beside) {
      distance = frame.height / (BESIDE_FILL * 2 * half)
      // A point `shift` to the camera's left lands at NDC x = -shift / (distance half aspect).
      shift = Math.min(BESIDE_SHIFT_MAX, (1 - 2 * BESIDE_X) * distance * half * camera.aspect)
    } else {
      const shown = Math.min(paper.height, paper.width / camera.aspect) * COVER
      distance = Math.max(camera.near * 2, shown / (2 * half))
    }
    // The camera's right once it faces the wall.
    right.crossVectors(UP, paper.normal).normalize()
    from.copy(camera.position)
    fromQ.copy(camera.quaternion)
    // On the banner's axis first; the end pose is `shift` to the right of that.
    to.copy(frame.center).addScaledVector(paper.normal, distance)
    ahead.copy(to).addScaledVector(right, shift)
    corner.copy(ahead).sub(paper.normal)
    toQ.setFromRotationMatrix(look.lookAt(ahead, corner, UP))
    // Step across to face the banner first, then go in: the straight line from the hold would
    // graze the post that stands between the camera and this wall.
    const along = to.sub(from).dot(paper.normal)
    side.copy(to).addScaledVector(paper.normal, -along)
    const approach = k ** 1.5
    camera.position
      .copy(from)
      .addScaledVector(side, 1 - (1 - k) * (1 - k))
      .addScaledVector(paper.normal, along * approach)
    if (shift > 0)
      camera.position.addScaledVector(right, shift * smoothstep(BESIDE_SHIFT_FROM, 1, approach))
    camera.quaternion.slerpQuaternions(fromQ, toQ, k)
    camera.updateMatrixWorld()

    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const sx of [-0.5, 0.5])
      for (const sy of [-0.5, 0.5]) {
        corner
          .copy(frame.center)
          .addScaledVector(right, sx * frame.width)
          .addScaledVector(UP, sy * frame.height)
          .project(camera)
        x0 = Math.min(x0, corner.x)
        x1 = Math.max(x1, corner.x)
        y0 = Math.min(y0, corner.y)
        y1 = Math.max(y1, corner.y)
      }
    paperRect = {
      left: (x0 + 1) / 2,
      top: (1 - y1) / 2,
      width: (x1 - x0) / 2,
      height: (y1 - y0) / 2,
    }
    return distance
  }

  /** The room steps back behind what is open: lamps, sky and sun down, a darker grade. */
  function dim(state: SceneState, amount: number, vignette = DIM.vignette): SceneState {
    const g = state.grade
    return {
      ...state,
      lamp: state.lamp * lerp(1, DIM.lamp, amount),
      sky: state.sky * lerp(1, DIM.sky, amount),
      sun: { ...state.sun, intensity: state.sun.intensity * lerp(1, DIM.sun, amount) },
      grade: {
        tint: lerpColor(g.tint, DIM.tint, amount),
        strength: lerp(g.strength, DIM.strength, amount),
        vignette: lerp(g.vignette, vignette, amount),
        saturation: g.saturation,
      },
    }
  }

  return {
    pick(clientX, clientY, pad = 0) {
      if (!wall) return null
      const objects = targets[wall]
      const cast = (x: number, y: number): Pickable | null => {
        ndc.set((x / window.innerWidth) * 2 - 1, 1 - (y / window.innerHeight) * 2)
        raycaster.setFromCamera(ndc, camera)
        const hit = raycaster.intersectObjects(objects, false)[0]
        return hit ? (byObject.get(hit.object) ?? null) : null
      }
      const direct = cast(clientX, clientY)
      if (direct || pad <= 0) return direct
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4
        const near = cast(clientX + Math.cos(a) * pad, clientY + Math.sin(a) * pad)
        if (near) return near
      }
      return null
    },
    hover(next) {
      for (const part of parts) part.setHover(next)
    },
    open(next) {
      const target = byId.get(next)
      if (target?.kind !== wall || wall === null) return false
      if (id === null) begin(target)
      else if (id === next) {
        goal = 1
        queued = null
      } else {
        queued = next
        goal = 0
      }
      return true
    },
    close() {
      queued = null
      goal = 0
    },
    ids(w) {
      return pickables.filter((x) => x.kind === w).map((x) => x.id)
    },
    apply(state) {
      const yaw = state.pose.yaw
      wall =
        state.beat !== 'turn'
          ? null
          : Math.abs(yaw - WALL_YAW.banner) <= YAW_MARGIN
            ? 'banner'
            : Math.abs(yaw - WALL_YAW.trophy) <= YAW_MARGIN
              ? 'trophy'
              : null
      for (const part of parts) part.setVisited(visited)
      if (id === null) return state

      const now = performance.now()
      if (openT === null) openT = state.t
      else if (Math.abs(state.t - openT) > DRIFT) {
        queued = null
        goal = 0
      }
      const dt = now - last
      last = now
      if (extras.reducedMotion) p = goal
      else p = Math.min(1, Math.max(0, p + (goal === 1 ? dt / OPEN_MS : -dt / CLOSE_MS)))
      k = easeInOutCubic(p)

      if (goal === 0 && p === 0) {
        // Closed: this frame is the scroll frame again.
        const next = queued ? byId.get(queued) : undefined
        queued = null
        paperRect = null
        layout = null
        if (next?.kind === wall) {
          begin(next)
          if (k === 0) {
            setOpen(null)
            return state
          }
        } else {
          id = null
          kind = null
          setOpen(null)
          return state
        }
      }

      const f = state.focus
      if (kind === 'banner') {
        const paper = extras.paper(id)
        if (!paper) return state
        const distance = flyTo(paper)
        setOpen({ id, k, since: now - began })
        const flown: SceneState = {
          ...state,
          focus: {
            distance: lerp(f.distance, distance, k),
            range: lerp(f.range, 1, k),
            bokeh: f.bokeh * (1 - k),
          },
        }
        // A paper that covers the screen has no room left to dim.
        return layout === 'beside' ? dim(flown, k, BANNER_VIGNETTE) : flown
      }
      setOpen({ id, k, since: now - began })
      return dim(
        {
          ...state,
          focus: {
            distance: lerp(f.distance, TROPHY_DISTANCE, k),
            range: lerp(f.range, 0.5, k),
            bokeh: lerp(f.bokeh, f.bokeh + 2, k),
          },
        },
        trophyDim(),
      )
    },
    get state() {
      return { id, k, kind }
    },
    get opening() {
      return queued ?? (goal === 1 ? id : null)
    },
    get wall() {
      return wall
    },
    get active() {
      return wall !== null
    },
    get paperRect() {
      return paperRect
    },
    get layout() {
      return layout
    },
  }
}
