/**
 * The shared beat the banners and trophies pulse on: a slow, even swell (it rises exactly as
 * fast as it falls) every `BEAT_MS`, as an envelope in 0..1 that is a closed form of
 * `state.time`. Every object reads the same clock with no offset, so the room pulses as one.
 */
const BEAT_MS = 1600

export function beat(time: number): number {
  return 0.5 - 0.5 * Math.cos((time / BEAT_MS) * Math.PI * 2)
}
