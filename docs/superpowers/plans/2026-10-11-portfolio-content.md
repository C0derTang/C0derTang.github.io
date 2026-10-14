# Portfolio Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show three featured projects as hanging scrolls with text slots at the turn beat's wall holds, and add a résumé sheet that opens from the header, stays out of the served HTML, and is reachable by URL fragment.

**Architecture:** Featured projects live in one config (`src/config/projects.ts`) that the slot table, the scroll painter, the reduced-motion stills, the deep links and the tests all read. The scrolls are a new world part: one canvas atlas on one lit material, painted after the display font loads as part of the deferred stage. The résumé is a `<dialog>` wired from the tiny entry chunk; its content is a separate chunk imported on first open and it talks to the scene only through window events (`resume:toggle`, `hashchange`).

**Tech Stack:** Vite 8, TypeScript strict, three.js, Lenis, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-11-portfolio-content-design.md`

## Global Constraints

- No new dependencies; pnpm only; never hand-edit `pnpm-lock.yaml`.
- TS strict with `noUncheckedIndexedAccess`; no `!` assertions (use `mustGet`); Prettier formats everything, including these docs.
- Every pose, focus and slot value is a pure function of `t`; no per-frame CPU integration.
- Scrolls cast and receive no shadows; no unlit materials; no second render of the scene.
- The curtain must not wait for the scroll atlas. Eager starts (`?freeze`, `?t=`, `?bench`, a fragment that maps to t > 0) wait for it.
- Résumé text, the email address and the phone number never appear in `index.html`. The phone number appears nowhere. The owner's Stanford address (not written here) appears nowhere in `dist/` as one literal.
- Published links, verbatim:
  - https://cph2h.com
  - https://chromewebstore.google.com/detail/waifu-focus/oilebkjfhbkbmablbmhellicongmgbml
  - https://treeswantswag.web.app/
  - https://github.com/C0derTang
  - https://www.linkedin.com/in/christophertangwastaken/
  - https://www.instagram.com/ctang.md
- Budgets: JS <= 400 KB gz, draw calls <= 220, triangles <= 1.5 M, nothing new before the curtain on the `low` tier.
- Work on `feat/portfolio-content`; do not push or open a PR without the owner's say.
- Deviation from the spec, on purpose: the header control is a `<button>`, not `<a href="#resume">`, because Lenis (`anchors: true`) intercepts fragment links. `#resume` in the URL still opens the sheet.

## Review Focus

1. **Reduced motion.** The turn currently snaps to one still (t .405) while slots follow `t`, so a reduced-motion visitor would read "CPH2H" while looking at the Waifu Focus wall. Expected: the still shown is the wall of the slot that is up. Test in Task 1.
2. **Résumé chunk fails to load** (offline, blocked). Expected: the sheet still opens and says it could not load; nothing throws. Test in Task 3.
3. **Scene unavailable (no WebGL).** Expected: the Résumé button still opens the sheet. Test in Task 3.
4. **Unknown or conflicting start.** `/#nope` starts at t 0 without errors; `/?t=0.9#cph2h` starts at .9. Test in Task 4.
5. **Portrait phone.** The scroll must be inside the frame at each hold and not hidden by the slot card. No automated test can judge this; Task 2 checks real-GPU frames with the Pixel 7 profile.

---

## File Structure

| File                          | Status | Responsibility                                                                       |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `src/config/projects.ts`      | new    | The three featured projects (id, name, scroll columns, motif, hold `t`); `deepLinkT` |
| `src/config/beats.ts`         | modify | Slot windows for the three projects; `interior` moves earlier                        |
| `src/three/state.ts`          | modify | Reduced-motion still per project wall; focus keys if needed                          |
| `src/three/world/scrolls.ts`  | new    | Scroll geometry, canvas atlas, deferred paint                                        |
| `src/three/world/interior.ts` | modify | Remove the plain scroll; move the umbrella and the hanging basket out of the way     |
| `src/three/app.ts`            | modify | Add the part; fold `painted` into eager `ready` and `settled`                        |
| `src/ui/resume.ts`            | new    | Dialog behaviour: open, close, URL, print, go-to-project, events                     |
| `src/ui/resume-content.ts`    | new    | Résumé markup (lazy chunk)                                                           |
| `src/styles/resume.css`       | new    | Header button, sheet, print                                                          |
| `src/styles/overlay.css`      | modify | Project slot card                                                                    |
| `src/styles/index.css`        | modify | Import `resume.css`                                                                  |
| `src/main.ts`                 | modify | Call `createResume()`                                                                |
| `src/boot.ts`                 | modify | Pause Lenis while the sheet is open; fragment start and `hashchange`                 |
| `index.html`                  | modify | Three project slots, Résumé button, empty dialog, noscript note                      |
| `e2e/portfolio.spec.ts`       | new    | All new behaviour                                                                    |
| `e2e/motion.spec.ts`          | modify | Slot count; reduced-motion walls                                                     |
| `CLAUDE.md`                   | modify | Layout, conventions                                                                  |

Running e2e: Playwright starts `pnpm build && pnpm preview` itself but reuses anything already on :4173. Before every e2e run: `lsof -ti :4173 | xargs kill 2>/dev/null; true`.

---

### Task 1: Featured projects config and slots

**Files:**

- Create: `src/config/projects.ts`, `e2e/portfolio.spec.ts`
- Modify: `src/config/beats.ts` (SLOTS), `src/three/state.ts` (poseT), `index.html` (slots), `src/styles/overlay.css`, `e2e/motion.spec.ts`

**Interfaces:**

- Produces: `PROJECTS` (readonly tuple of `{ id, name, scroll, motif, t }`), `type ProjectId = 'cph2h' | 'waifu-focus' | 'robotics'`, `type Motif = 'duel' | 'hourglass' | 'gear'`, `deepLinkT(hash: string): number | undefined`. Slot ids equal project ids.

- [ ] **Step 1: Write the failing tests**

