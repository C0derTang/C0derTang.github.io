# c0dertang.github.io

Personal site of Christopher Tang: a single scroll-driven scene. A rainy Japanese farmhouse you
dolly into, leave through the back shoji, cross a rice paddy, and sink under the water to the
fish. Built from CSS-transform + inline-SVG layers and canvas particles in vanilla TypeScript
with [Lenis](https://lenis.darkroom.engineering/) and [anime.js](https://animejs.com/). No framework.

Live: https://c0dertang.github.io/

## Develop

```sh
pnpm install
pnpm dev        # http://localhost:5173  (pnpm dev:lan to test on a phone)
pnpm build      # typecheck + production build to dist/
pnpm preview    # serve dist/ on http://localhost:4173
pnpm lint && pnpm typecheck && pnpm format:check
pnpm test:e2e   # Playwright smoke test (first: pnpm exec playwright install chromium)
```

Dev URL hooks: `?debug` (HUD), `?t=0.35` (seek), `&freeze` (deterministic frame),
`?preview=<layerId>` (one layer with its bleed edge).

Requires Node >= 22.13 and pnpm 10 (pinned in `package.json`; pnpm switches to it automatically).
Architecture, the scroll-beat model and conventions are in `CLAUDE.md`.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which lints, typechecks, builds the site
and publishes `dist/` to the `gh-pages` branch that GitHub Pages serves at the root.

## History

- `legacy-site` branch: the original portfolio
- tag `v2-graph-final`: the d3 knowledge-graph version
