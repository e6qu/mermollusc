#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";

const reservePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("could not reserve a TCP port")));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error !== undefined) reject(error);
        else resolve(port);
      });
    });
  });

const appPort = await reservePort();
const wsPort = await reservePort();
if (appPort === wsPort) {
  throw new Error(`reserved duplicate Playwright ports: ${appPort}`);
}

const result = spawnSync("pnpm", ["exec", "playwright", "test", ...process.argv.slice(2)], {
  env: {
    ...process.env,
    MERMOLLUSC_PLAYWRIGHT_PORT: String(appPort),
    MERMOLLUSC_PLAYWRIGHT_WS_PORT: String(wsPort),
    MERMOLLUSC_PLAYWRIGHT_WS_URL: `ws://localhost:${wsPort}`,
  },
  stdio: "inherit",
});

if (result.error !== undefined) {
  throw result.error;
}
process.exit(result.status ?? 1);