Create `e2e/portfolio.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'
import { PROJECTS } from '../src/config/projects'

const open = async (page: Page, url: string) => {
  await page.goto(url)
  await page.waitForFunction(() => window.__scene?.ready === true, null, { timeout: 60_000 })
}
const seek = (page: Page, t: number) =>
  page.evaluate((fraction) => {
    window.__scene?.seek(fraction)
  }, t)
const yaw = (page: Page) => page.evaluate(() => window.__scene?.state?.pose.yaw)

test('each featured project has its slot at its wall', async ({ page }) => {
  await open(page, '/?freeze')
  const walls = [90, 180, 270]
  for (const [index, project] of PROJECTS.entries()) {
    await seek(page, project.t)
    const slot = page.locator(`[data-slot="${project.id}"]`)
    await expect(slot).toHaveCSS('opacity', '1')
    await expect(slot.getByRole('heading')).toHaveText(project.name)
    expect(await yaw(page)).toBeCloseTo(walls[index] ?? -1, 5)
    for (const other of PROJECTS)
      if (other.id !== project.id)
        await expect(page.locator(`[data-slot="${other.id}"]`)).toBeHidden()
    await expect(page.locator('[data-slot="interior"]')).toBeHidden()
  }
  await seek(page, 0.3)
  await expect(page.locator('[data-slot="interior"]')).toHaveCSS('opacity', '1')
})
```

In `e2e/motion.spec.ts`, replace `expect(fallbackInert).toEqual([false, false, false, false])` with:

```ts
expect(fallbackInert).toEqual(Array.from({ length: 7 }, () => false))
```

and append to the end of the reduced-motion test (before its closing `})`):

```ts
// Each project's slot is read against its own wall, not one still for the whole turn.
expect((await frameAt(0.364)).pose.yaw).toBeCloseTo(90, 5)
expect((await frameAt(0.41)).pose.yaw).toBeCloseTo(180, 5)
expect((await frameAt(0.456)).pose.yaw).toBeCloseTo(270, 5)
expect((await frameAt(0.34)).pose.yaw).toBeCloseTo(90, 5)
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm typecheck`
Expected: FAIL, cannot find module `../src/config/projects`.

- [ ] **Step 3: Create `src/config/projects.ts`**

```ts
import { BEATS, BEAT_IDS } from './beats'

export type Motif = 'duel' | 'hourglass' | 'gear'

/**
 * The projects hung on the house walls, in the order the turn shows them. `t` is the middle of
 * that wall's hold (`faces` in camera.ts); `scroll` is the name as columns of brushed text.
 */
export const PROJECTS = [
  { id: 'cph2h', name: 'CPH2H', scroll: ['CPH2H'], motif: 'duel', t: 0.364 },
  { id: 'waifu-focus', name: 'Waifu Focus', scroll: ['Waifu Focus'], motif: 'hourglass', t: 0.41 },
  {
    id: 'robotics',
    name: 'Bakersfield Robotics',
    scroll: ['Bakersfield', 'Robotics'],
    motif: 'gear',
    t: 0.456,
  },
] as const satisfies readonly {
  id: string
  name: string
  scroll: readonly string[]
  motif: Motif
  t: number
}[]

export type ProjectId = (typeof PROJECTS)[number]['id']

/** The story position a URL fragment names: a project's hold or the start of a beat. */
export function deepLinkT(hash: string): number | undefined {
  const id = hash.replace(/^#/, '')
  const project = PROJECTS.find((p) => p.id === id)
  if (project) return project.t
  const beat = BEAT_IDS.find((b) => b === id)
  return beat ? BEATS[beat][0] : undefined
}
```

- [ ] **Step 4: Slot windows in `src/config/beats.ts`**

Replace the `SLOTS` array body with:

```ts
export const SLOTS = [
  { id: 'exterior', window: [-0.02, 0, 0.08, 0.14] },
  { id: 'interior', window: [0.27, 0.29, 0.325, 0.34] },
  // One per wall hold of the turn (config/projects.ts): fully up for exactly the hold.
  { id: 'cph2h', window: [0.345, 0.357, 0.371, 0.383] },
  { id: 'waifu-focus', window: [0.389, 0.401, 0.419, 0.431] },
  { id: 'robotics', window: [0.437, 0.449, 0.463, 0.475] },
  { id: 'paddy', window: [0.63, 0.66, 0.73, 0.76] },
  { id: 'underwater', window: [0.89, 0.93, 1.5, 2] },
] as const satisfies readonly { id: string; window: readonly [number, number, number, number] }[]
```

- [ ] **Step 5: Reduced-motion wall in `src/three/state.ts`**

Add the import `import { PROJECTS } from '../config/projects'`, add below `STILL_T`:

```ts
/** Reduced motion still reads each project against its own wall: the hold nearest to t. */
const turnStill = (t: number): number =>
  PROJECTS.reduce<number>(
    (best, p) => (Math.abs(p.t - t) < Math.abs(best - t) ? p.t : best),
    PROJECTS[0].t,
  )
```

and change the `poseT` line in `computeState` to:

```ts
const poseT = quality.reducedMotion ? (beat === 'turn' ? turnStill(t) : STILL_T[beat]) : t
```

- [ ] **Step 6: Slots in `index.html`**

Leave the `interior` section as is. Insert directly after it:

```html
<section class="slot slot-project" data-slot="cph2h">
  <p class="eyebrow"><span class="chapter-number">01 / 03</span> Project</p>
  <h2>CPH2H</h2>
  <p>
    Head-to-head competitive programming: live 1v1 Codeforces matches, voice and video, and Elo
    ratings.
  </p>
  <p class="facts">Built at Rice Residency <span aria-hidden="true">·</span> Sponsored by FR8</p>
  <p class="links">
    <a href="https://cph2h.com">cph2h.com <span aria-hidden="true">↗</span></a>
  </p>
</section>

<section class="slot slot-project" data-slot="waifu-focus">
  <p class="eyebrow"><span class="chapter-number">02 / 03</span> Project</p>
  <h2>Waifu Focus</h2>
  <p>A Chrome extension that blocks distracting sites on your schedule, with themes.</p>
  <p class="facts">1,900+ installs <span aria-hidden="true">·</span> 4.8 / 5 rating</p>
  <p class="links">
    <a href="https://chromewebstore.google.com/detail/waifu-focus/oilebkjfhbkbmablbmhellicongmgbml"
      >Chrome Web Store <span aria-hidden="true">↗</span></a
    >
  </p>
</section>

<section class="slot slot-project" data-slot="robotics">
  <p class="eyebrow"><span class="chapter-number">03 / 03</span> Project</p>
  <h2>Bakersfield Robotics</h2>
  <p>
    A 501(c)(3) nonprofit I founded to teach free robotics to K–8 students across three local
    schools.
  </p>
  <p class="facts">100+ students <span aria-hidden="true">·</span> Cal State grant</p>
</section>
```

- [ ] **Step 7: Card styles in `src/styles/overlay.css`**

