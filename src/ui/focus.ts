// Type only (erased): the module itself is only ever fetched by the `import()` below.
import type * as ContentModule from '../config/content'
import type { BannerLayout, Focus, Wall } from '../three/focus'
import type { SceneState } from '../three/state'
import { clamp01 } from '../util/math'
import { attrWrite, mustGet, styleWrite } from '../util/dom'

type Content = typeof ContentModule

export interface FocusUi {
  /** Once per frame, after the scene has rendered. */
  update(state: SceneState): void
  open(id: string, opener?: HTMLElement | null): void
  close(): void
  /** Open this banner once the scroll has come to rest at `t` in front of it. */
  arrive(id: string, t: number): void
}

export interface FocusUiOptions {
  /** hold the scroll still while something is open */
  lock(on: boolean): void
  /** the scene is complete: a good moment to fetch the panel text */
  settled: Promise<unknown>
  /** whether the scroll is still headed for story position `t` (and not somewhere else) */
  headedFor(t: number): boolean
}

/** Things a click belongs to before it belongs to the room. */
const CONTROLS = 'a, button, input, select, textarea, label, dialog, .focus-card'
/** Keys that scroll the page, unless something focused takes them for itself. */
const SCROLL_KEYS = new Set([
  'PageUp',
  'PageDown',
  'Home',
  'End',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  ' ',
])
const KEY_TAKERS = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
const LABEL: Record<Wall, string> = { banner: 'Banner', trophy: 'Trophy' }
/** A press that travelled further than this (px) was a drag or a scroll, not a click. */
const SLOP = 8
/** Fingers get a ring of extra rays, so a target is at least 44 px across. */
const TOUCH_PAD = 22
const HINT_MS = 4500
const ARRIVE_MS = 12_000
const ARRIVE_T = 5e-4
/** The panel fades in over the last fifth of the opening. */
const PANEL_FROM = 0.8

/**
 * The DOM side of the opened view (`three/focus.ts` is the scene side): pointer and key input,
 * the hidden buttons, the hint, the panel and the scroll lock. Everything is driven from the
 * director's frame; nothing here schedules its own. The panel text comes from a chunk fetched
 * on demand (`config/content.ts`) and is in the DOM only while its object is open.
 */
