import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const badge = (page: Page) => page.locator("#dialect-badge");
const kindText = (page: Page) => page.locator("#kind").textContent();

// The UI flags diagrams whose syntax isn't Mermaid: our custom `network`/`cloud` families and a Graphviz
// DOT import. Real Mermaid families show no such flag.
test("non-Mermaid dialects are flagged; Mermaid families are not", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  for (const [src, kind, why] of [
    ['network\n  server web1 "Web"\n  database db1 "DB"\n  web1 -- db1\n', "network", "custom"],
    ['cloud\n  compute web1 "Web"\n  storage s1 "S3"\n  web1 --> s1\n', "cloud", "custom"],
    ["digraph { a -> b }\n", "flowchart", "Graphviz"],
  ] as const) {
    await setSource(page, src);
    await expect.poll(() => kindText(page)).toBe(kind);
    await expect(badge(page)).toBeVisible();
    await expect(badge(page)).toHaveText("non-Mermaid");
    expect(await badge(page).getAttribute("title")).toContain(why);
  }

  for (const [src, kind] of [
    ["flowchart TD\n  A --> B\n", "flowchart"],
    ["stateDiagram-v2\n  [*] --> Idle\n", "state"],
    ["erDiagram\n  A ||--o{ B : has\n", "er"],
    ["classDiagram\n  class Animal\n", "class"],
  ] as const) {
    await setSource(page, src);
    await expect.poll(() => kindText(page)).toBe(kind);
    await expect(badge(page)).toBeHidden();
  }
});
