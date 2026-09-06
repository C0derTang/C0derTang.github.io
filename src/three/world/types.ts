import type { Group } from 'three'
import type { SceneState } from '../state'

/** One part of the world: a group added to the scene and an optional per-frame hook (writes only). */
export interface WorldPart {
  group: Group
  update?(state: SceneState): void
}