Change the three `.slot-interior` rule selectors so the project card shares them, and add the new rules after them:

```css
:is(.slot-interior, .slot-project) {
  left: var(--page-gutter);
  bottom: 15vh;
  width: min(23rem, calc(100vw - 2 * var(--page-gutter)));
  padding: 1.65rem 1.8rem;
  background: rgb(241 233 214 / 95%);
  color: var(--ink);
  border-top: 2px solid #a86a4b;
  box-shadow: 0 8px 40px rgb(12 18 16 / 12%);
}
:is(.slot-interior, .slot-project) .eyebrow {
  color: #655e51;
}
:is(.slot-interior, .slot-project) h2 {
  font-size: clamp(1.7rem, 2.5vw, 2.3rem);
}
:is(.slot-interior, .slot-project) p:not(.eyebrow) {
  color: #4c4b40;
}
.slot-project .chapter-number,
.slot-project .links a,
.slot-project .links a span {
  color: #875134;
}
.slot-project .facts {
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0.04em;
}
.slot-project .links {
  margin-top: 0.6rem;
}
```

In the `@media (max-width: 640px)` block, add `.slot-project` to the `.slot-interior, .slot-paddy, .slot-underwater` padding selector.

- [ ] **Step 8: Run the tests**

```bash
pnpm typecheck && pnpm lint && pnpm format
lsof -ti :4173 | xargs kill 2>/dev/null; true
pnpm exec playwright test e2e/portfolio.spec.ts e2e/motion.spec.ts e2e/smoke.spec.ts e2e/experience.spec.ts --project=desktop --project=mobile
```

Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/config/projects.ts src/config/beats.ts src/three/state.ts index.html src/styles/overlay.css e2e/portfolio.spec.ts e2e/motion.spec.ts
git commit -m "feat(overlay): featured project slots at the turn's wall holds"
```

---

### Task 2: Wall scrolls

**Files:**

- Create: `src/three/world/scrolls.ts`, `<scratchpad>/frames.mjs` (not committed)
- Modify: `src/three/world/interior.ts`, `src/three/app.ts`, possibly `src/three/state.ts` (focus)

**Interfaces:**

- Consumes: `PROJECTS`, `ProjectId`, `Motif` from Task 1; `Materials.woodDark`.
- Produces: `createScrolls(mats: Materials): WorldPart & { painted: Promise<CanvasTexture> }`.

- [ ] **Step 1: Write the failing test**

Append to `e2e/portfolio.spec.ts`:

```ts
test('the scrolls are painted before an eager start is ready', async ({ page }) => {
  await open(page, '/?freeze&t=0.364')
  expect(await page.evaluate(() => window.__scene?.settled)).toBe(true)
  expect(
    await page.evaluate(() => document.fonts.check('500 64px "Shippori Mincho"', 'CPH2H')),
  ).toBe(true)
})
```

This pins the load contract (an eager start has waited for the font the atlas is painted with). The look is checked by eye in Step 6.

- [ ] **Step 2: Run to verify failure**

Run: `lsof -ti :4173 | xargs kill 2>/dev/null; pnpm exec playwright test e2e/portfolio.spec.ts -g "painted" --project=desktop`
Expected: FAIL on `document.fonts.check` (nothing at t .364 forces the 500 weight to load before `ready`). If it passes because the curtain already loaded that face, keep the test as a regression guard and continue.

- [ ] **Step 3: Create `src/three/world/scrolls.ts`**

```ts
import {
  type BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { PROJECTS, type Motif, type ProjectId } from '../../config/projects'
import type { Materials } from '../materials'
import type { WorldPart } from './types'

/**
 * The hanging scrolls (kakejiku), one per featured project, on the three walls the turn holds
 * on. All three faces are painted into one canvas atlas on one lit material; the ink goes on
 * once the display font is in, so until then (and never behind the curtain) they are plain
 * paper. Nothing here moves and nothing casts a shadow.
 */

// Paper size in metres, and one atlas cell in pixels (the same proportions).
const W = 0.42
const H = 1.15
const CW = 256
const CH = 704
const INK = '#1a1c1e'
const PAPER = '#e9dfc6'
const FONT = '"Shippori Mincho", Georgia, serif'

/** Centre of each scroll and the yaw that turns its face (+z) into the room. */
const PLACES: Record<ProjectId, { x: number; y: number; z: number; ry: number }> = {
  cph2h: { x: 5.19, y: 2.05, z: -3.35, ry: -Math.PI / 2 },
  'waifu-focus': { x: -1.72, y: 1.85, z: -0.16, ry: Math.PI },
  robotics: { x: -5.19, y: 2.05, z: -3.58, ry: Math.PI / 2 },
}

const dummy = new Object3D()
function place(
  geo: BufferGeometry,
  p: { x: number; y: number; z: number; ry: number },
  dy = 0,
  rz = 0,
): BufferGeometry {
  dummy.position.set(p.x, p.y + dy, p.z)
  dummy.rotation.set(0, p.ry, rz)
  dummy.updateMatrix()
  return geo.applyMatrix4(dummy.matrix)
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false)
  if (!merged) throw new Error('scrolls: geometry merge failed')
  return merged
}

/** The cloth mount, its two gold bands and the bare paper. */
function paintMount(ctx: CanvasRenderingContext2D, x0: number): void {
  ctx.fillStyle = '#2f3a4d'
  ctx.fillRect(x0, 0, CW, CH)
  ctx.fillStyle = '#b79a5e'
  ctx.fillRect(x0, CH * 0.075, CW, 6)
  ctx.fillRect(x0, CH * 0.905, CW, 6)
  ctx.fillStyle = PAPER
  ctx.fillRect(x0 + 26, CH * 0.1, CW - 52, CH * 0.78)
}

function paintMotif(
  ctx: CanvasRenderingContext2D,
  kind: Motif,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.strokeStyle = INK
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 9
  ctx.beginPath()
  if (kind === 'duel') {
    ctx.moveTo(cx - r, cy - r)
    ctx.lineTo(cx + r, cy + r)
    ctx.moveTo(cx + r, cy - r)
    ctx.lineTo(cx - r, cy + r)
  } else if (kind === 'hourglass') {
    ctx.moveTo(cx - r * 0.7, cy - r)
    ctx.lineTo(cx + r * 0.7, cy - r)
    ctx.lineTo(cx - r * 0.7, cy + r)
    ctx.lineTo(cx + r * 0.7, cy + r)
    ctx.closePath()
  } else {
    ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2)
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4
      ctx.moveTo(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62)
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    }
    ctx.moveTo(cx + r * 0.2, cy)
    ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2)
  }
  ctx.stroke()
}

