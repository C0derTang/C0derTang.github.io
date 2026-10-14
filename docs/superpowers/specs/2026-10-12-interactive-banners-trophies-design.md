# Interactive banners and a trophy case

Date: 2026-10-12. Branch: `feat/portfolio-content` (continues the work in
`2026-10-11-portfolio-content-design.md`, which this spec amends).

## Goal

The room should show Christopher's work without telling it. Nothing about a project or an
accomplishment is readable until the visitor clicks the object that stands for it.

1. **Banners.** The three project scrolls move to the right wall together. They carry imagery
   only, glow faintly and pulse. Clicking one flies the camera in until the banner fills the
   screen, and the project's information appears on it.
2. **Trophy case.** The left wall gets a shelf case with eight trophies. The scroll path walks
   the camera around the hearth to stand in front of it. Clicking a trophy lifts it off the
   shelf, spins it toward the camera and leaves it hovering and turning beside a description.

Success: scrolling alone shows a room with glowing objects and no words about the work; every
banner and trophy opens by mouse, touch and keyboard; the scroll path stays a pure function of
`t`; no budget in `CLAUDE.md` is exceeded.

## Decisions made with the owner

- All three banners hang on the right (+x) wall. Wall furniture may move to make room.
- The room keeps three stops: banner wall, front wall (décor only), trophy case.
- Banner faces have no words. CPH2H shows its logo glyph; Waifu Focus shows the extension's
  character art; Robotics shows the owner's photograph of the 11475B robot. Every image is
  rendered in a calligraphic ink style. The robot uses the ink filter on the photo, not a
  redrawing.
- The Robotics banner's information covers both the VEX competition team and the nonprofit.
- Trophies: VEX, Science Bowl, TEDx, USACO Silver, half marathon 1:58, 4 muscle ups, 225 lb
  bench press, 100 freestyle 50.8. No valedictorian trophy and no Bakersfield Robotics trophy.
- The three timed project text cards are removed.

## What changes in the rules

`CLAUDE.md` is updated in the same change:

- "Scrolling is the only input" becomes: scroll drives the walk; a click, tap or key press
  opens a banner or a trophy. The scroll path and `computeState` stay pure in `t`. The opened
  view is a separate layer described below.
- Assets: CC0, or art supplied by the owner. Owner-supplied art is listed in
  `public/assets/ATTRIBUTION.md` as such.
- Project and trophy text is never in `index.html` or `<meta>`. It ships in a script chunk
  only. The project blurbs therefore stop being crawlable; the owner accepts this.

## Design

### 1. The walk: `src/three/camera.ts`, `src/config/beats.ts`, `src/three/state.ts`

The turn beat keeps its three holds and its yaw track. Two things are added, both as keyed
tracks in `t`:

- **Banner hold (yaw 90).** The field of view narrows during the hold (from 64 to about 42
  degrees) so banners 6.2 m away read large. The value is tuned on real-GPU frames so the three
  banners span most of the frame width on desktop and stay inside it on a portrait phone
  (`fitFov` still widens portrait screens).
