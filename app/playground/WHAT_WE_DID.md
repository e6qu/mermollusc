# @m/app (playground) — work log

- Scaffolded the Vite app: index.html, canvas placeholder entry, Makefile with Vite
  build/run/stop overrides, five doc files.
- Added `@m/std`/`@m/parser`/`@m/layout`/`@m/renderer` dependencies.
- Wired `main.ts`: parse → layout → `toDisplayList` → `paint`, canvas sized to the scene extent.
- Added a node e2e test running the full text→pixels pipeline against a recording context.
- Added Playwright (`playwright.config.ts` + `e2e/render.spec.ts`) — one spec per UI flow,
  auto-starting Vite; verified in chromium.
