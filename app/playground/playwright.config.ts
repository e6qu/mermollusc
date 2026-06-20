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
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: [
    {
      command: `pnpm exec vite --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: `node ../../modules/collab/dev-server.mjs`,
      port: WS_PORT,
      env: { PORT: String(WS_PORT) },
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