- **Trophy hold (yaw 270).** The position tracks move the camera from (−0.95, 1.45, −3.2)
  to about 2.5 m in front of the case (near x −2.7, at the case's z), then back to the centre
  line for the doors beat. The path stays clear of the hearth at (0, −3.4) and its kettle.
- The front-wall hold (yaw 180) is unchanged and shows no content.

Hold windows may lengthen to give time to click; the beat boundaries in `BEATS` do not move.
`SLOTS` loses `cph2h`, `waifu-focus` and `robotics`. `PROJECTS[].t` all point at the middle of
the banner hold. Under reduced motion `turnStill` snaps to the nearest of the three holds as
before. Focus keys are added if a wall is outside the depth of field at its hold.

### 2. Banners: `src/three/world/scrolls.ts`, `src/config/projects.ts`

- Three kakejiku on the +x wall, about 1.9 m tall, evenly spaced, clear of the posts and the
  kitchen window. The pot rack and the jar shelf move off this wall or lower; the stove stays.
  Positions are tuned on real-GPU frames at the banner hold.
- Faces are painted into the existing canvas atlas (larger cells for the larger scrolls):
  mount, paper, the image, a red seal. No name, no text.
  - CPH2H: the glyph path from the site's icon, drawn in ink with its cyan and red offsets as
    faint washes, an ink ring behind, crossed strokes below. The path is inline data.
  - Waifu Focus and Robotics: one alpha image each, already converted to ink (dark areas
    solid, edges as lines, faded at the borders), built once by a script from the sources in
    `assets-src/art/` and shipped as WebP in `public/assets/art/`. They load after the curtain
    with the deferred stage; eager starts wait for them.
- Glow: the paper has an emissive term and a soft additive halo quad behind each banner. The
  intensity is a closed form of `state.time` (a slow sine, phase-shifted per banner) and rises
  when the banner is hovered. Under reduced motion it is constant.
- Each banner is its own mesh so it can be picked and lit separately. Nothing casts a shadow.

### 3. Trophy case: `src/three/world/trophies.ts`

- A dark wood case on the −x wall beyond the window (around z −4.7): two shelves, a back
  panel, eight trophies. The tea chest, futon and tools move along the wall to make room.
- Trophies are procedural (lathe and primitive geometry), about 0.25–0.35 m tall, one shared
  gold material and one silver, both reflecting the HDRI. Shapes:

  | Id         | Shape                      |
  | ---------- | -------------------------- |
  | `vex`      | cup topped with a gear     |
  | `scibowl`  | bowl holding an atom       |
  | `tedx`     | red disc with a microphone |
  | `usaco`    | silver medal on a stand    |
  | `half`     | running shoe on a plinth   |
  | `muscleup` | gymnast rings on a frame   |
  | `bench`    | barbell on a rack          |
  | `swim`     | wave crest on a plinth     |

- No labels or plates are readable on the shelf. Each trophy pulses with the same glow as
  the banners (emissive, closed form of `state.time`).
- Each trophy is one mesh (merged parts) so it can be picked and moved: at most 8 draw calls
  plus the case. Trophies do not cast shadows; the case does.

### 4. The opened view: `src/three/focus.ts`, `src/ui/focus.ts`, `src/styles/focus.css`

A small interaction layer, separate from `computeState`.

- **Picking.** One raycaster against the banner and trophy meshes on pointer move and click,
  active only while a hold with content is on screen. Hover sets the pointer cursor and
  raises the glow. The canvas does not take pointer events today; the listener goes on the
  window and ignores events that hit overlay controls.
- **State.** `{ id | null, k }`, where `k` runs 0 to 1 over about 0.9 s of wall-clock time on
  open and back on close, eased. It lives in the app, not in `state.ts`. With nothing open the
  frame is exactly the scroll frame, so `?freeze` frames, the purity check and the bench are
  unaffected.
- **Banner open.** The camera pose is blended from the scroll pose to a pose square to the
  banner at the distance where its paper fills the screen (computed from the aspect ratio and
  the field of view). At `k = 1` an HTML panel is laid over the paper: name, one line, facts,
  link. The text is real DOM, so it is sharp, selectable and readable by assistive tech.
- **Trophy open.** The camera does not move. The trophy leaves its shelf on an arc toward a
  point about 0.9 m in front of the camera, spinning as it comes; once there it turns on its
  axis and travels a small circle while bobbing. Its motion is a closed form of the time since
  opening. The other trophies and the room dim; the depth of field focuses on the trophy. An
  HTML panel beside it gives the title and description.
- **While open.** Lenis is stopped. Esc, the close button, a click outside the panel, or a
  second click on the object closes it. Only one object is open at a time.
- **Keyboard and assistive tech.** A visually hidden list of buttons, one per banner and
  trophy, is in the DOM while their hold is on screen; Enter opens, focus moves into the panel
  and returns on close. Button labels are generic until opened ("Banner 1 of 3").
- **Hint.** The first time each hold is reached, a small line ("Tap what glows") shows once.
- **Reduced motion.** No fly-in and no spin: the opened view cuts in, the trophy hovers still.
- **Phones.** Tap opens. The panel is a bottom sheet for trophies and sits on the paper for
  banners. Pick targets are padded to at least 44 px.

### 5. Content: `src/config/content.ts`

One lazy chunk, imported after the scene settles (or at the first open, whichever is first),
holding the panel text for the three projects and eight trophies. Not in `index.html`.

Projects:

| Id            | Name        | Line                                                                                                                                  | Facts                                                            | Link             |
| ------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------- |
| `cph2h`       | CPH2H       | Head-to-head competitive programming: live 1v1 Codeforces matches, voice and video, Elo.                                              | Built at Rice Residency · Sponsored, FR8                         | cph2h.com        |
| `waifu-focus` | Waifu Focus | A Chrome extension that blocks distracting sites on your schedule, with themes.                                                       | 1,900+ installs · 4.8 / 5                                        | Chrome Web Store |
| `robotics`    | Robotics    | Captain of VEX Team 11475B, and founder of Bakersfield Robotics, a 501(c)(3) teaching free robotics to K–8 students in three schools. | 2× Worlds qualifier · 3 Excellence Awards · 100+ students taught | none             |

Trophies (title; description):

- VEX Robotics; captain of Team 11475B, 10+ competitions, twice qualified for the World
  Championship, three Excellence Awards.
- National Science Bowl; top 16 in the nation, 2025.
- TEDx; speaker, 2025.
- USACO; Silver division.
- Half marathon; 1:58.
- Muscle ups; 4 in a row.
- Bench press; 225 lb.
- 100 yd freestyle; 50.8.

The owner may add a line to any of these later (the swim course, the talk title).

### 6. What is removed or rewired

- `index.html`: the three `.slot-project` sections and their styles.
- `#cph2h`, `#waifu-focus`, `#robotics`: start at the banner hold (eager) with that banner
  opened once the scene is ready. The résumé's "See it in the house" does the same.
- The résumé sheet, its lazy chunk and `pnpm check:dist` are unchanged.

## Testing

- e2e (`e2e/portfolio.spec.ts`, replacing the slot tests):
  - the served HTML and the DOM before any click contain no project name, no trophy title and
    no stat ("CPH2H", "Science Bowl", "1:58");
  - at the banner hold, opening each banner (through `window.__scene` and through its hidden
    button) shows its panel with the right name and link; Esc closes it and the pose returns
    to the scroll pose exactly;
  - at the trophy hold, opening each trophy shows its title; only one is open at a time;
  - the page does not scroll while something is open;
  - `/#cph2h` ends with the CPH2H panel open;
  - reduced motion: opening cuts in without a tween;
  - the existing purity and console-error checks still pass.
- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm check:dist`; JS
  under 400 KB gz.
- Real-GPU frames at the `CLAUDE.md` list plus the three holds, and one frame with each kind
  of object open, on desktop and Pixel 7; draw calls ≤ 220, triangles ≤ 1.5 M.
- Phone load on the `low` tier does not regress: the two images and the content chunk load
  after the curtain.

## Out of scope

New copy for the other beats, sound for the interactions, a real trademark logo, changes to
the résumé sheet, and any change outside the house interior.
