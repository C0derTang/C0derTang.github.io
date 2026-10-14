# CLAUDE.md

Personal site of Christopher Tang: one page that plays a scroll-driven three.js scene — a rainy
Japanese farmhouse you walk up to, enter, look around, leave through the back shoji, cross a
flooded rice paddy, and sink under the water to the fish (rice-fish polyculture). Stylized
realism: real geometry, CC0 PBR materials, soft shadows, fog, rain, wet surfaces, water with
refraction, depth of field. No routing, no framework, no CMS. Scrolling drives the walk, and a click, tap
or key opens a banner or a trophy in the room; with nothing open every frame is a deterministic
function of scroll progress `t` plus wall-clock time for ambient motion. Desktop is the
reference look; phones get a tuned `low` tier that loads about a tenth of the bytes. Live at
https://c0dertang.github.io/ (GitHub Pages, `gh-pages` branch, served at `/`, no CNAME).

## Stack

Vite 8, vanilla TypeScript (strict, `~6.0` until typescript-eslint supports 7), plain CSS with
custom properties, `three` (WebGL renderer + addons), `postprocessing` (pmndrs; one merged
effect pass), `lenis` (smooth scroll, source of `t`), `animejs` v4 (only for seekable timelines
and the engine tick), latin-only `@fontsource` subsets. Node >= 22.13 (`.nvmrc` = 24), pnpm 10
pinned via `packageManager` (no corepack). `minimumReleaseAge` is one day: a package version
younger than that will not install.

## Commands

- `pnpm install --frozen-lockfile` never npm/yarn; never hand-edit pnpm-lock.yaml
- `pnpm dev` :5173 (hot reload; the GPU screenshot scripts point at it)
- `pnpm typecheck` / `pnpm lint` / `pnpm format` (`format:check` runs in CI)
- `pnpm build` typecheck + `vite build` -> `dist/`; read the gz size table
- `pnpm check:dist` fails if the built `dist/` has the email address or a phone number, résumé
  text outside its chunk, banner/trophy panel text in any script but the `content`/`resume-content`
  chunks, or a project or trophy name in `index.html` or another non-script file (the e2e
  SECRETS list) (run after `pnpm build`; CI runs it)
