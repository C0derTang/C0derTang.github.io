import type { Group, Object3D, PerspectiveCamera } from 'three'
import type { SceneState } from '../state'

/** One part of the world: a group added to the scene and an optional per-frame hook (writes only). */
export interface WorldPart {
  group: Group
  update?(state: SceneState): void
}

/** Something a click can open: a banner or a trophy, and the object the ray is tested against. */
export interface Pickable {
  id: string
  kind: 'banner' | 'trophy'
  object: Object3D
}

/** The opened object: `k` is its eased openness (0..1), `since` the ms since it began opening. */
export interface OpenState {
  id: string
  k: number
  since: number
}

/** A world part with pickable objects. The focus layer calls these before `update` each frame. */
export interface Interactive {
  readonly pickables: readonly Pickable[]
  setHover(id: string | null): void
  setOpen(open: OpenState | null, camera: PerspectiveCamera): void
  /** Ids opened at least once this page load: these stop pulsing and hold a steady low glow. */
  setVisited(ids: ReadonlySet<string>): void
}
