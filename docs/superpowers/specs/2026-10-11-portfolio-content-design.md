# Portfolio content: wall scrolls and a résumé sheet

Date: 2026-10-11. Branch: `feat/portfolio-content` (off `perf/mobile-load`), merged to `main` by PR.

## Goal

The site is a scroll-driven scene with placeholder copy. This change makes it carry Christopher's
real work without changing what the site is:

1. **Wall scrolls.** The turn beat already holds on three walls of the house. Each hold shows one
   featured project as a hanging scroll in the scene, with a text slot beside it.
2. **Résumé sheet.** A link that is always in the header opens a plain, fast résumé for someone
   who will not scroll the journey. Deep links land on a project or open the sheet.

Success: a visitor who scrolls sees three projects with links; a visitor in a hurry reaches the
full résumé in one click; no budget in `CLAUDE.md` is exceeded and the camera path is unchanged.

## Decisions made with the owner

- Featured projects, in turn order: CPH2H (kitchen wall), Waifu Focus (front wall), Bakersfield
  Robotics (window wall).
- Wall objects are hanging scrolls (kakejiku), not themed props.
- Published contact: email and profile links. The phone number is never shipped. No PDF download.
- **The résumé must not be crawlable.** See "Keeping the résumé out of crawlers".
- The résumé surface is a `<dialog>` on the same page (no second page, no routing).

## Content

Source: the owner's résumé (October 2026). The joke skills line is kept verbatim.

Links:

- CPH2H: https://cph2h.com
- Waifu Focus: https://chromewebstore.google.com/detail/waifu-focus/oilebkjfhbkbmablbmhellicongmgbml
- TreesWantSwag: https://treeswantswag.web.app/
- GitHub: https://github.com/C0derTang
- LinkedIn: https://www.linkedin.com/in/christophertangwastaken/
- Instagram: https://www.instagram.com/ctang.md
- Email: the owner's Stanford address (not written here)

Project slot copy (in the scene, crawlable):

| Slot          | Heading              | Line                                                                                     | Facts                                    | Link             |
| ------------- | -------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------- |
| `cph2h`       | CPH2H                | Head-to-head competitive programming: live 1v1 Codeforces matches, voice and video, Elo. | Built at Rice Residency · Sponsored, FR8 | cph2h.com        |
| `waifu-focus` | Waifu Focus          | A Chrome extension that blocks distracting sites on your schedule, with themes.          | 1,900+ installs · 4.8 / 5                | Chrome Web Store |
| `robotics`    | Bakersfield Robotics | A 501(c)(3) nonprofit I founded to teach free robotics to K–8 students in three schools. | 100+ students · Cal State grant          | none             |

Résumé sheet sections, in order: header (name; Stanford University, intended Mathematics &
Philosophy; email, GitHub, LinkedIn, Instagram), Experience (Paradigm Study, Jaco Oil), Projects
(CPH2H, Waifu Focus, @ctang.md, TreesWantSwag), Leadership & Programs (Bakersfield Robotics, VEX
Team 11475B, Paradigm YC Reject Camp), Distinctions (Stockdale High School valedictorian 1/582,
National Science Bowl top 16, USACO Silver, TEDx speaker), and the skills line. Bullets follow
the résumé wording.

## Design

### 1. Wall scrolls: `src/three/world/scrolls.ts`

A new world part `{ group }` with no `update`.

- Three kakejiku, one per turn hold. The camera stands at (−0.95, 1.45, −3.2) during the turn
  and looks along +x, +z and −x at the holds (`faces` = 1, 2, 3 in `camera.ts`).
  - Kitchen wall (+x): in the gap between the pot rack and the kitchen window, near z −3.3.
  - Front wall (+z): on the inner face beside the doorway, on the side the camera faces.
  - Window wall (−x): replaces the plain scroll built in `interior.ts`, which is removed. The
    position moves if the existing one does not sit in view at the hold.
  - Exact positions and sizes are tuned against real-GPU frames at t .364, .41 and .456. Each
    scroll is larger than the current 0.34 m panel so the name reads at 3–6 m.
- Each scroll: a paper panel, a wood rod at the top and bottom (`mats.make` wood), the project
  name written top to bottom, a small ink motif (crossed strokes for CPH2H, an hourglass for
  Waifu Focus, a gear for Robotics) and a red seal.
- The three faces are painted into one canvas atlas and shown by one lit `MeshStandardMaterial`
  on one merged mesh: one extra draw call for the paper, and the rods merge into an existing
  wood material's batch or one more mesh. Nothing casts a shadow. No new assets.
- The name uses the display font (Shippori Mincho). The atlas is painted once
  `document.fonts.load` resolves and is part of the deferred stage: before it arrives the
  scrolls are plain paper, the curtain never waits for it, and eager starts (`?freeze`, `?t=`,
  `?bench`, a deep link) wait for it so frames stay deterministic.
