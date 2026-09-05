import type { SceneState, StageSize } from '../scene/types'

export interface Fx {
  resize(size: StageSize): void
  /** Called every frame; `time` and `dt` come from the director (frozen time = static). */
  update(state: SceneState): void
}
