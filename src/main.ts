import 'lenis/dist/lenis.css'
import { curtainTextureUrls, hdriUrl } from './config/assets'
import { detectQuality } from './config/quality'
import { createResume } from './ui/resume'

// The entry stays tiny: choose the tier, request what the curtain waits for, then fetch the
// scene chunk (three.js and the world), so assets download while that chunk loads and parses.
const params = new URLSearchParams(location.search)
const quality = detectQuality(params)

// Before the scene chunk: the résumé must open even if the landscape never does.
createResume()

for (const href of [hdriUrl(quality.tier), ...curtainTextureUrls(quality.tier)]) {
  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'fetch'
  link.href = href
  // Matches the loaders' same-origin fetches so the preloaded response is the one they use.
  link.crossOrigin = 'anonymous'
  document.head.append(link)
}

void import('./boot')
  .then((scene) => scene.boot(params, quality))
  .catch((error: unknown) => {
    console.warn('The landscape is unavailable; showing the readable story.', error)
    document.documentElement.classList.add('no-scene')
    const curtain = document.querySelector<HTMLElement>('#curtain')
    if (curtain) curtain.hidden = true
    const note = document.querySelector<HTMLElement>('#scene-note')
    if (note) note.hidden = false
    for (const slot of document.querySelectorAll<HTMLElement>('#overlay .slot')) slot.inert = false
  })
