import { defineConfig } from "@playwright/test";

// A separate Playwright project from the gating e2e suite (`playwright.config.ts`): it drives the
// real UI through named flows and writes PNGs to `shots/`, for visual review and design iteration.
// Kept out of `make e2e-ui` so the gate never depends on image artifacts; run via `make shots`.
const PORT = 4173;

export default defineConfig({
  testDir: "./e2e-shots",
  fullyParallel: false,
  forbidOnly: true,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 880 },
    deviceScaleFactor: 2,
  },
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