/** The motif, the name in columns read top to bottom (first column on the right), the seal. */
function paintInk(
  ctx: CanvasRenderingContext2D,
  x0: number,
  columns: readonly string[],
  motif: Motif,
): void {
  paintMotif(ctx, motif, x0 + CW / 2, 172, 50)

  ctx.save()
  ctx.translate(x0 + CW / 2, 405)
  ctx.rotate(Math.PI / 2)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = INK
  let size = columns.length > 1 ? 58 : 76
  const widest = (): number => Math.max(...columns.map((c) => ctx.measureText(c).width))
  ctx.font = `500 ${size}px ${FONT}`
  while (widest() > 300 && size > 20) {
    size -= 2
    ctx.font = `500 ${size}px ${FONT}`
  }
  const gap = size * 1.25
  columns.forEach((text, k) => {
    // After the quarter turn, canvas −y is the paper's right-hand side.
    ctx.fillText(text, 0, -((columns.length - 1) / 2 - k) * gap)
  })
  ctx.restore()

  ctx.fillStyle = '#a8402e'
  ctx.fillRect(x0 + 44, 566, 34, 34)
  ctx.fillStyle = PAPER
  ctx.font = `700 17px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('CT', x0 + 61, 584)
}

export function createScrolls(mats: Materials): WorldPart & { painted: Promise<CanvasTexture> } {
  const group = new Group()

  const canvas = document.createElement('canvas')
  canvas.width = CW * PROJECTS.length
  canvas.height = CH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('scrolls: no 2d context')
  PROJECTS.forEach((_, i) => {
    paintMount(ctx, i * CW)
  })
  const atlas = new CanvasTexture(canvas)
  atlas.colorSpace = SRGBColorSpace
  atlas.anisotropy = 4

  const papers: BufferGeometry[] = []
  const rods: BufferGeometry[] = []
  PROJECTS.forEach((project, i) => {
    const p = PLACES[project.id]
    const paper = new PlaneGeometry(W, H)
    const uv = paper.getAttribute('uv')
    for (let v = 0; v < uv.count; v++) uv.setX(v, (i + uv.getX(v)) / PROJECTS.length)
    papers.push(place(paper, p))
    for (const dy of [H / 2, -H / 2])
      rods.push(place(new CylinderGeometry(0.016, 0.016, W + 0.07, 8), p, dy, Math.PI / 2))
  })

  const paperMesh = new Mesh(
    merge(papers),
    new MeshStandardMaterial({ map: atlas, roughness: 0.9 }),
  )
  const rodMesh = new Mesh(merge(rods), mats.woodDark)
  for (const mesh of [paperMesh, rodMesh]) {
    mesh.castShadow = false
    mesh.receiveShadow = false
    group.add(mesh)
  }

  // A font that never arrives must not leave the scrolls blank: paint with the fallback.
  const font = Promise.race([
    document.fonts.load(`500 64px ${FONT}`, PROJECTS.flatMap((p) => p.scroll).join('')),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]).catch(() => undefined)
  const painted = font.then(() => {
    PROJECTS.forEach((project, i) => {
      paintInk(ctx, i * CW, project.scroll, project.motif)
    })
    atlas.needsUpdate = true
    return atlas
  })

  return { group, painted }
}
```

- [ ] **Step 4: Clear the walls in `src/three/world/interior.ts`**

1. Delete the eight lines from `// a hanging scroll (kakejiku)` through `group.add(scroll)`.
2. Hanging basket: change both `-3.5` z values (the `hangBasket` `xform` and its hook `b.box`) to `-1.25`.
3. Umbrella: change the shaft `xform(-1.85, 0.96, -0.22, 0, 0, 0.16)` to `xform(1.95, 0.96, -0.22, 0, 0, 0.16)` and the canopy `xform(-1.85, 1.5, -0.26, 0, 0, 0.16)` to `xform(1.95, 1.5, -0.26, 0, 0, 0.16)`.

Run `pnpm typecheck && pnpm lint`; remove any import the deletion left unused.

- [ ] **Step 5: Wire into `src/three/app.ts`**

Add `import { createScrolls } from './world/scrolls'`. Before `const parts`, add:

```ts
const scrolls = createScrolls(materials)
// Upload the painted atlas when it is ready rather than on the frame that first shows a scroll.
void scrolls.painted.then((texture) => renderer.initTexture(texture))
```

Insert `scrolls,` into `parts` directly after `createInterior(materials, quality),`.

Replace `.then(() => (eager ? loader.settled : loader.ready))` with:

```ts
    .then(() => (eager ? Promise.all([loader.settled, scrolls.painted]) : loader.ready))
```

Replace `settled: ready.then(() => loader.settled),` with:

```ts
    settled: ready.then(() => Promise.all([loader.settled, scrolls.painted])).then(() => undefined),
```

- [ ] **Step 6: Real-GPU frames and tuning**

Write `<scratchpad>/frames.mjs`:

```js
import { createRequire } from 'node:module'
const { chromium, devices } = createRequire(`${process.cwd()}/`)('@playwright/test')
const out = process.env.OUT ?? '.'
const phone = process.env.PHONE === '1'
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--use-angle=metal', '--mute-audio'],
})
const context = await browser.newContext(
  phone ? devices['Pixel 7'] : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 },
)
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
for (const f of process.argv.slice(2)) {
  await page.goto(`http://localhost:5173/?freeze&t=${f}`)
  await page.waitForFunction(() => window.__scene?.ready === true, null, { timeout: 60000 })
  await page.waitForTimeout(300)
  console.log(f, JSON.stringify(await page.evaluate(() => window.__scene.app.stats())))
  await page.screenshot({ path: `${out}/${phone ? 'phone' : 'desk'}-${f}.png` })
}
console.log('errors', errors)
await browser.close()
```

Run, from the repo root, with `pnpm dev` running in the background:

```bash
OUT=<scratchpad> node <scratchpad>/frames.mjs 0.364 0.41 0.456
PHONE=1 OUT=<scratchpad> node <scratchpad>/frames.mjs 0.364 0.41 0.456
```

Read all six PNGs. Each must satisfy, and `PLACES` / `W` / `H` are adjusted until it does:

- the whole scroll is inside the frame, flat on the wall, with no flicker bands (z-fighting: move it 1–2 cm into the room) and nothing in front of it;
- it does not overlap a window, shelf, pot rack, coat or the door frame;
- the slot card does not cover it, on desktop and on the phone frame;
- the project name is recognisable on the desktop frame;
- `errors` is empty; draw calls <= 220.

If the paper is visibly soft at a hold, add wall-distance holds to `focusDistance` in `src/three/state.ts`, replacing the `[T.enter[1], 3.4]` and `[T.doors[1], 3]` span with:

```ts
  [T.enter[1], 3.4],
  [0.329, 3.4],
  [0.357, 6.1],
  [0.371, 6.1],
  [0.401, 3.1],
  [0.419, 3.1],
  [0.449, 4.25],
  [0.463, 4.25],
  [0.492, 3.2],
  [T.doors[1], 3],
