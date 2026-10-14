# Interactive banners and a trophy case: implementation plan

**Goal:** Three imagery-only banners on the right wall and an eight-trophy case on the left
wall, each opened by click, tap or key; nothing about the work is readable before that.

**Architecture:** The scroll path stays pure in `t` (`camera.ts`, `state.ts`). A separate
focus layer (`src/three/focus.ts`) owns `{ id, k }` on wall-clock time, picks with one
raycaster, blends the camera for banners and tells the world parts what is hovered and open.
The DOM side (`src/ui/focus.ts`) owns pointer and key input, the panels and the scroll lock.

**Tech stack:** as in `CLAUDE.md`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-12-interactive-banners-trophies-design.md`

The owner asked for the build first and changes after, with subagents fanned out. Tasks in the
same wave run in parallel and touch disjoint files or disjoint regions of a file; the
controller commits after each wave.

## Global constraints

- Everything in `CLAUDE.md` applies except where the spec changes it (clicks are allowed;
  owner-supplied art is allowed and listed in `ATTRIBUTION.md`).
- `computeState` and `cameraPose` stay pure in `t`. With nothing open, a frame is exactly the
  scroll frame.
- No project name, trophy title or stat in `index.html`, `<meta>` or any DOM node before an
  object is opened. Panel text lives only in `src/config/content.ts`, imported dynamically.
- The résumé sheet, `resume-content.ts` and `scripts/check-dist.mjs` are not changed. No phone
  number and no email literal anywhere.
- Budgets: JS ≤ 400 KB gz, draw calls ≤ 220, triangles ≤ 1.5 M, `low` tier ≤ 1.5 MB before
  the curtain. Nothing new loads before the curtain.
- Strict TS, no `!`, Prettier, type-aware ESLint. Ambient motion is a closed form of time and
  is off under `state.reduced`.
- Do not push, merge or rewrite history.

## Shared interfaces (already in `src/three/world/types.ts`)

```ts
export interface Pickable {
  id: string
  kind: 'banner' | 'trophy'
  object: Object3D
}
export interface OpenState {
  id: string
  k: number // eased openness, 0..1
  since: number // ms since this object began opening
}
export interface Interactive {
  readonly pickables: readonly Pickable[]
  setHover(id: string | null): void
  setOpen(open: OpenState | null, camera: PerspectiveCamera): void
}
```

Ids: banners use `ProjectId` (`cph2h`, `waifu-focus`, `robotics`); trophies use `vex`,
`scibowl`, `tedx`, `usaco`, `half`, `muscleup`, `bench`, `swim`.

## Wave 1 (parallel)

### Task A: banner art

Files: `scripts/build-art.mjs`, `assets-src/art/{waifu,robot}.png`,
`public/assets/art/{waifu,robot}.webp`, `src/config/art.ts`, `public/assets/ATTRIBUTION.md`,
`package.json` (script `assets:art`).

- Port the scratchpad `ink.mjs` filter (grey, two blurs, sharpened difference, soft threshold,
  elliptical edge fade for the robot, border fade for both) into a build script that uses
  Playwright's Chromium like `scripts/build-assets.mjs`. Output: ink colour `#1a1c1e` with
  alpha, WebP, 512 px wide, each under 40 KB.
- `src/config/art.ts`: `CPH2H_GLYPH` (the path data from the fetched `icon.svg`, viewBox 64),
  `ART = { waifu: '/assets/art/waifu.webp', robot: '/assets/art/robot.webp' }`.
- Attribution entries: owner-supplied art, what was changed.
- Check: the script reproduces both files; view both outputs on a paper-coloured background.

### Task B: the walk and the removal of the text cards

Files: `src/three/camera.ts`, `src/config/beats.ts`, `src/config/projects.ts`,
`src/three/state.ts`, `index.html`, `src/styles/overlay.css`, `e2e/motion.spec.ts`,
`e2e/portfolio.spec.ts`.

- `fov` narrows to about 42 across the banner hold (.357–.371) and is back to 64 by .401.
- Position tracks: reach about (−2.7, 1.45, −4.9) for the trophy hold (.449–.463), then return
  to the doors path. Keep clear of the hearth at (0, −3.4). The yaw track is unchanged.
- `SLOTS` loses the three project entries; `index.html` loses the three `.slot-project`
  sections; their CSS goes. `PROJECTS[].t` all become the middle of the banner hold; drop the
  `scroll` text field and `motif` if nothing else reads them after Task C (leave them if
  `scrolls.ts` still compiles against them; Task C removes them).
- Focus keys if a wall is out of the depth of field at its hold.
- e2e: remove the slot-visibility tests for projects; keep the résumé and fragment tests
  compiling (fragment expectations: `state.t` inside the banner hold for all three ids).
- Check: typecheck, lint, the purity test, frames at .364, .41, .456.

## Wave 2 (parallel)

### Task C: banners

Files: `src/three/world/scrolls.ts`, `src/three/world/interior.ts` (the `+x wall` section
only), `src/config/projects.ts` (drop unused fields), `src/three/app.ts` (only the lines that
load the two art images and join `painted`).

- Three scrolls on the +x wall, about 1.9 m tall, one mesh each, `Interactive` implemented.
  Faces per spec section 2. Also export
  `paper(id): { center: Vector3; normal: Vector3; width: number; height: number }`.
- Glow: emissive plus one additive halo quad per banner; intensity a closed form of
  `state.time`, higher for the hovered id and for the open one.
- Move the pot rack and jar shelf; keep the stove and window.
- Check: real-GPU frames at .364 on desktop and Pixel 7; draw calls.

### Task D: trophy case

Files: `src/three/world/trophies.ts` (new), `src/three/world/interior.ts` (the `-x wall`
section only), `src/three/app.ts` (register the part).

- Case and eight trophies per spec section 3, `Interactive` implemented. `setOpen` moves the
  open trophy on an arc to 0.9 m in front of the camera, spinning in, then turning and
  circling with a bob, as a closed form of `since`; `k` drives the leave and return. Under
  `state.reduced` it sits still at the hover point.
- Check: real-GPU frames at .456 on desktop and Pixel 7; a frame with one trophy held open
  through a temporary call; draw calls.

## Wave 3

### Task E: the focus layer, the panels, the links

Files: `src/three/focus.ts` (new), `src/three/app.ts`, `src/ui/focus.ts` (new),
`src/styles/focus.css` (new), `src/styles/index.css`, `src/config/content.ts` (new),
`src/boot.ts`, `src/ui/resume.ts` / `resume-content.ts` only where the "See it in the house"
target changes, `index.html` (panel and hidden-button containers, empty).

- Spec sections 4, 5 and 6 in full: picking, `{ id, k }`, camera blend for banners, dimming
  and depth-of-field focus for trophies, the panels, the scroll lock, Esc / close / outside
  click, hidden buttons, the hint, reduced motion, phones, fragments opening a banner.
- `window.__scene.focus = { open(id), close(), state }` for tests.

## Wave 4

### Task F: tests and docs

Files: `e2e/portfolio.spec.ts`, `e2e/smoke.spec.ts` if needed, `CLAUDE.md`.

- The tests listed in the spec's Testing section. `CLAUDE.md`: intro line, Layout,
  Conventions, Do not.

Then the full verification from `CLAUDE.md`, real-GPU frames with each kind of object open,
and one whole-branch review.