export function createFocusUi(focus: Focus, opts: FocusUiOptions): FocusUi {
  const html = document.documentElement
  const root = mustGet('#focus')
  const list = mustGet('[data-ui="focus-list"]', root)
  const hint = mustGet('[data-ui="focus-hint"]', root)
  const panel = mustGet('[data-ui="focus-panel"]', root)
  const body = mustGet('[data-ui="focus-body"]', panel)
  const closeButton = mustGet('[data-ui="focus-close"]', panel)
  const coarse = matchMedia('(pointer: coarse)').matches

  let content: Content | null | undefined
  let loading: Promise<void> | undefined
  const load = (): Promise<void> =>
    (loading ??= import('../config/content').then(
      (module) => {
        content = module
      },
      () => {
        // Offline or a stale deploy: say so in the panel, and try again on the next open (a
        // browser may remember the failed import, so the panel asks for a reload).
        content = null
        loading = undefined
      },
    ))
  void opts.settled.then(load, () => undefined)

  const resumeOpen = (): boolean =>
    document.querySelector<HTMLDialogElement>('#resume')?.open === true

  let opener: HTMLElement | null = null
  let pending: { id: string; t: number; until: number } | null = null
  const cancelPending = (): void => {
    pending = null
  }

  function open(id: string, from: HTMLElement | null = null): void {
    if (resumeOpen() || !focus.open(id)) return
    opener = from
    pending = null
    if (content === null) content = undefined
    void load()
  }
  function close(): void {
    pending = null
    focus.close()
  }
  const toggle = (id: string, from: HTMLElement | null): void => {
    if (focus.opening === id) close()
    else open(id, from)
  }

  // --- pointer -------------------------------------------------------------------------------
  const pointer = { x: 0, y: 0, dirty: false, mouse: false, overControl: false }
  let press: { x: number; y: number; scroll: number; touch: boolean; id: number } | null = null
  const onControl = (target: EventTarget | null): boolean =>
    !(target instanceof Element) || !!target.closest(CONTROLS)
  window.addEventListener(
    'pointermove',
    (event) => {
      pointer.x = event.clientX
      pointer.y = event.clientY
      pointer.mouse = event.pointerType === 'mouse'
      pointer.overControl = event.target instanceof Element && !!event.target.closest(CONTROLS)
      pointer.dirty = true
    },
    { passive: true },
  )
  // Activation is the end of a press on the room, not a `click`: iOS Safari does not send a
  // click for a tap on an element with no click handler of its own, and listening for one
  // event only means a press can never act twice.
  window.addEventListener(
    'pointerdown',
    (event) => {
      const control = onControl(event.target)
      // Pressing anywhere but a control takes the walk back from a pending arrival.
      if (!control) cancelPending()
      press =
        event.isPrimary && event.button === 0 && !control
          ? {
              x: event.clientX,
              y: event.clientY,
              scroll: window.scrollY,
              touch: event.pointerType !== 'mouse',
              id: event.pointerId,
            }
          : null
    },
    { passive: true },
  )
  window.addEventListener(
    'pointercancel',
    () => {
      press = null
    },
    { passive: true },
  )
  window.addEventListener('pointerup', (event) => {
    const pressed = press
    press = null
    if (
      pressed?.id !== event.pointerId ||
      event.button !== 0 ||
      onControl(event.target) ||
      resumeOpen() ||
      Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > SLOP ||
      Math.abs(window.scrollY - pressed.scroll) > SLOP
    )
      return
    const current = focus.state
    // An open banner is the whole view: anywhere off its text is outside the panel.
    if (current.id !== null && current.kind === 'banner') {
      close()
      return
    }
    const hit = focus.active
      ? focus.pick(event.clientX, event.clientY, pressed.touch ? TOUCH_PAD : 0)
      : null
    if (hit) toggle(hit.id, null)
    else if (current.id !== null) close()
  })
  window.addEventListener('keydown', (event) => {
    if (pending && SCROLL_KEYS.has(event.key)) {
      const target = event.target instanceof Element ? event.target : null
      const taken =
        !!target?.closest(KEY_TAKERS) ||
        (event.key === ' ' && !!target?.closest('button, a, summary'))
      if (!taken) cancelPending()
    }
    if (event.key !== 'Escape' || focus.state.id === null || resumeOpen()) return
    event.preventDefault()
    close()
  })
  closeButton.addEventListener('click', close)
  // The résumé is modal: whatever is open here gives way to it.
  window.addEventListener('resume:toggle', (event) => {
    if (event.detail.open) close()
  })
  // A visitor who scrolls on their own is no longer on the way to a banner (keys and presses
  // are above; a scroll elsewhere is caught by `headedFor` in update).
  window.addEventListener('wheel', cancelPending, { passive: true })
  window.addEventListener('touchmove', cancelPending, { passive: true })

  // --- hidden buttons ------------------------------------------------------------------------
  list.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null
    const id = button?.dataset.id
    if (button && id) toggle(id, button)
  })
  list.addEventListener('focusin', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null
    hover(button?.dataset.id ?? null)
  })
  list.addEventListener('focusout', () => {
    hover(null)
  })
  let listWall: Wall | null = null
  function fillList(wall: Wall | null): void {
    listWall = wall
    // Removing a focused button sends no focusout: drop its glow here, and keep the keyboard
    // near the list rather than on the page's start.
    const hadFocus = list.contains(document.activeElement)
    hover(null)
    const ids = wall ? focus.ids(wall) : []
    list.replaceChildren(
      ...ids.map((id, i) => {
        const item = document.createElement('li')
        const button = document.createElement('button')
        button.type = 'button'
        button.dataset.id = id
        // Generic on purpose: what it stands for is only told once it is opened.
        button.textContent = `${wall ? LABEL[wall] : ''} ${i + 1} of ${ids.length}`
        item.append(button)
        return item
      }),
    )
    list.hidden = wall === null
    if (hadFocus) {
      const first = list.querySelector('button')
      if (first) first.focus({ preventScroll: true })
    }
  }

  let hovered: string | null = null
  function hover(id: string | null): void {
    if (id === hovered) return
    hovered = id
    focus.hover(id)
  }

  // --- panel ---------------------------------------------------------------------------------
  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
  ): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag)
    node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }
  function fill(id: string, kind: Wall, text: Content): boolean {
    const title = el('h2', 'focus-title')
    title.id = 'focus-title'
    if (kind === 'banner') {
      const project = text.projectContent(id)
      if (!project) return false
      title.textContent = project.name
      const points = el('ul', 'focus-points')
      points.append(...project.points.map((point) => el('li', '', point)))
      const facts = el('ul', 'focus-facts')
      facts.append(...project.facts.map((fact) => el('li', '', fact)))
      // Each part of the eyebrow stays whole, so a narrow card never strands half a date range.
      const kicker = el('p', 'focus-kicker')
      project.kicker.split(' · ').forEach((part, i) => {
        if (i > 0) kicker.append(' · ')
        kicker.append(el('span', '', part))
      })
      body.replaceChildren(kicker, title, el('p', 'focus-line', project.line), points, facts)
      if (project.link) {
        const link = el('a', 'focus-link', project.link.label)
        link.href = project.link.href
        link.target = '_blank'
        link.rel = 'noopener'
        const arrow = el('span', '', ' ↗')
        arrow.ariaHidden = 'true'
        link.append(arrow)
        const more = el('p', 'focus-more')
        more.append(link)
        body.append(more)
      }
    } else {
      const trophy = text.trophyContent(id)
      if (!trophy) return false
      title.textContent = trophy.title
      body.replaceChildren(title, el('p', 'focus-line', trophy.description))
    }
    return true
  }

  let locked = false
  /** the object whose text is in the panel */
  let filled: string | null = null
  let shown = false
  /** the open object the panel has already taken the focus for (once per open) */
  let focusedFor: string | null = null
  let marked: Wall | null = null
  let layout: BannerLayout | null = null
  let lastT = -1
  const hinted: Record<Wall, boolean> = { banner: false, trophy: false }
  let hintWall: Wall | null = null
  let hintUntil = 0

  /** Hand the keyboard back to the button that opened the panel (a pointer open has none). */
  function releaseFocus(): void {
    if (!panel.contains(document.activeElement)) return
    if (opener?.isConnected) opener.focus({ preventScroll: true })
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }
  function hidePanel(): void {
    if (!shown) return
    shown = false
    releaseFocus()
    panel.hidden = true
  }

  return {
    open,
    close,
    arrive(id, t) {
      pending = { id, t, until: performance.now() + ARRIVE_MS }
    },
    update(state) {
      const now = performance.now()
      const current = focus.state
      const isOpen = current.id !== null
      const wall = focus.wall

      if (wall !== listWall && !isOpen) fillList(wall)

      // A fragment or the résumé asked for a banner: open it when the scroll gets there.
      if (pending) {
        if (now > pending.until || !opts.headedFor(pending.t)) pending = null
        else if (wall === 'banner' && Math.abs(state.t - pending.t) < ARRIVE_T) open(pending.id)
      }

      // Hover: at most one ray per frame, and only when the pointer or the view moved.
      if (pointer.mouse && (pointer.dirty || state.t !== lastT)) {
        const pickable =
          wall !== null && !pointer.overControl && current.kind !== 'banner' && !resumeOpen()
        hover(pickable ? (focus.pick(pointer.x, pointer.y)?.id ?? null) : null)
        html.classList.toggle('focus-pointing', hovered !== null)
      }
      pointer.dirty = false
      lastT = state.t

      if (isOpen !== locked) {
        locked = isOpen
        opts.lock(isOpen)
        if (!isOpen) {
          hidePanel()
          body.replaceChildren()
          filled = null
          opener = null
          focusedFor = null
        }
      }
      if (current.kind !== marked) {
        marked = current.kind
        // The stylesheet clears the page furniture off a banner that covers the screen.
        if (marked) html.dataset.focus = marked
        else delete html.dataset.focus
      }
      // How the banner is framed (it follows the viewport's shape, so a resize can change it).
      if (focus.layout !== layout) {
        layout = focus.layout
        if (layout) {
          html.dataset.focusLayout = layout
          panel.dataset.layout = layout
        } else {
          delete html.dataset.focusLayout
          delete panel.dataset.layout
        }
      }

      if (current.id !== null && current.kind !== null) {
        if (filled !== current.id) {
          hidePanel()
          body.replaceChildren()
          filled = null
          if (content) {
            if (fill(current.id, current.kind, content)) filled = current.id
          } else if (content === null) {
            // The dialog is labelled by #focus-title, so it keeps one even here.
            const title = el('h2', 'focus-title visually-hidden', LABEL[current.kind])
            title.id = 'focus-title'
            body.replaceChildren(
              title,
              el(
                'p',
                'focus-line',
                'This could not load. Check the connection and reload the page.',
              ),
            )
            filled = current.id
          }
          attrWrite(panel, 'data-kind', current.kind)
        }
        // On the way out, before the fading panel goes inert and drops the focus on the floor.
        if (focus.opening !== current.id) releaseFocus()
        const opacity = clamp01((current.k - PANEL_FROM) / (1 - PANEL_FROM))
        const visible = filled === current.id && opacity > 0
        if (visible) {
          const rect = current.kind === 'banner' ? focus.paperRect : null
          if (rect && layout === 'beside') {
            // The text starts where the banner ends.
            // The rect is a fraction of the canvas, which is the window's inner size (not
            // vw/vh, which a phone's URL bar makes disagree with it): write px.
            styleWrite(panel, '--x', `${((rect.left + rect.width) * innerWidth).toFixed(1)}px`)
          } else if (rect) {
            // The part of the paper that is on screen.
            const left = Math.max(0, rect.left)
            const top = Math.max(0, rect.top)
            const right = Math.min(1, rect.left + rect.width)
            const bottom = Math.min(1, rect.top + rect.height)
            styleWrite(panel, '--x', `${(left * innerWidth).toFixed(1)}px`)
            styleWrite(panel, '--y', `${(top * innerHeight).toFixed(1)}px`)
            styleWrite(panel, '--w', `${((right - left) * innerWidth).toFixed(1)}px`)
            styleWrite(panel, '--h', `${((bottom - top) * innerHeight).toFixed(1)}px`)
          }
          styleWrite(panel, '--o', opacity.toFixed(3))
          if (panel.inert !== opacity < 0.5) panel.inert = opacity < 0.5
          if (!shown) {
            shown = true
            panel.hidden = false
          }
          // Move focus in once per open, as soon as the panel can take it (it is inert while it
          // fades); after that the visitor may take it anywhere (the header, a slider).
          if (!panel.inert && focus.opening === current.id && focusedFor !== current.id) {
            focusedFor = current.id
            if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true })
          }
        } else hidePanel()
      }

      // The hint: once per wall, never over an open object.
      if (wall && !hinted[wall] && !isOpen && !pending) {
        hinted[wall] = true
        hintWall = wall
        hintUntil = now + HINT_MS
        hint.textContent = coarse ? 'Tap what glows' : 'Click what glows'
      }
      hint.classList.toggle('is-on', now < hintUntil && wall === hintWall && !isOpen)
    },
  }
}
