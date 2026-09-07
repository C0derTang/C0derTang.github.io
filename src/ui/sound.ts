import { mustGet } from '../util/dom'

export interface SoundControl {
  setState(enabled: boolean, pending?: boolean): void
  unavailable(): void
  destroy(): void
}

/** Audio owns the confirmed state; this control preserves the click's user-activation context. */
export function createSoundControl(
  onToggle: () => Promise<void>,
  onVolume: (volume: number) => void,
): SoundControl {
  const root = mustGet('[data-ui="sound"]')
  const toggle = mustGet<HTMLButtonElement>('[data-ui="sound-toggle"]', root)
  const label = mustGet('[data-ui="sound-label"]', root)
  const volumeWrap = mustGet('#sound-volume', root)
  const volume = mustGet<HTMLInputElement>('[data-ui="sound-volume"]', root)
  const status = mustGet('[data-ui="sound-status"]', root)
  let enabled = false
  let pending = false
  let requestPending = false
  let available = true
  let destroyed = false
  let request = 0
  let level = 45

  function render(): void {
    const busy = pending || requestPending
    const text = enabled ? 'Mute sound' : 'Enable sound'
    root.hidden = !available
    root.dataset.enabled = String(enabled)
    toggle.disabled = !available
    toggle.setAttribute('aria-pressed', String(enabled))
    toggle.setAttribute('aria-busy', String(busy))
    // Keep keyboard focus on the button while an asynchronous audio request settles.
    toggle.setAttribute('aria-disabled', String(busy || !available))
    toggle.setAttribute('aria-label', text)
    label.textContent = text
    volumeWrap.hidden = !enabled || !available
    volume.disabled = !enabled || !available || busy
    volume.value = String(level)
    volume.setAttribute('aria-valuetext', `${level}%`)
  }

  function settled(id: number, failed = false): void {
    if (destroyed || !available || id !== request) return
    requestPending = false
    pending = false
    render()
    if (failed) status.textContent = 'Sound couldn’t be changed. Try again.'
  }

  function handleToggle(): void {
    if (destroyed || !available || pending || requestPending) return
    const id = ++request
    status.textContent = ''
    requestPending = true
    render()
    try {
      // Invoke synchronously: deferring this callback can lose AudioContext user activation.
      void onToggle().then(
        () => settled(id),
        () => settled(id, true),
      )
    } catch {
      settled(id, true)
    }
  }

  function handleVolume(): void {
    if (destroyed || !available || !enabled || pending || requestPending) return
    const next = Math.round(Math.min(100, Math.max(0, volume.valueAsNumber)))
    if (!Number.isFinite(next)) return
    status.textContent = ''
    try {
      onVolume(next / 100)
      level = next
    } catch {
      status.textContent = 'The volume couldn’t be changed. Try again.'
    }
    render()
  }

  function unavailable(): void {
    if (destroyed) return
    available = false
    enabled = false
    pending = false
    requestPending = false
    request++
    status.textContent = ''
    render()
  }

  toggle.addEventListener('click', handleToggle)
  volume.addEventListener('input', handleVolume)
  render()

  return {
    setState(nextEnabled, nextPending = false) {
      if (destroyed || !available) return
      if (!nextEnabled && document.activeElement === volume) toggle.focus()
      enabled = nextEnabled
      pending = nextPending
      render()
    },
    unavailable,
    destroy() {
      if (destroyed) return
      unavailable()
      destroyed = true
      toggle.removeEventListener('click', handleToggle)
      volume.removeEventListener('input', handleVolume)
    },
  }
}