```

and re-render. Then render the full list to confirm nothing else moved: `0 0.12 0.28 0.36 0.41 0.46 0.55 0.68 0.8 0.9 1`.

- [ ] **Step 7: Run the tests**

```bash
pnpm typecheck && pnpm lint && pnpm format
lsof -ti :4173 | xargs kill 2>/dev/null; true
pnpm test:e2e
```

Expected: all PASS (the purity and daylight checks in `smoke.spec.ts` included).

- [ ] **Step 8: Commit**

```bash
git add src/three/world/scrolls.ts src/three/world/interior.ts src/three/app.ts src/three/state.ts e2e/portfolio.spec.ts
git commit -m "feat(3d): hanging scrolls for the three featured projects"
```

---

### Task 3: Résumé sheet

**Files:**

- Create: `src/ui/resume.ts`, `src/ui/resume-content.ts`, `src/styles/resume.css`
- Modify: `index.html`, `src/styles/index.css`, `src/main.ts`, `src/boot.ts`, `e2e/portfolio.spec.ts`

**Interfaces:**

- Consumes: `PROJECTS`, `ProjectId` from Task 1.
- Produces: `createResume(): void`; `resumeHtml(): string`; window event `resume:toggle` (`CustomEvent<{ open: boolean }>`); on "See it in the house" the URL fragment becomes `#<ProjectId>` and a `hashchange` event is dispatched (Task 4 consumes it).

- [ ] **Step 1: Write the failing tests**

Append to `e2e/portfolio.spec.ts`:

```ts
const position = (page: Page) =>
  page.evaluate(() => ({ y: window.scrollY, t: window.__scene?.state?.t }))

test('the résumé stays out of the served page and opens on demand', async ({ page, request }) => {
  const served = await (await request.get('/')).text()
  for (const text of ['Paradigm Study', 'Jaco Oil', 'stanford.edu', '661'])
    expect(served).not.toContain(text)

  await open(page, '/')
  expect(await page.content()).not.toContain('Paradigm Study')

  await page.getByRole('button', { name: 'Résumé', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Résumé' })
  await expect(sheet).toBeVisible()
  for (const name of ['Experience', 'Projects', 'Leadership & Programs', 'Distinctions'])
    await expect(sheet.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(sheet.getByRole('link', { name: /stanford\.edu$/ })).toHaveAttribute(
    'href',
    /^mailto:/,
  )
  await expect(sheet).not.toContainText('661')
  await expect(page).toHaveURL(/#resume$/)

  // The walk does not move underneath the sheet.
  const before = await position(page)
  await page.mouse.wheel(0, 900)
  await page.waitForTimeout(400)
  expect(await position(page)).toEqual(before)

  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(page).not.toHaveURL(/#resume/)
  await page.mouse.wheel(0, 600)
  await expect.poll(() => page.evaluate(() => window.__scene?.state?.t ?? 0)).toBeGreaterThan(0)
})

test('the résumé says so when its content cannot load', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/resume-content*', (route) => route.abort())
  await open(page, '/')
  await page.getByRole('button', { name: 'Résumé', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Résumé' })).toContainText('could not load')
  expect(errors).toEqual([])
})

test('the résumé opens without WebGL', async ({ page }) => {
  await page.addInitScript(`
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null
      return getContext.call(this, type, ...args)
    }
  `)
  await page.goto('/')
  await expect(page.locator('#scene-note')).toBeVisible()
  await page.getByRole('button', { name: 'Résumé', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Résumé' })).toContainText('Paradigm Study')
})

test('#resume in the URL opens the sheet', async ({ page }) => {
  await open(page, '/#resume')
  await expect(page.getByRole('dialog', { name: 'Résumé' })).toContainText('Paradigm Study')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `lsof -ti :4173 | xargs kill 2>/dev/null; pnpm exec playwright test e2e/portfolio.spec.ts -g "résumé|resume" --project=desktop`
Expected: the four tests FAIL at the missing "Résumé" button or dialog.

- [ ] **Step 3: Markup in `index.html`**

In `.scene-tools`, before `<div class="sound-control" …>`, add:

```html
<button class="resume-open" type="button" data-ui="resume-open">Résumé</button>
```

After `</main>`, add:

```html
<!-- Filled from a separate chunk when a visitor opens it; deliberately empty in the page. -->
<dialog id="resume" class="resume" aria-label="Résumé" data-nosnippet data-lenis-prevent>
  <div class="resume-sheet">
    <div class="resume-tools">
      <button type="button" data-ui="resume-print">Print / save as PDF</button>
      <button type="button" data-ui="resume-close">Close</button>
    </div>
    <div class="resume-body" data-ui="resume-body"></div>
  </div>
</dialog>
```

Change the `<noscript>` paragraph text to:

```html
This page is an animated scene that needs JavaScript. The text above is the whole story; links still
work. The résumé needs JavaScript as well.
```

- [ ] **Step 4: Create `src/ui/resume-content.ts`**

```ts
import type { ProjectId } from '../config/projects'

/**
 * The résumé's markup. This module is imported only when a visitor opens the sheet, so none of
 * it is in the served page. Keep it that way: nothing here may be imported statically.
 */

interface Entry {
  title: string
  role?: string
  when: string
  href?: string
  /** featured on a wall of the house: offer the jump there */
  house?: ProjectId
  points: string[]
}

