import type { SceneState } from '../three/state'
import { createSoundBuffers } from './buffers'
import { computeSoundMix, SOUND_LAYERS, type SoundLayer, type SoundMix } from './mix'

export interface SoundStatus {
  enabled: boolean
  volume: number
  contextState: AudioContextState | 'uninitialized'
  active: boolean
  paused: boolean
  sourceCount: number
  contextCount: number
  mix: SoundMix | null
}

export interface Soundscape {
  update(state: SceneState): void
  setEnabled(enabled: boolean): Promise<void>
  setVolume(volume: number): void
  setPaused(paused: boolean): void
  dispose(): void
  /**
   * Fetch and prepare the loops; resolves false when recorded audio is unavailable. Enabling
   * sound calls this itself, so calling it earlier only spares the first click the wait.
   */
  load(): Promise<boolean>
  readonly enabled: boolean
  readonly status: SoundStatus
}

/**
 * Nothing is fetched or decoded until `load()` or the first enable, so sound never holds the
 * curtain; the live context is created only by the sound button.
 */
export function createSoundscape(onEnabledChange: (enabled: boolean) => void): Soundscape | null {
  if (typeof AudioContext === 'undefined' || typeof OfflineAudioContext === 'undefined') return null
  let offline: OfflineAudioContext
  try {
    offline = new OfflineAudioContext(2, 1, 32000)
  } catch {
    return null
  }
  let buffers: Record<SoundLayer, AudioBuffer> | null = null
  let loading: Promise<boolean> | null = null
  let loadAbort: AbortController | null = null
  const gains = new Map<SoundLayer, GainNode>()
  const targets = new WeakMap<AudioParam, number>()
  let context: AudioContext | null = null
  let filter: BiquadFilterNode | null = null
  let master: GainNode | null = null
  let sources: AudioBufferSourceNode[] = []
  let enabled = false
  let volume = 0.45
  let frozen = false
  let pageHidden = false
  let disposed = false
  let resync = true
  let revision = 0
  let loadTimer: ReturnType<typeof setTimeout> | undefined
  let suspendTimer: ReturnType<typeof setTimeout> | undefined
  let mix: SoundMix | null = null

  const paused = () => frozen || document.hidden || pageHidden
  const shouldRun = () => enabled && !paused() && !disposed

  function target(param: AudioParam, value: number, smoothing = 0.12): void {
    if (!context || Math.abs((targets.get(param) ?? -Infinity) - value) < 0.0001) return
    const now = context.currentTime
    const current = param.value
    // Replace automation instead of accumulating a new event on every rendered frame.
    param.cancelScheduledValues(0)
    param.setValueAtTime(current, now)
    param.setTargetAtTime(value, now, smoothing)
    targets.set(param, value)
  }

  function stopSources(): void {
    for (const source of sources) {
      source.stop()
      source.disconnect()
    }
    sources = []
  }

  function makeContext(): AudioContext {
    if (context) return context
    context = new AudioContext({ latencyHint: 'playback' })
    filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 0.5
    filter.frequency.value = mix?.lowpassHz ?? 16000
    master = context.createGain()
    master.gain.value = 0
    filter.connect(master)
    master.connect(context.destination)
    for (const layer of SOUND_LAYERS) {
      const gain = context.createGain()
      gain.gain.value = 0
      gain.connect(filter)
      gains.set(layer, gain)
    }
    return context
  }

  function clearSuspend(): void {
    clearTimeout(suspendTimer)
    suspendTimer = undefined
  }

  function silence(): void {
    revision++
    resync = true
    clearSuspend()
    if (!context || !master || context.state === 'closed') return
    const ctx = context
    const now = ctx.currentTime
    const current = master.gain.value
    master.gain.cancelScheduledValues(0)
    master.gain.setValueAtTime(current, now)
    master.gain.linearRampToValueAtTime(0, now + 0.06)
    targets.delete(master.gain)
    // Only this short lifecycle timer runs outside the director; no audio polling loop.
    suspendTimer = setTimeout(() => {
      if (!shouldRun() && ctx.state !== 'closed') void ctx.suspend().catch(() => undefined)
    }, 100)
  }

  async function resume(): Promise<void> {
    const ctx = makeContext()
    clearSuspend()
    const request = ++revision
    resync = true
    try {
      // Invoke before the first await, preserving the original button's user activation.
      await ctx.resume()
      if (disposed || request !== revision) return
      if (!shouldRun()) silence()
    } catch (error) {
      if (disposed || request !== revision) return
      enabled = false
      silence()
      onEnabledChange(false)
      throw error
    }
  }

  function syncLifecycle(): void {
    if (!shouldRun()) silence()
    else void resume().catch(() => undefined)
  }

  function onPageHide(event: PageTransitionEvent): void {
    if (!event.persisted) dispose()
    else {
      pageHidden = true
      syncLifecycle()
    }
  }

  function onPageShow(): void {
    pageHidden = false
    syncLifecycle()
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    enabled = false
    revision++
    loadAbort?.abort()
    clearTimeout(loadTimer)
    loadTimer = undefined
    buffers = null
    clearSuspend()
    stopSources()
    for (const gain of gains.values()) gain.disconnect()
    gains.clear()
    filter?.disconnect()
    master?.disconnect()
    if (context && context.state !== 'closed') void context.close().catch(() => undefined)
    document.removeEventListener('visibilitychange', syncLifecycle)
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('pageshow', onPageShow)
  }

  document.addEventListener('visibilitychange', syncLifecycle)
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow)

  function load(): Promise<boolean> {
    if (disposed) return Promise.resolve(false)
    if (loading) return loading
    const abort = new AbortController()
    loadAbort = abort
    // Fetch is cancellable; a decode already underway may finish later, so the result is rechecked.
    loadTimer = setTimeout(() => abort.abort(), 12000)
    const attempt = createSoundBuffers(offline, abort.signal)
      .then(
        (loaded) => {
          if (disposed || abort.signal.aborted) return false
          buffers = loaded
          return true
        },
        () => false,
      )
      .then((ok) => {
        clearTimeout(loadTimer)
        loadTimer = undefined
        abort.abort()
        // A failed attempt may be retried by the next enable.
        if (!ok && loading === attempt) loading = null
        return ok
      })
    loading = attempt
    return attempt
  }

  return {
    load,
    update(state) {
      if (disposed) return
      mix = computeSoundMix(state)
      if (!buffers || !shouldRun() || context?.state !== 'running' || !master || !filter) return
      if (resync) {
        stopSources()
        const start = context.currentTime + 0.02
        for (const layer of SOUND_LAYERS) {
          const gain = gains.get(layer)
          if (!gain) continue
          const source = context.createBufferSource()
          source.buffer = buffers[layer]
          source.loop = true
          source.connect(gain)
          source.start(start, (state.time / 1000 + 0.02) % buffers[layer].duration)
          sources.push(source)
        }
        resync = false
      }
      for (const layer of SOUND_LAYERS) {
        const gain = gains.get(layer)
        if (gain) target(gain.gain, mix.gains[layer], layer === 'door' ? 0.025 : 0.12)
      }
      target(filter.frequency, mix.lowpassHz, 0.08)
      target(master.gain, volume * mix.master, 0.06)
    },
    async setEnabled(next) {
      if (disposed) return
      enabled = next
      if (next) {
        try {
          // Resume first, synchronously, so the click's user activation is not lost to the fetch.
          const [, loaded] = await Promise.all([resume(), load()])
          if (!loaded) throw new Error('Recorded sound is unavailable')
        } catch (error) {
          if (disposed) return
          enabled = false
          silence()
          onEnabledChange(false)
          throw error
        }
        if (!enabled) return
      } else silence()
      if (!disposed) onEnabledChange(enabled)
    },
    setVolume(next) {
      if (Number.isFinite(next)) volume = Math.min(1, Math.max(0, next))
    },
    setPaused(next) {
      if (frozen === next || disposed) return
      frozen = next
      syncLifecycle()
    },
    dispose,
    get enabled() {
      return enabled
    },
    get status(): SoundStatus {
      return {
        enabled,
        volume,
        contextState: context?.state ?? 'uninitialized',
        active: shouldRun() && context?.state === 'running' && !resync,
        paused: paused(),
        sourceCount: sources.length,
        contextCount: context ? 1 : 0,
        mix,
      }
    },
  }
}
