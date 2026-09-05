# CLAUDE.md

Personal site of Christopher Tang: one page that plays a scroll-driven scene — a rainy Japanese
farmhouse you dolly into, leave through the back shoji, cross a rice paddy, and sink under the
water to the fish (rice-fish polyculture). CSS-transform + inline-SVG layers, canvas particles.
No routing, no framework, no CMS. Scrolling is the only input; every pixel is a deterministic
function of scroll progress `t` (plus wall-clock time for ambient loops). Live at
https://c0dertang.github.io/ (GitHub Pages, `gh-pages` branch, served at `/`, no CNAME).

## Stack

Vite 8, vanilla TypeScript (strict, `~6.0` until typescript-eslint supports 7), plain CSS with
custom properties, `lenis` (smooth scroll, source of `t`), `animejs` v4 (seekable timelines
driven by `t`; time-based ambient loops; `onScroll` is never used), latin-only `@fontsource`
subsets (Shippori Mincho + Zen Kaku Gothic New). Node >= 22.13 (`.nvmrc` = 24), pnpm 10 pinned
via `packageManager` (pnpm switches versions itself; corepack is not used).

## Commands

- `pnpm install --frozen-lockfile` never npm/yarn; never hand-edit pnpm-lock.yaml
- `pnpm dev` / `pnpm dev:lan` :5173 (`dev:lan` exposes to the LAN for phones)
- `pnpm typecheck` / `pnpm lint` / `pnpm format` (`format:check` runs in CI)
- `pnpm build` typecheck + `vite build` -> `dist/`; read the gz size table
- `pnpm preview` serve `dist/` on :4173
- `pnpm test:e2e` Playwright smoke (first: `pnpm exec playwright install chromium`)

## Layout

- `index.html` head/meta, DOM skeleton: `#stage-air`, `#stage-water`, `.waterline`, grade stack,
  `#overlay` (crawlable placeholder copy), `.scroll-track` (six beat spacers)
- `public/` `favicon.svg`, `og.jpg` only
- `src/main.ts` boot: quality tier, stages, Lenis, director, fx, overlay, dev hooks
- `src/config/beats.ts` BEATS table, camera keys, slot windows — the timing tuning surface
- `src/config/layers.ts` depth / restCz / fade / range / portal per layer — the space tuning surface
- `src/scroll/director.ts` the single rAF loop: lenis.raf -> t -> subscribers -> anime engine.update()
- `src/scene/camera.ts` `project(layer, cam, unit)` and `camera(t)`; the only place projection math lives
- `src/scene/state.ts` pure `computeState(t, time, ...)`; the DOM and canvases are projections of it
- `src/scene/stage.ts` layer registry, portal clip group, range gating, cached writes, `toScreen()`
- `src/scene/geometry.ts` shared design-space rects (doorway, shoji opening, lamp, paddy water)
- `src/scene/air/*` one layer per file (far -> near order in `air/index.ts`)
- `src/scene/water/*` underwater layers + fish layers; `src/scene/fish.ts` holds the rigs and lanes
- `src/scene/draw.ts` SVG idioms: `v()`, `wobbly()`, `pivot()`, gradients, `cedar()`, `shojiPanel()`, `riceClump()`
- `src/scene/waterline.ts` meniscus strip swept by the dive
- `src/fx/*` canvas rain / ripples / bubbles (time-based, seeded), `grade.ts` lighting keyframes
- `src/ui/overlay.ts`, `src/ui/debug.ts`
- `src/styles/*` `tokens.css` (palette + grade vars), `fonts.css`, `stage.css`, `type.css`, `overlay.css`
- `e2e/smoke.spec.ts` Playwright: seeks every beat, screenshots, asserts no console errors

## Scroll model

`t = lenis.progress` (0..1) once per frame. Beats (`config/beats.ts`): exterior 0–.18, enter
.18–.42, doors .42–.52, paddy .52–.74, dive .74–.84, underwater .84–1. Camera `cz` is a
monotone-cubic spline through keys. Layers are parallel planes at `depth`, projected in TS as
`translate + scale` about the vanishing point (design canvas 1600x1200, VP (800,700), P=1000):
`s = (P + depth - restCz) / (P + depth - cz)`. `restCz` says which camera position a layer was
authored for (exterior 0, interior 1000, paddy 2600). Portals (doorway, shoji opening) are
centered on VP; a wall dissolves (fade window in pass-through ratio `zr`) only after its portal
rim has left the viewport, and the layers behind the front wall live in a `.portal` group clipped
to the doorway while the wall is visible.