const EXPERIENCE: Entry[] = [
  {
    title: 'Paradigm Study',
    role: 'Software Engineer · San Francisco, CA',
    when: 'Aug 2026 – Sep 2026',
    points: [
      'Shipped personalized onboarding, cross-session lesson-answer persistence, and an adaptation feedback loop.',
      'Built an append-only learner-event ledger in Neon PostgreSQL with server-side grading and a transactional outbox.',
      'Iterated on UI/UX fixes for the canvas-based learning system; added prefetching and reduced the bundle by 258 KB.',
    ],
  },
  {
    title: 'Jaco Oil',
    role: 'Software Development Intern · Bakersfield, CA',
    when: 'Jun 2024 – Dec 2025',
    points: [
      'Built Python/Pandas pipelines for fuel-monitor and point-of-sale data across 50+ sites; automated reporting and anomaly detection to replace manual operational workflows.',
    ],
  },
]

const PROJECT_ENTRIES: Entry[] = [
  {
    title: 'CPH2H',
    role: 'Head-to-Head Coding Platform',
    when: '2026',
    href: 'https://cph2h.com',
    house: 'cph2h',
    points: [
      'Built and launched cph2h.com during Rice Residency, combining live 1v1 Codeforces matches, voice/video chat, and Elo ratings in a competitive-programming platform.',
      'Secured $500 in sponsorship from FR8 (fr8.so) for the platform’s launch tournament.',
    ],
  },
  {
    title: 'Waifu Focus',
    role: 'Productivity Chrome Extension',
    when: 'Mar 2024 – Apr 2025',
    href: 'https://chromewebstore.google.com/detail/waifu-focus/oilebkjfhbkbmablbmhellicongmgbml',
    house: 'waifu-focus',
    points: [
      'Built and launched a website-blocking Chrome extension with custom schedules and themes; reached 1,900+ installs and a 4.8/5.0 Chrome Web Store rating.',
    ],
  },
  {
    title: '@ctang.md',
    role: 'Short-Form Video Creator, Instagram',
    when: '2026',
    href: 'https://www.instagram.com/ctang.md',
    points: [
      'Write, film, and edit short-form videos; top-performing post reached 200k+ views and 12k+ likes.',
      'Iterate on hooks, pacing, and formats using per-post retention and engagement data.',
    ],
  },
  {
    title: 'TreesWantSwag',
    role: 'Stanford Class of 2030 Petition Site',
    when: '2026',
    href: 'https://treeswantswag.web.app/',
    points: [
      'Built a React/Firebase petition site with Google sign-in; secured 180+ signatures in 48 hours through direct outreach.',
    ],
  },
]

const LEADERSHIP: Entry[] = [
  {
    title: 'Bakersfield Robotics',
    role: 'Founder · Bakersfield, CA',
    when: 'Jan 2023 – May 2026',
    house: 'robotics',
    points: [
      'Founded a 501(c)(3) nonprofit providing free robotics education to 100+ K–8 students across three local schools.',
      'Secured a local Cal State grant to fund teaching resources and classroom space.',
    ],
  },
  {
    title: 'VEX Team 11475B',
    role: 'Captain',
    when: 'Aug 2023 – Apr 2026',
    points: [
      'Captained a six-member team through 10+ competitions, qualifying twice for the World Championship and earning three Excellence Awards.',
    ],
  },
  {
    title: 'Paradigm YC Reject Camp',
    role: 'Participant',
    when: '2026',
    points: [
      'Participated in Paradigm’s eight-person filmed startup camp, featuring a 24-hour build-and-pitch challenge.',
    ],
  },
]

const entry = (e: Entry): string => `
  <article class="resume-entry">
    <div class="resume-entry-head">
      <h4>${e.href ? `<a href="${e.href}">${e.title}</a>` : e.title}</h4>
      <span class="resume-when">${e.when}</span>
    </div>
    ${e.role ? `<p class="resume-role">${e.role}</p>` : ''}
    <ul>${e.points.map((p) => `<li>${p}</li>`).join('')}</ul>
    ${
      e.house
        ? `<button class="resume-goto" type="button" data-goto="${e.house}" aria-label="See ${e.title} in the house">See it in the house <span aria-hidden="true">→</span></button>`
        : ''
    }
  </article>`

const section = (title: string, entries: Entry[]): string => `
  <section>
    <h3>${title}</h3>
    ${entries.map(entry).join('')}
  </section>`

export function resumeHtml(): string {
  // Put together here so the address is not one literal for a scraper to match.
  const mail = [...'ude.drofnats@csgnat'].reverse().join('')
  return `
  <header class="resume-head">
    <h2>Christopher Tang</h2>
    <p>Stanford University · Undergraduate, intended Mathematics &amp; Philosophy · Fall 2026 – present</p>
    <p class="resume-contact">
      <a href="mailto:${mail}">${mail}</a>
      <a href="https://github.com/C0derTang">GitHub</a>
      <a href="https://www.linkedin.com/in/christophertangwastaken/">LinkedIn</a>
      <a href="https://www.instagram.com/ctang.md">Instagram</a>
    </p>
  </header>
  ${section('Experience', EXPERIENCE)}
  ${section('Projects', PROJECT_ENTRIES)}
  ${section('Leadership &amp; Programs', LEADERSHIP)}
  <section>
    <h3>Distinctions</h3>
    <ul class="resume-list">
      <li>Stockdale High School valedictorian, rank 1/582 (Class of 2026)</li>
      <li>National Science Bowl, top 16 nationally (2025)</li>
      <li>USACO Silver</li>
      <li>TEDx speaker (2025)</li>
    </ul>
    <p class="resume-skills"><strong>Technical:</strong> Competitive Swim, tetr.io, Talking to Agents, Stress-eating.</p>
  </section>`
}
```

- [ ] **Step 5: Create `src/ui/resume.ts`**

```ts
import { mustGet } from '../util/dom'

declare global {
  interface WindowEventMap {
    'resume:toggle': CustomEvent<{ open: boolean }>
  }
}

const HASH = '#resume'

/**
 * The résumé sheet. Lives in the entry chunk so it works before the scene loads and when the
 * scene cannot run at all. Its text is a separate chunk fetched on the first open: the served
 * page and anything that only reads it never contain the résumé. The scene hears about the
 * sheet through `resume:toggle` (stop scrolling) and `hashchange` (go to a project).
 */
