import { BEATS, SLOTS, local, type BeatId } from '../config/beats'
import { attrWrite, mustGet, styleWrite } from '../util/dom'
import type { SceneState } from '../three/state'

const LOCATIONS: Record<BeatId, string> = {
  exterior: 'Outside the farmhouse',
  enter: 'Across the threshold',
  turn: 'A moment of shelter',
  doors: 'Through the paper doors',
  paddy: 'Among the rice fields',
  dive: 'Beneath the surface',
  underwater: 'A world beneath',
}

export function createOverlay(root: HTMLElement) {
  const slots = SLOTS.map((s) => ({ id: s.id, el: mustGet(`[data-slot="${s.id}"]`, root) }))
  const hint = mustGet('[data-ui="hint"]', root)
  const journey = mustGet('[data-ui="journey"]', root)
  const chapter = mustGet('[data-ui="chapter"]', root)
  const location = mustGet('[data-ui="location"]', root)
  const progress = mustGet('[data-ui="progress"]', root)
  const chapters = [
    { id: 'exterior', range: [0, BEATS.enter[0]] },
    { id: 'interior', range: [BEATS.enter[0], BEATS.paddy[0]] },
    { id: 'paddy', range: [BEATS.paddy[0], BEATS.underwater[0]] },
    { id: 'underwater', range: [BEATS.underwater[0], 1] },
  ] as const
  const tracks = chapters.map((c) => ({ ...c, el: mustGet(`[data-chapter="${c.id}"]`, root) }))
  let lastBeat: BeatId | undefined
  let lastPercent = -1
  return {
    update(state: SceneState) {
      for (const s of slots) {
        const o = state.slots[s.id]
        styleWrite(s.el, '--o', o.toFixed(3))
        styleWrite(s.el, 'visibility', o > 0.001 ? 'visible' : 'hidden')
        if (s.el.inert !== o < 0.5) s.el.inert = o < 0.5
      }
      styleWrite(hint, '--o', state.hint.toFixed(3))
      styleWrite(hint, 'visibility', state.hint > 0.001 ? 'visible' : 'hidden')
      for (const track of tracks) {
        styleWrite(track.el, '--fill', local(state.t, track.range).toFixed(3))
      }
      const percent = Math.round(state.t * 100)
      if (lastBeat !== state.beat || lastPercent !== percent) {
        const index = chapters.findLastIndex((c) => state.t >= c.range[0])
        chapter.textContent = `0${index + 1} / 04`
        location.textContent = LOCATIONS[state.beat]
        progress.textContent = `${String(percent).padStart(2, '0')}%`
        attrWrite(journey, 'aria-valuenow', String(percent))
        attrWrite(journey, 'aria-valuetext', `${LOCATIONS[state.beat]}, ${percent}%`)
        lastBeat = state.beat
        lastPercent = percent
      }
    },
  }
}