Layers are NOT CSS-transformed. The stage applies the projection by rewriting each SVG's
`viewBox` to the visible design-space window (`preserveAspectRatio="none"`), so every layer
rasterizes at viewport size no matter its scale and vectors stay crisp. Scaling composited planes
was tried first: Chrome rasterized bleed x scale^2 pixels per `will-change` layer, ran out of GPU
tile memory on the way back out, and blanked whole layers (even the HUD). Only layers with
ambient animation (`live: true`) get composited (`will-change: opacity`); the rest paint straight
into the stage.

## Conventions

- Layers are pure in `t`: `update()` writes only transform/opacity/visibility/attributes; scrubbing
  backwards must reproduce frames exactly. No scroll listeners, no timers, no autoplaying tweens
  that depend on scroll.
- One rAF loop. anime timelines are `seek()`ed from `t`; ambient anime loops (fish rigs, lanes,
  steam, noren, clouds, lamp) are time-based and scroll-independent.
- Canvas FX: `dt` from the director, seeded PRNG, DPR capped at 2 (1.5 low tier), one static frame
  under reduced motion, paused when the tab is hidden.
- Reduced motion: `computeState` snaps the camera to a per-beat still and fades through dark at
  beat boundaries; no ambient loops are created.
- Perf budget: JS <= 150 KB gz, CSS <= 30 KB gz; <= 11 live planes in air, 7 in water; no SVG
  filters inside layers (grain is one pre-rasterized tile on a fixed element); blend modes only
  on the fixed grade stack (normal on the low tier); never animate `:root` custom properties
  per frame — write the fixed grade elements and per-layer attributes directly.
- Art: hand-authored SVG in TS template strings only. Colors via `var(--token)` from tokens.css
  (canvas reads `scene/palette.ts`). viewBox `0 0 1600 1200`, `xMidYMid slice`, `overflow:
visible` for bleed. Keep what matters inside the portrait core zone x 530–1070, y 270–930.
- TS strict + `noUncheckedIndexedAccess`; no `!` assertions (use `mustGet`). Prettier formats
  everything; ESLint is type-aware.

## Adding a scene layer

1. Add its placement to `src/config/layers.ts` (`depth`, `restCz`, `fade`, `range`, `portal`).
2. Create `src/scene/air/<name>.ts` (or `water/`) exporting a `Layer` via `makeSvgLayer(id, opts, svg)`;
   use `mount()` for geometry-dependent setup and `update()` for per-frame attribute writes.
3. Register it in the far -> near list in `air/index.ts` or `water/index.ts`.
4. Check `?preview=<id>` (magenta viewBox edge for bleed), then `?debug&freeze&t=<f>` at
   f = 0, .15, .35, .5, .7, .9, 1 and scrubbed back to 0.

## Adding a content slot

1. Add `{ id, window: [in0, in1, out0, out1] }` to `SLOTS` in `config/beats.ts`.
2. Add `<section class="slot slot-<id>" data-slot="<id>">` with real copy to `index.html` and
   position it in `styles/overlay.css` (it must never sit on raw exterior/paddy art: use the
   scrim or the paper card).

## Verification (before claiming anything works)

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm build` green; sizes under budget.
- `pnpm dev`, then Playwright MCP: resize 1440x900 and 390x844; navigate
  `http://localhost:5173/?debug&freeze&t=<f>` for f in 0, .15, .35, .5, .7, .9, 1; screenshot
  each; `browser_console_messages` has no errors; a backward pass 1 -> .5 -> .35 -> 0 must
  match the forward shots; `page.emulateMedia({ reducedMotion: 'reduce' })` shows stills.
- `pnpm test:e2e` is the automated form (builds, previews, seeks every beat).

## Deploy

Push to `main` -> `.github/workflows/deploy.yml` (install, lint, typecheck, format check,
build) -> peaceiris publishes `dist/` to the orphan `gh-pages` branch. `base` is `/`; there is
no CNAME. PRs run the same checks without publishing. `main` is production: work on a branch,
merge via PR.

## Do not

- add React/Vue/Svelte, Tailwind, CSS-in-JS, a router, a CMS, three.js/WebGL
- add raster image/video assets (`public/og.jpg` is the one bitmap); no external art
- add dependencies beyond lenis/animejs/fontsource without asking
- use npm/yarn, commit `package-lock.json`, or bump TypeScript to 7 while typescript-eslint lacks support
- do per-frame work outside the director loop; put CSS transforms or `will-change` on scene layers
- commit directly to `main`
