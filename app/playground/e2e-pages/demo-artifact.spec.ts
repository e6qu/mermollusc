import { expect, test, type Page } from "@playwright/test";
import { setSource } from "../e2e/support/source.js";

// The BUILT, based, backend-free playground (`site-dist/demo/`, `VITE_BACKEND_FREE_DEMO=1`), served
// at `/demo/`. These tests guard what only the production build can break — the narrowed CSP, base-path
// asset resolution, self-containedness, the no-network-backend guarantee, and that the minified/chunked
// bundle still boots and runs the core journeys. Editing nuance is covered by the dev-server suite
// (`make test-e2e-ui`); here the subject is the artifact itself.

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

const boot = async (page: Page, query = "") => {
  await page.goto(`./${query}`);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
};

test("boots the sample with no console or page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await boot(page);
  await expect(page.locator("#kind")).toHaveText("flowchart");
  expect(await page.evaluate(() => typeof window.__editor)).toBe("object");
  expect(errors).toEqual([]);
});

test("ships the backend-free CSP: WASM allowed, no relay/https connect targets", async ({ page }) => {
  await page.goto("./");
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).not.toBeNull();
  const policy = csp ?? "";
  // The demo compiles the relay WASM in-process, which needs the (WASM-only) eval allowance…
  expect(policy).toContain("wasm-unsafe-eval");
  // …but it never reaches a network backend, so the broad relay/https connect targets must be absent.
  const connectSrc = /connect-src ([^;]*)/.exec(policy)?.[1] ?? "";
  expect(connectSrc).not.toContain("wss:");
  expect(connectSrc).not.toMatch(/(^|\s)https:(\s|$)/);
  // Baseline hardening the build must never regress.
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("base-uri 'self'");
});

test("is self-contained and base-path-correct — no off-origin requests, no 404s", async ({ page }) => {
  const offOrigin: string[] = [];
  const failed: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.startsWith("http") && !url.includes("localhost") && !url.includes("127.0.0.1")) {
      offOrigin.push(url);
    }
  });
  page.on("response", (res) => {
    // favicon.ico isn't an app asset and its absence isn't a base-path bug — this test guards that
    // the bundle's own `/demo/assets/...` references resolve.
    if (res.status() >= 400 && !res.url().endsWith("/favicon.ico")) {
      failed.push(`${res.status()} ${res.url()}`);
    }
  });
  await boot(page);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  expect(offOrigin).toEqual([]);
  expect(failed).toEqual([]);
});

test("opens no network WebSocket and fetches no relay WASM in plain (non-collab) mode", async ({
  page,
}) => {
  const sockets: string[] = [];
  const wasmFetches: string[] = [];
  page.on("websocket", (s) => sockets.push(s.url()));
  page.on("request", (req) => {
    if (req.url().includes("relay.wasm")) wasmFetches.push(req.url());
  });
  await boot(page);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
  // Plain demo mode has no collaboration at all — the WASM relay is only wired up under `?collab`.
  expect(sockets).toEqual([]);
  expect(wasmFetches).toEqual([]);
});

test("the minified bundle still runs the parse→render loop", async ({ page }) => {
  await boot(page);
  await setSource(page, "sequenceDiagram\n  Alice->>Bob: hi\n  Bob-->>Alice: hey\n");
  await expect(page.locator("#kind")).toHaveText("sequence");
  await expect(page.locator("#status")).toHaveAttribute("data-level", "ok");
  await expect(page.locator("#status")).toContainText("sequence");
});

test("loads every family from the Examples menu without error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await boot(page);
  const select = page.locator("#example");
  const values = await select.locator("option").evaluateAll((opts) =>
    (opts as HTMLOptionElement[]).map((o) => o.value).filter((v) => v.length > 0),
  );
  expect(values.length).toBeGreaterThanOrEqual(15);
  for (const value of values) {
    await select.selectOption(value);
    await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
    await expect(page.locator("#status")).toHaveAttribute("data-level", "ok");
  }
  expect(errors).toEqual([]);
});

test("surfaces a parse error and recovers on the built artifact", async ({ page }) => {
  await boot(page);
  await setSource(page, "flowchart TD\n  A[Start --> broken |\n");
  await expect(page.locator("#status")).toHaveAttribute("data-level", "error");
  await setSource(page, "flowchart TD\n  A[Start] --> B[Done]\n");
  await expect(page.locator("#status")).toHaveAttribute("data-level", "ok");
});

test("SVG export downloads a vector file", async ({ page }) => {
  await boot(page);
  await page.locator("#more-toggle").click();
  const download = page.waitForEvent("download");
  await page.locator("#export-svg").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.svg$/);
});

test("a #src= deep link renders on load (shared-link journey)", async ({ page }) => {
  const src = "flowchart LR\n  X[One] --> Y[Two]\n";
  await page.goto(`./#src=${encodeURIComponent(src)}`);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(page.locator("#kind")).toHaveText("flowchart");
  await expect
    .poll(() => page.evaluate(() => window.__editor?.value() ?? ""))
    .toContain("X[One]");
});

test("a ?example= deep link loads the named starter", async ({ page }) => {
  await page.goto("./?example=state");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(page.locator("#kind")).toHaveText("state");
});

test("the source survives a reload (local persistence)", async ({ page }) => {
  await boot(page);
  await setSource(page, "flowchart TD\n  Persisted[Kept] --> Reloaded[Back]\n");
  await expect(page.locator("#status")).toHaveAttribute("data-level", "ok");
  await page.reload();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => window.__editor?.value() ?? ""))
    .toContain("Persisted[Kept]");
});

test("the theme choice persists across reload", async ({ page }) => {
  await boot(page);
  const initial = await page.locator("html").getAttribute("data-theme");
  await page.locator("#theme").click();
  const toggled = await page.locator("html").getAttribute("data-theme");
  expect(toggled).not.toBe(initial);
  await page.reload();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", toggled ?? "dark");
});

test("the help dialog opens and closes", async ({ page }) => {
  await boot(page);
  await page.locator("#help-toggle").click();
  const help = page.locator("#help-overlay, .help-overlay").first();
  await expect(help).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
});

test("does not scroll sideways at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