- Names come from `src/config/projects.ts`: `{ id, name, wall, t }` for the three featured
  projects, where `t` is the middle of the hold. This is the only place the scene learns about
  content.
- Focus: if a wall is outside the depth of field at its hold, keys are added to the focus tracks
  in `state.ts`. Everything stays a pure function of `t`.

### 2. Project slots: `index.html`, `src/config/beats.ts`, `src/styles/overlay.css`

- `SLOTS` gains `cph2h` [.345, .357, .371, .383], `waifu-focus` [.389, .401, .419, .431] and
  `robotics` [.437, .449, .463, .475]: each is fully visible for exactly its hold.
- The `interior` slot ("A moment of shelter") moves earlier, to the end of the enter beat
  (about [.27, .29, .325, .34]), so the house keeps its introduction and never overlaps a
  project.
- Slot markup: eyebrow "Project 01 / 03", `h2` name, one line, a facts line, a link. Slots sit
  on the side of the screen away from the scroll they describe; on portrait phones they sit at
  the bottom.
- The journey bar keeps its four chapters.

### 3. Résumé sheet: `index.html`, `src/ui/resume.ts`, `src/ui/resume-content.ts`, `src/styles/resume.css`

- A "Résumé" link (`href="#resume"`) in the scene header, visible at every `t`.
- `index.html` holds only an empty `<dialog id="resume" data-nosnippet>` with a close button.
- `resume.ts` is imported by `main.ts`, not the scene chunk, so the sheet works before the scene
  loads and when WebGL fails. On the first open it dynamically imports `resume-content.ts`,
  injects the markup and calls `showModal()`.
- While open, Lenis is stopped and the dialog scrolls on its own (`data-lenis-prevent`). The
  module announces open and close with a `resume:toggle` event on `window`; `boot.ts` listens.
  Esc, the close button and a backdrop click close it and restore the URL.
- Look: paper and ink from the existing tokens, the two existing fonts, full screen on phones.
- Print: a print stylesheet hides the scene and prints the open sheet as a clean page; a
  "Print / save as PDF" button calls `window.print()`.
- Each featured project in the sheet has a "See it in the house" link that closes the sheet and
  scrolls to that project's hold.

### Keeping the résumé out of crawlers

- The résumé text is not in the served HTML. It exists only in a separate JavaScript chunk that
  is fetched when a person opens the sheet (or loads `#resume`). Crawlers that render pages do
  not click, and fragments are not sent to servers or treated as separate pages.
- The dialog carries `data-nosnippet`, so if a renderer ever does see the content, it is not
  used in search snippets.
- The email address is assembled at runtime from parts, so it does not appear as a literal in
  the HTML or as a single string in the bundle.
- No JSON-LD and no résumé details in `<meta>`. The meta description stays about the walk.
- Consequences accepted: with JavaScript off there is no résumé (the `<noscript>` note says so),
  and the three project slots stay as static, crawlable copy because they are the page's content.
- Limit: this keeps the résumé out of search indexes, not private. Anyone who opens the sheet can
  read it, and the text is in the public repository and bundle.

### 4. Deep links: `src/boot.ts`

- `#resume` opens the sheet (handled by `resume.ts`).
- `#cph2h`, `#waifu-focus` and `#robotics` start at that project's hold (`t` from
  `config/projects.ts`); the existing beat ids (`#enter`, `#turn`, `#doors`, `#paddy`, `#dive`,
  `#underwater`) start at the beat's first `t`.
- A start from a hash is eager, like `?t=`. `?t=` wins if both are present.
- `hashchange` scrolls to the target with Lenis (immediate under reduced motion).

### 5. Docs

`CLAUDE.md` Layout and Conventions gain the new files, the slot ids and the rule that résumé
content must stay out of `index.html`.

## Testing

- e2e (`e2e/smoke.spec.ts`):
  - each project slot is visible at its hold and hidden outside it;
  - slot headings equal the names in `config/projects.ts`;
  - the served HTML and the DOM before any click contain no résumé text (checked for
    "Paradigm Study" and the email address);
  - the Résumé link opens the dialog with its sections, the page does not scroll while it is
    open, Esc closes it;
  - loading `/#resume` opens the sheet; loading `/#cph2h` gives `state.t` inside the hold;
  - the existing purity and console-error checks still pass.
- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm build`; JS stays under 400 KB gz and
  the résumé is its own chunk.
- Real-GPU frames at every `t` in the `CLAUDE.md` list plus .364 and .456, checked by eye for
  scroll legibility; draw calls and triangles stay under budget.
- Phone: the `low` tier load numbers do not regress (nothing new before the curtain).

## Out of scope

PDF download, the phone number, JSON-LD, new dependencies, new copy for the paddy and underwater
beats, and any change to the camera path or the desktop look outside the three walls.
