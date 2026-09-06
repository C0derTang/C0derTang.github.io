# c0dertang.github.io

Personal site of Christopher Tang: a single scroll-driven scene. A rainy Japanese farmhouse you
walk up to, enter, look around, leave through the back shoji, cross a flooded rice paddy, and
sink under the water to the fish. A [three.js](https://threejs.org/) WebGL scene in vanilla
TypeScript with [Lenis](https://lenis.darkroom.engineering/) driving the camera; CC0 textures
from Poly Haven and ambientCG (see `public/assets/ATTRIBUTION.md`). Desktop first.

Live: https://c0dertang.github.io/

## Develop

```sh
pnpm install
pnpm dev        # http://localhost:5173  (pnpm dev:lan to test on a phone)
pnpm build      # typecheck + production build to dist/
pnpm preview    # serve dist/ on http://localhost:4173
pnpm lint && pnpm typecheck && pnpm format:check
pnpm test:e2e   # Playwright smoke test on headless Chromium (first: pnpm exec playwright install chromium)
pnpm bench      # frame-time sweep in the installed Chrome (real GPU)
```

Dev URL hooks: `?debug` (HUD with camera, beat, draw calls), `?t=0.35` (seek), `&freeze`
(deterministic frame), `?bench=8` (frame-time sweep, report in `window.__bench`),
`?tier=high|low`, `?dpr=<n>`, `?post=off` (no depth of field).

Requires Node >= 22.13 and pnpm 10 (pinned in `package.json`; pnpm switches to it automatically).
Architecture, the scroll-beat model and conventions are in `CLAUDE.md`.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which lints, typechecks, builds the site
and publishes `dist/` to the `gh-pages` branch that GitHub Pages serves at the root.

## History

- `legacy-site` branch: the original portfolio
- tag `v2-graph-final`: the d3 knowledge-graph version
