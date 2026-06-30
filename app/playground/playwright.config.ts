import { defineConfig } from "@playwright/test";

const PORT = 4173;
// The collab dev relay (a WebSocket server) for the `?collab` two-tab flow. The app defaults its
// relay to the WebSocket dev server on this port, so the spec needs it listening. Playwright waits
// on the TCP port (a WebSocket server doesn't answer HTTP health checks).
const WS_PORT = 1234;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: true,
  // Under full parallelism the workers contend for CPU (each drives a browser + shares the one Vite
  // server), so an ELK layout + render can briefly exceed the 5s `expect.poll` default — which surfaced
  // as an intermittent pre-push failure (the render *does* arrive, just slower under load). Give the
  // web-first assertions real headroom, and allow one retry to absorb a genuinely transient blip without
  // masking a real failure (which fails the retry too).
  expect: { timeout: 15_000 },
  timeout: 45_000,
  retries: 1,
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: [
    {
      command: `pnpm exec vite --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `node ../../modules/collab/server/relay.mjs`,
      port: WS_PORT,
      env: { PORT: String(WS_PORT) },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
