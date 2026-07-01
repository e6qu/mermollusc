import { defineConfig } from "@playwright/test";

const PORT = 4175;

export default defineConfig({
  testDir: "./e2e-pages",
  fullyParallel: false,
  forbidOnly: true,
  expect: { timeout: 15_000 },
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}/demo/` },
  webServer: {
    command: `node ../../tools/build-pages.mjs && python3 -m http.server ${PORT} --directory ../../site-dist`,
    url: `http://localhost:${PORT}/demo/`,
    env: { PAGES_BASE: "/" },
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
