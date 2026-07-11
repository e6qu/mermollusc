import { expect, test, type Page } from "@playwright/test";

// The GitHub Pages presentation site (`site/index.html`, served at the Pages root). These tests run
// against the BUILT artifact in `site-dist/`, so they guard the deployed landing page — not the dev
// server. The playground itself is covered by `demo-artifact.spec.ts`; here the subject is the static
// marketing page that links into it.
//
// baseURL is the demo (`/demo/`), so the landing page is reached with an absolute-path goto ("/"),
// which resolves against the origin.

const LANDING = "/";

// Requests to anything other than the local Pages origin. The repo's pinned-asset rule (AGENTS §0.3,
// §0.5) means the site must be fully self-contained: no CDN fonts, scripts, images, or telemetry.
const offOriginRequests = (page: Page): string[] => {
  const out: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (!url.startsWith("http")) return; // data:, blob: are inline, allowed
    if (url.includes("localhost") || url.includes("127.0.0.1")) return;
    out.push(url);
  });
  return out;
};

test("loads with correct metadata and no errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto(LANDING);
  await expect(page).toHaveTitle(/mermollusc/i);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /diagram/i,
  );
  await expect(page.locator("h1")).toHaveText("mermollusc");
  expect(errors).toEqual([]);
});

test("is fully self-contained — no off-origin (CDN/font/telemetry) requests", async ({ page }) => {
  const offOrigin = offOriginRequests(page);
  await page.goto(LANDING, { waitUntil: "networkidle" });
  expect(offOrigin).toEqual([]);
});

test("the hero and nav both link into a working demo", async ({ page }) => {
  await page.goto(LANDING);

  const openDemo = page.getByRole("link", { name: "Open demo" });
  const navDemo = page.getByRole("link", { name: "Demo", exact: true });
  // Relative hrefs, so they resolve under whatever Pages base the site is deployed at.
  await expect(openDemo).toHaveAttribute("href", "demo/");
  await expect(navDemo).toHaveAttribute("href", "demo/");

  // Following the primary CTA must actually land on a booting demo (canvas renders), not a 404.
  await openDemo.click();
  await expect(page).toHaveURL(/\/demo\/$/);
  await expect
    .poll(() => page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width))
    .toBeGreaterThan(0);
});

test("the GitHub link points at the repository", async ({ page }) => {
  await page.goto(LANDING);
  const gh = page.getByRole("link", { name: "GitHub" });
  await expect(gh).toHaveAttribute("href", "https://github.com/e6qu/mermollusc");
});

test("Docs and Storybook are shown as not-yet-available, not dead links", async ({ page }) => {
  await page.goto(LANDING);
  // They are spans (nothing to click), explicitly marked unavailable — not <a> that 404.
  for (const name of ["Docs", "Storybook"]) {
    const item = page.locator("nav span", { hasText: name });
    await expect(item).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator(`nav a`, { hasText: name })).toHaveCount(0);
  }
});

test("the preview mock shows every node its own source snippet declares", async ({ page }) => {
  await page.goto(LANDING);
  // The mock's source `pre` lists four nodes; the diagram graphic must show all four (regression guard:
  // it previously drew only three, silently dropping `Edit`).
  const source = page.locator("pre.source");
  await expect(source).toContainText("A[Start]");
  await expect(source).toContainText("D[Edit]");
  for (const label of ["Start", "Choice", "Export", "Edit"]) {
    await expect(page.locator(".diagram .node", { hasText: label })).toHaveCount(1);
  }
});

test("has a single top-level heading and every link is named", async ({ page }) => {
  await page.goto(LANDING);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("nav")).toHaveAttribute("aria-label", /site/i);
  const links = await page.getByRole("link").all();
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    const name = (await link.textContent())?.trim() ?? "";
    expect(name.length).toBeGreaterThan(0);
  }
});

test("does not scroll sideways at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(LANDING);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  // A 1px rounding slack; anything more is a real horizontal-overflow bug.
  expect(overflow).toBeLessThanOrEqual(1);
});