export function createResume(): void {
  const dialog = mustGet<HTMLDialogElement>('#resume')
  const body = mustGet('[data-ui="resume-body"]', dialog)
  let filled: Promise<void> | undefined
  /** the fragment to put back when the sheet closes */
  let returnHash = ''
  let jump = false

  const fill = (): Promise<void> =>
    (filled ??= import('./resume-content').then(
      (content) => {
        body.innerHTML = content.resumeHtml()
      },
      () => {
        filled = undefined
        body.textContent = 'The résumé could not load. Check the connection and try again.'
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
  dialog.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const goto = target.closest<HTMLElement>('[data-goto]')?.dataset.goto
    if (goto) {
      returnHash = `#${goto}`
      jump = true
      dialog.close()
    } else if (target === dialog || target.closest('[data-ui="resume-close"]')) dialog.close()
    else if (target.closest('[data-ui="resume-print"]')) window.print()
  })

  mustGet('[data-ui="resume-open"]').addEventListener('click', () => void open())
  window.addEventListener('hashchange', () => {
    if (location.hash === HASH) void open()
  })
  if (location.hash === HASH) void open()
}
```

- [ ] **Step 6: Entry and scene wiring**

`src/main.ts`: add `import { createResume } from './ui/resume'` and, directly after the `quality` line:

```ts
// Before the scene chunk: the résumé must open even if the landscape never does.
createResume()
```

`src/boot.ts`: directly after `const director = createDirector(lenis)`, add:

```ts
// The résumé sheet (ui/resume.ts) is modal: the walk holds still underneath it.
if (document.querySelector<HTMLDialogElement>('#resume')?.open) lenis.stop()
window.addEventListener('resume:toggle', (event) => {
  if (event.detail.open) lenis.stop()
  else lenis.start()
})
```

- [ ] **Step 7: Create `src/styles/resume.css` and import it**

Add `@import './resume.css';` as the last line of `src/styles/index.css`.

```css
.resume-open {
  min-height: 44px;
  padding: 0.4rem 1rem;
  border: 1px solid rgb(244 241 234 / 22%);
  border-radius: 999px;
  background: rgb(15 32 30 / 58%);
  color: var(--ui-text);
  font: 500 0.72rem var(--font-body);
  letter-spacing: 0.035em;
  cursor: pointer;
}
.resume-open:hover {
  border-color: var(--accent);
  background: rgb(15 32 30 / 82%);
}
html:not(.js) .resume-open {
  display: none;
}
html.no-scene .resume-open {
  border-color: rgb(28 42 36 / 30%);
  background: none;
  color: var(--ink);
}

.resume {
  width: min(46rem, calc(100vw - 2rem));
  max-height: calc(100dvh - 2rem);
  padding: 0;
  border: 0;
  border-top: 2px solid #a86a4b;
  background: var(--paper);
  color: var(--ink);
  overscroll-behavior: contain;
  box-shadow: 0 24px 80px rgb(8 14 13 / 45%);
}
.resume::backdrop {
  background: rgb(13 24 23 / 66%);
  backdrop-filter: blur(3px);
}
.resume-sheet {
  padding: clamp(1.25rem, 4vw, 2.75rem);
}
.resume-tools {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-bottom: 1rem;
}
.resume-tools button,
.resume-goto {
  min-height: 44px;
  padding: 0.4rem 0.9rem;
  border: 1px solid rgb(28 42 36 / 28%);
  border-radius: 999px;
  background: none;
  color: var(--ink);
  font: 500 0.72rem var(--font-body);
  letter-spacing: 0.035em;
  cursor: pointer;
}
.resume-tools button:hover,
.resume-goto:hover {
  border-color: #875134;
  color: #875134;
}
.resume :is(a, button):focus-visible {
  outline: 2px solid #875134;
  outline-offset: 3px;
}
.resume p,
.resume li {
  max-width: none;
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.6;
  color: #3d4640;
}
.resume a {
  color: #875134;
}
.resume a:hover {
  color: var(--ink);
}
.resume-head h2 {
  font-size: clamp(2rem, 4vw, 2.8rem);
  margin-bottom: 0.25em;
}
.resume-contact {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1.25rem;
  margin-top: 0.6rem !important;
}
.resume section {
  margin-top: 1.9rem;
}
.resume h3 {
  margin: 0 0 0.9rem;
  padding-bottom: 0.45rem;
  border-bottom: 1px solid rgb(28 42 36 / 20%);
  font: 500 0.7rem var(--font-body);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #655e51;
}
.resume-entry + .resume-entry {
  margin-top: 1.15rem;
}
.resume-entry-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
}
.resume h4 {
  margin: 0;
  font: 500 1.08rem var(--font-display);
  letter-spacing: -0.01em;
}
.resume-when {
  flex: none;
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  color: #655e51;
}
.resume-role {
  font-style: italic;
}
.resume ul {
  margin: 0.35rem 0 0;
  padding-left: 1.1rem;
}
.resume-goto {
  margin-top: 0.6rem;
}
html.no-scene .resume-goto {
  display: none;
}
.resume-skills {
  margin-top: 0.8rem !important;
}
@media (max-width: 640px) {
  .resume {
    width: 100vw;
    max-width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    margin: 0;
  }
  .resume-entry-head {
    flex-direction: column;
    gap: 0.1rem;
  }
}

/* Printing with the sheet open gives the résumé alone, as a clean page. */
@media print {
  html:has(.resume[open]),
  html:has(.resume[open]) body {
    background: #fff;
    overflow: visible !important;
  }
  html:has(.resume[open]) :is(#gl, #curtain, #overlay, .scroll-track, .skip-link) {
    display: none !important;
  }
  .resume[open] {
    position: absolute;
    inset: 0 auto auto 0;
    width: 100%;
    max-width: none;
    height: auto;
    max-height: none;
    margin: 0;
    border: 0;
    background: #fff;
    box-shadow: none;
    overflow: visible;
  }
  .resume::backdrop,
  .resume-tools,
  .resume-goto {
    display: none;
  }
  .resume-sheet {
    padding: 0;
  }
}
```

- [ ] **Step 8: Run the tests**

```bash
pnpm typecheck && pnpm lint && pnpm format
lsof -ti :4173 | xargs kill 2>/dev/null; true
pnpm test:e2e
pnpm check:dist
ls dist/assets | grep resume-content
```

Expected: e2e all PASS; both greps print nothing; a `resume-content-*.js` chunk exists. If the first grep finds the address (the minifier folded the reversal), build it in `resumeHtml` from `atob('dGFuZ3NjQHN0YW5mb3JkLmVkdQ==')` instead and re-run.

- [ ] **Step 9: Look at it**

With `pnpm dev` running, screenshot the open sheet at 1440x900 and with the Pixel 7 profile (`http://localhost:5173/#resume`), and a print rendering (`page.emulateMedia({ media: 'print' })` then screenshot). Check: readable hierarchy, no clipped text, header button aligned with the sound button, print view is black on white with no scene.

