/** querySelector that throws instead of returning null (no `!` assertions in this codebase). */
export function mustGet<T extends Element = HTMLElement>(
  sel: string,
  root: ParentNode = document,
): T {
  const el = root.querySelector<T>(sel)
  if (!el) throw new Error(`Missing element: ${sel}`)
  return el
}

/** Write a style property only when the value changed. Returns true when written. */
export function styleWrite(el: HTMLElement | SVGElement, prop: string, value: string): boolean {
  const cache = (el as unknown as { __sw?: Record<string, string> }).__sw ?? {}
  ;(el as unknown as { __sw?: Record<string, string> }).__sw = cache
  if (cache[prop] === value) return false
  cache[prop] = value
  el.style.setProperty(prop, value)
  return true
}

export function attrWrite(el: Element, name: string, value: string): boolean {
  const cache = (el as unknown as { __aw?: Record<string, string> }).__aw ?? {}
  ;(el as unknown as { __aw?: Record<string, string> }).__aw = cache
  if (cache[name] === value) return false
  cache[name] = value
  el.setAttribute(name, value)
  return true
}