- `pnpm preview` serve `dist/` on :4173
- `pnpm test:e2e` Playwright smoke on headless Chromium (software WebGL, minimal tier)
- `pnpm assets` rebuild `public/assets/tex/{high,low}` and the 256 px HDRI from `assets-src/`
  (Playwright's Chromium does the encoding); commit the output
- `pnpm assets:art` rebuild `public/assets/art` (the banner images) from `assets-src/art`
- `BENCH=1 pnpm bench` frame-time sweep in the installed Chrome (real GPU, headed)

## Layout

- `index.html` head/meta, `<canvas id="gl">`, the loading curtain, `#overlay` (crawlable
  placeholder copy and the Résumé button; no project text), the empty `#focus` container (hidden
  button list, hint, panel; filled on open), the empty `<dialog id="resume">` (a sibling after
  `</main>`), `.scroll-track` (seven beat spacers)
- `assets-src/tex/<set>/{color,normal,rough,ao}.jpg` the CC0 texture sources (not served)
- `assets-src/art/*.png` the banner image sources (owner-supplied, not served)
- `scripts/build-art.mjs` banner sources -> `public/assets/art/*.webp`
- `scripts/build-assets.mjs` sources -> shipped WebP tiers and the small HDRI
- `public/assets/` what ships: `tex/<tier>/<set>/{color,normal,orm}.webp` (`orm` = AO in red,
  roughness in green), the overcast HDRI at 1K and 256 px, the rain recordings, `ATTRIBUTION.md`
  (every asset: source, license, what changed)
- `src/main.ts` the entry, kept tiny: picks the quality tier, preloads the curtain's assets,
  then imports `boot.ts`
- `src/boot.ts` the scene chunk: app, overlay, HUD, Lenis, director, sound, dev hooks,
  `window.__scene`
- `src/config/assets.ts` asset URLs per tier, which texture sets are deferred past the curtain
- `src/config/beats.ts` BEATS table, overlay slot windows, scroll length — the timing tuning surface
- `src/config/art.ts` the banner images and the CPH2H glyph (painted onto the banners)
- `src/config/content.ts` the panel text of every banner and trophy; imported dynamically on
  the first open, never statically
- `src/config/projects.ts` the three banner ids, names and hold `t` (no copy) and
  `deepLinkT` for URL fragments
- `src/config/quality.ts` tiers: `high` (desktop), `low` (small/touch viewports: half-res
  textures, small HDRI, fewer instances, pixel-budget DPR), software WebGL (headless test runs)
- `src/scroll/director.ts` the single rAF loop: lenis.raf -> t -> subscribers -> anime engine.update()
- `src/three/app.ts` renderer, scene assembly, per-frame update order, `stats()`
- `src/three/state.ts` pure `computeState(t, time, dt, scrollVel, quality)`: pose, doors, depth,
  underwater flag, fog / light / focus / grade / rain keys, slots
- `src/three/camera.ts` the camera path in metres (position and target tracks, yaw during the turn)
- `src/three/atmosphere.ts` fog, HDRI sky, the shadow-casting sun with its fitted frustum, room lights
- `src/three/materials.ts` the material registry (`make(set, opts)` over the CC0 sets, water,
  procedural water normals)
- `src/three/post.ts` one EffectPass: depth of field (reads the main depth), grade, vignette, SMAA
- `src/three/loader.ts` two-stage loading (curtain, then deferred), one shared image per URL,
  off-thread decode, HDRI
- `src/three/world/*` one module per part of the world (`{ group, update? }`): house + yard,
  interior, terrain, paddy, underwater, fish, rain, scrolls (the banners), trophies (the case)
- `src/three/focus.ts` the focus layer: `{ id, k }` on wall-clock time, one raycaster, the open
  camera and the grade dim; calls the `Interactive` world parts (`world/types.ts`)
- `src/ui/focus.ts` pointer and key input, the hidden buttons, the hint, the panel, the scroll lock
- `src/audio/*` the soundscape: nothing is fetched or decoded until the sound button (desktop
  prepares it after the scene has settled)
- `src/ui/overlay.ts`, `src/ui/resume.ts` (the sheet; wired from `main.ts`),
  `src/ui/resume-content.ts` (its text, a lazy chunk), `src/ui/sound.ts`, `src/ui/debug.ts` (HUD),
  `src/ui/bench.ts`
- `src/styles/*` `tokens.css`, `fonts.css`, `base.css`, `gl.css`, `type.css`, `overlay.css`,
  `focus.css`, `resume.css`
- `e2e/smoke.spec.ts` every beat without console errors, the underwater flip, pose purity
  forward vs backward; `e2e/portfolio.spec.ts` banners and trophies, the résumé sheet, fragments;
  `e2e/bench.spec.ts` frame-time gates

## World

Metres, +y up, the camera starts at +z looking toward −z, the doorway threshold is the origin.
House front wall z 0 (x ±5.5, eave y 3.2, ridge y 6, depth 7, back shoji at z −7, floor y 0.41);
gravel path z 0..24; paddy water y −0.3 (`WATER_Y`) from z −8 to −52 between dikes at x ±2.6;
terraces z −47..−70; ridges z −150 / −300 / −600; mud bed y −3; the dive crosses the surface at
(0, −0.3, −24) around t .80. Beats (`config/beats.ts`): exterior 0–.15, enter .15–.32, turn
.32–.50 (a real 360 yaw with dwell plateaus), doors .50–.58, paddy .58–.76, dive .76–.85,
underwater .85–1.
The turn has three holds, each facing a wall: banners at t .364 (yaw 90, camera at
(0.70, 1.45, −3.40), 4.5 m from the +x wall, fov 66; three 0.6 × 1.5 m banners), the front at
yaw 180, trophies at t .456 (yaw 270, camera at (−2.70, 1.45, −4.90); the case on the −x wall).
Opening is allowed only while `focus.active` (turn beat, yaw within 25° of 90 or 270).

## Conventions

- Pure in `t`: the camera pose, doors, fog, lights, focus and grade come from keyed tracks in
  `state.ts`/`camera.ts` (monotone cubics: flat key pairs are exact holds). Ambient motion (rain,
  water normals, wind, lamp flicker, fish) is a closed form of `state.time`; never integrate
  state on the CPU per frame. Frozen frames (`?freeze`) hold `time`; scrubbing back must
  reproduce frames. `state.reduced` (prefers-reduced-motion) disables all ambient motion.
- The focus layer is the only state outside `t`: wall-clock `{ id, k }` (`three/focus.ts`). With
  nothing open the frame is exactly the scroll frame; opening only overrides the camera, grade
  and the opened part afterwards, and never changes `computeState`. Parts implement
  `Interactive` (pickables, `setHover`, `setOpen`). Depth of field is off on every tier, so
  the focus override has no visible effect there. Dev hook: `window.__scene.focus`
  (`open(id)`, `close()`, `state`).
- One rAF loop. Nothing else touches the renderer; world modules only mutate their own objects
  inside `update(state)`.
- Materials come from the registry: `mats.make(set, { repeat, roughness, color })` with UVs laid
  out in metres. Wetness is lower roughness plus a darker tint. No unlit surfaces except sprites.
  Variants of a set share its images (the loader hands every texture for a URL the same
  source), so another `make()` costs no download or GPU memory; never load a texture around it.
- Shadows: only solid architecture, trunks, walls, posts, the lantern, bicycle and pole cast;
  instanced foliage, rice, florets and cards never do; grounds and floors receive. One shadow
  light whose frustum is fitted to the view every frame; no cascades.
- Instancing for anything repeated; per-instance animation in `onBeforeCompile` from a `uTime`
  uniform. Rain instances inside the house box are collapsed in the shader.
- Post: keep it one EffectPass. The depth of field reads the main depth texture; never add a
  pass that re-renders the scene.
- Content: banner and trophy text (names, lines, facts, links) lives only in
  `config/content.ts`, fetched by dynamic import after the scene settles. Until an object is
  opened it is in neither `index.html`, `<meta>`, the DOM nor the hidden-button labels
  (generic: "Banner 1 of 3"). `config/projects.ts` holds ids and hold `t` only. Banner ids:
  cph2h, waifu-focus, robotics; trophy ids: vex, scibowl, tedx, usaco, half, muscleup, bench,
  swim. The résumé must stay
  uncrawlable: its text lives only in `ui/resume-content.ts`, which is imported dynamically on
  first open. Never import it statically, never put résumé text, the email address or a phone
  number in `index.html` or `<meta>`, and add no JSON-LD. `pnpm check:dist` enforces it.
- Fragments: `#resume` opens the sheet; `#cph2h`, `#waifu-focus`, `#robotics` start at the banner
  hold and open that banner once the scroll rests there; the beat ids start at that `t` (all
  eager, like `?t=`, which wins if both are present).
- Assets: CC0 or owner-supplied (the banner images), each listed in `public/assets/ATTRIBUTION.md`; WebP built by `pnpm assets` from
  the JPG sources (`high`: 1K colour and normal, 512 packed AO/roughness; `low`: half of each);
  banner WebP built by `pnpm assets:art` from `assets-src/art`; procedural everything else (no
  glTF pipeline). Never hand-edit `public/assets/tex` or `public/assets/art`.
- Loading is staged. The curtain waits only for what the opening view shows; sets listed in
  `DEFERRED_SETS` (`config/assets.ts`: tatami, mud) load after it lifts and render as a flat
  stand-in until they arrive. A set may be deferred only if nothing before the enter beat shows
  it. `?freeze`, `?t=` and `?bench` are eager: they hold the curtain for everything, so frames
  stay deterministic (`window.__scene.settled`). Sound never holds the curtain.
- Phones: the `low` tier is tuned for load time and memory, and portrait screens widen the
  camera angle in `app.ts` (`fitFov`) rather than changing the path; `state.pose` stays the
  same on every screen. Frame time on real phones is not measured anywhere yet.
- Budgets: JS <= 400 KB gz; draw calls <= 220 and triangles <= 1.5 M per frame (`?debug` HUD
  and `renderer.info` via `window.__scene.app.stats()`); p95 frame <= 16.7 ms at 1440x900 DPR
  1.5 on an Apple-silicon integrated GPU (`pnpm bench`); shipped assets <= 9 MB in total, and
  <= 1.5 MB transferred before the curtain lifts on the `low` tier.
- TS strict + `noUncheckedIndexedAccess`; no `!` assertions (use `mustGet`). Prettier formats
  everything; ESLint is type-aware.

## Verification (before claiming anything works)

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm check:dist`
  green; sizes under budget.
- Real-GPU frames: with `pnpm dev` running, a Playwright script using `channel: 'chrome'` and
  `--use-angle=metal` renders `http://localhost:5173/?freeze&t=<f>` for f in 0, .12, .28, .36,
  .364, .41, .456, .46, .55, .68, .8, .9, 1 (the scratchpad `gl.mjs` does this and prints draw calls,
  triangles and console errors). Headless Chromium only proves it runs: SwiftShader is slow and
  drops to the software tier.
- Open objects: the same script at t .364 and .456 after `window.__scene.focus.open(id)` (wait
  for `focus.state.k` = 1): one banner and one trophy, desktop and `Pixel 7`; check the panel
  text, draw calls and triangles.
- Phone load: the same script with `devices['Pixel 7']`, CDP `Network.emulateNetworkConditions`
  (fast 4G: 9 Mbps, 165 ms) and `Emulation.setCPUThrottlingRate` 4, timing navigation to
  `window.__scene.ready` and summing `encodedDataLength`. The `scene:built` / `scene:loaded` /
  `scene:compiled` / `scene:warm` performance marks split the boot. Reference: about 2.6 s and
  1.4 MB on fast 4G.
- Purity: a backward scrub 1 -> .55 -> .41 -> .28 -> 0 gives the same `window.__scene.state.pose`
  as forward; `pnpm test:e2e` checks it.
- `BENCH=1 pnpm bench` for frame time, long tasks, draw calls, triangles (`BENCH_GPU=1` gates p95).

## Deploy

Push to `main` -> `.github/workflows/deploy.yml` (install, lint, typecheck, format check,
build) -> peaceiris publishes `dist/` to the orphan `gh-pages` branch. `base` is `/`; there is
no CNAME. PRs run the same checks without publishing. `main` is production: work on a branch,
merge via PR.

## Do not

- add React/Vue/Svelte, Tailwind, CSS-in-JS, a router, a CMS, react-three-fiber, or a physics engine
- add assets that are neither CC0 nor owner-supplied, or any asset without an `ATTRIBUTION.md` entry
- add dependencies beyond three/postprocessing/lenis/animejs/fontsource without asking
- use npm/yarn, commit `package-lock.json`, or bump TypeScript to 7 while typescript-eslint lacks support
- integrate motion on the CPU per frame, add a second render of the scene, or cast shadows from instances
- make the curtain wait for sound, for a deferred set, or for anything the opening view does not show
- change the desktop look to save bytes for phones; put the saving in the `low` tier
- put résumé content where a crawler reads it (the served HTML, meta tags, structured data)
- write project or trophy text into the DOM, `index.html` or meta before an open
- make the focus layer change `computeState` or the scroll pose
- commit directly to `main`
