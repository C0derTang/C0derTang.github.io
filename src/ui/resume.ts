import { mustGet } from '../util/dom'

declare global {
  interface WindowEventMap {
    'resume:toggle': CustomEvent<{ open: boolean }>
  }
}

const HASH = '#resume'

/** Whether the pointer is outside the dialog's box (the click landed on its backdrop). */
function outside(dialog: HTMLElement, event: MouseEvent): boolean {
  const r = dialog.getBoundingClientRect()
  return (
    event.clientX < r.left ||
    event.clientX > r.right ||
    event.clientY < r.top ||
    event.clientY > r.bottom
  )
}

/**
 * The résumé sheet. Lives in the entry chunk so it works before the scene loads and when the
 * scene cannot run at all. Its text is a separate chunk fetched on the first open: the served
 * page and anything that only reads it never contain the résumé. The scene hears about the
 * sheet through `resume:toggle` (stop scrolling) and `hashchange` (go to a project).
 */
export function createResume(): void {
  const dialog = mustGet<HTMLDialogElement>('#resume')
  const body = mustGet('[data-ui="resume-body"]', dialog)
  const print = mustGet('[data-ui="resume-print"]', dialog)
  let filled: Promise<void> | undefined
  /** the fragment to put back when the sheet closes */
  let returnHash = ''
  let jump = false

  const fill = (): Promise<void> =>
    (filled ??= import('./resume-content').then(
      (content) => {
        body.innerHTML = content.resumeHtml()
        print.hidden = false
      },
      () => {
        filled = undefined
        print.hidden = true
        body.textContent = 'The résumé could not load. Check the connection and reload the page.'
      },
    ))

  const open = async (): Promise<void> => {
    if (dialog.open) return
    await fill()
    if (dialog.open) return
    if (location.hash !== HASH) {
      returnHash = location.hash
      history.replaceState(null, '', HASH)
    }
    dialog.showModal()
    window.dispatchEvent(new CustomEvent('resume:toggle', { detail: { open: true } }))
  }

  dialog.addEventListener('close', () => {
    history.replaceState(null, '', returnHash || location.pathname + location.search)
    returnHash = ''
    window.dispatchEvent(new CustomEvent('resume:toggle', { detail: { open: false } }))
    if (jump) window.dispatchEvent(new HashChangeEvent('hashchange'))
    jump = false
  })
  // Only a press that began on the backdrop and ends outside the sheet closes it: a text
  // selection dragged out of the sheet, or a press on the dialog's scrollbar, does not.
  let pressedBackdrop = false
  dialog.addEventListener('pointerdown', (event) => {
    pressedBackdrop = event.target === dialog && outside(dialog, event)
  })
  dialog.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const goto = target.closest<HTMLElement>('[data-goto]')?.dataset.goto
    if (goto) {
      returnHash = `#${goto}`
      jump = true
      dialog.close()
    } else if (target === dialog) {
      if (pressedBackdrop && outside(dialog, event)) dialog.close()
    } else if (target.closest('[data-ui="resume-close"]')) dialog.close()
    else if (target.closest('[data-ui="resume-print"]')) window.print()
    pressedBackdrop = false
  })

  mustGet('[data-ui="resume-open"]').addEventListener('click', () => void open())
  window.addEventListener('hashchange', () => {
    if (location.hash === HASH) void open()
  })
  if (location.hash === HASH) void open()
}