- [ ] **Step 10: Commit**

```bash
git add index.html src/ui/resume.ts src/ui/resume-content.ts src/styles/resume.css src/styles/index.css src/main.ts src/boot.ts e2e/portfolio.spec.ts
git commit -m "feat(resume): a résumé sheet loaded on demand, kept out of the served page"
```

---

### Task 4: Deep links

**Files:**

- Modify: `src/boot.ts`, `e2e/portfolio.spec.ts`

**Interfaces:**

- Consumes: `deepLinkT(hash)` from Task 1; the `hashchange` dispatch from Task 3; `storyToScroll` from `config/beats`.

- [ ] **Step 1: Write the failing tests**

Append to `e2e/portfolio.spec.ts`:

```ts
const storyT = (page: Page) => page.evaluate(() => window.__scene?.state?.t ?? -1)

test('a project fragment starts at that wall with everything loaded', async ({ page }) => {
  await open(page, '/#robotics')
  expect(await storyT(page)).toBeCloseTo(0.456, 3)
  expect(await page.evaluate(() => window.__scene?.settled)).toBe(true)
  await expect(page.locator('[data-slot="robotics"]')).toHaveCSS('opacity', '1')
})

test('the résumé can send the visitor to a project in the house', async ({ page }) => {
  await open(page, '/#resume')
  const sheet = page.getByRole('dialog', { name: 'Résumé' })
  await sheet.getByRole('button', { name: 'See CPH2H in the house' }).click()
  await expect(sheet).toBeHidden()
  await expect(page).toHaveURL(/#cph2h$/)
  await expect.poll(() => storyT(page), { timeout: 15_000 }).toBeCloseTo(0.364, 2)
})

test('unknown fragments are ignored and ?t= wins over a fragment', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await open(page, '/#nope')
  expect(await storyT(page)).toBeCloseTo(0, 3)
  await page.goto('about:blank')
  await open(page, '/?t=0.9#cph2h')
  expect(await storyT(page)).toBeCloseTo(0.9, 3)
  expect(errors).toEqual([])
})
```

- [ ] **Step 2: Run to verify failure**

Run: `lsof -ti :4173 | xargs kill 2>/dev/null; pnpm exec playwright test e2e/portfolio.spec.ts -g "fragment|house" --project=desktop`
Expected: the first two FAIL (t stays 0); the third passes already.

- [ ] **Step 3: Implement in `src/boot.ts`**

Add `storyToScroll` to the `./config/beats` import and add `import { deepLinkT } from './config/projects'`.

Replace the `eager` declaration with:

```ts
// A frozen or seeked start must be complete at any t, so it also waits for the deferred assets.
// A fragment that names a project or a beat (#cph2h, #paddy) is such a start.
const hashStart = deepLinkT(location.hash)
const eager = params.has('freeze') || params.has('t') || params.has('bench') || (hashStart ?? 0) > 0
```

Replace `const startT = Number(params.get('t') ?? 0)` with:

```ts
const startT = Number(params.get('t') ?? hashStart ?? 0)
```

After the `resume:toggle` listener from Task 3, add:

```ts
window.addEventListener('hashchange', () => {
  const t = deepLinkT(location.hash)
  if (t === undefined) return
  lenis.scrollTo(storyToScroll(t) * lenis.limit, { immediate: quality.reducedMotion, force: true })
})
```

- [ ] **Step 4: Run the tests**

```bash
pnpm typecheck && pnpm lint && pnpm format
lsof -ti :4173 | xargs kill 2>/dev/null; true
pnpm test:e2e
```

Expected: all PASS, including "Walk again" in `experience.spec.ts` (its `#exterior` fragment now also reaches the handler; both scroll to the top).

- [ ] **Step 5: Commit**

```bash
git add src/boot.ts e2e/portfolio.spec.ts
git commit -m "feat(scroll): fragments land on a project wall or a beat"
```

---

### Task 5: Docs and full verification

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

In **Layout**:

- change the `index.html` entry's `#overlay` description to mention "the three project slots, the Résumé button and the empty `<dialog id="resume">`";
- after the `src/config/beats.ts` line add: "`src/config/projects.ts` the three featured projects (slot id, scroll text, hold `t`) and `deepLinkT` for URL fragments";
- extend the `src/three/world/*` line's list with "scrolls";
- change the `src/ui/...` line to "`src/ui/overlay.ts`, `src/ui/resume.ts` (the sheet; wired from `main.ts`), `src/ui/resume-content.ts` (its text, a lazy chunk), `src/ui/sound.ts`, `src/ui/debug.ts` (HUD), `src/ui/bench.ts`";
- add `resume.css` to the `src/styles/*` list;
- add to the `e2e/` line: "`e2e/portfolio.spec.ts` project slots, the résumé sheet, fragments".

In **Conventions**, add:

```markdown
- Content: the three wall projects are defined once in `config/projects.ts`; slot ids, scroll
  text, reduced-motion stills and fragments all read it. The résumé must stay uncrawlable:
  its text lives only in `ui/resume-content.ts`, which is imported dynamically on first open.
  Never import it statically, never put résumé text, the email address or a phone number in
  `index.html` or `<meta>`, and add no JSON-LD.
- Fragments: `#resume` opens the sheet; `#cph2h`, `#waifu-focus`, `#robotics` and the beat ids
  start at that `t` (eager, like `?t=`, which wins if both are present).
```

In **Do not**, add: "put résumé content where a crawler reads it (the served HTML, meta tags, structured data)".

- [ ] **Step 2: Full verification**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
lsof -ti :4173 | xargs kill 2>/dev/null; true
pnpm test:e2e
```

Expected: green; in the build's size table the entry and scene chunks total <= 400 KB gz and `resume-content` is its own chunk.

With `pnpm dev` running:

```bash
OUT=<scratchpad> node <scratchpad>/frames.mjs 0 0.12 0.28 0.36 0.364 0.41 0.456 0.46 0.55 0.68 0.8 0.9 1
```

Expected: no console errors; draw calls <= 220 and triangles <= 1.5 M on every frame; the three hold frames still match Task 2's accepted look.

Phone load (the `CLAUDE.md` procedure: Pixel 7, fast 4G, CPU throttle 4, navigation to `window.__scene.ready`, summed `encodedDataLength`): transferred bytes before the curtain stay <= 1.5 MB and within about 30 KB of the 1.4 MB reference.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: project config, résumé sheet and fragment conventions"
```
