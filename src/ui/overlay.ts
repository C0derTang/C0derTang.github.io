import { SLOTS } from '../config/beats'
import { mustGet, styleWrite } from '../util/dom'
import type { SceneState } from '../scene/types'

export function createOverlay(root: HTMLElement) {
  const slots = SLOTS.map((s) => ({ id: s.id, el: mustGet(`[data-slot="${s.id}"]`, root) }))
  const hint = mustGet('[data-ui="hint"]', root)
  return {
    update(state: SceneState) {
      for (const s of slots) {
        const o = state.slots[s.id]
        styleWrite(s.el, '--o', o.toFixed(3))
        styleWrite(s.el, 'visibility', o > 0.001 ? 'visible' : 'hidden')
      }
      styleWrite(hint, '--o', state.hint.toFixed(3))
      styleWrite(hint, 'visibility', state.hint > 0.001 ? 'visible' : 'hidden')
    },
  }
}
