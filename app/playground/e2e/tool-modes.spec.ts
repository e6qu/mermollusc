import { expect, test, type Page } from "@playwright/test";
import { sourceValue } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const tool = (page: Page) => page.evaluate(() => window.__activeTool?.() ?? "");

const ready = async (page: Page) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
};

test("V/H/C/P arm the matching tool; Escape returns to select", async ({ page }) => {
  await ready(page);
  expect(await tool(page)).toBe("select");
  await page.keyboard.press("h");
  expect(await tool(page)).toBe("hand");
  await page.keyboard.press("c"); // flowchart supports connect
  expect(await tool(page)).toBe("connect");
  await page.keyboard.press("p"); // flowchart supports place
  expect(await tool(page)).toBe("place");
  await page.keyboard.press("Escape");
  expect(await tool(page)).toBe("select");
});

test("the Hand tool pans a drag that starts over a node, without moving the node", async ({
  page,
}) => {
  await ready(page);
  const before = await sourceValue(page);
  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("no canvas box");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press("h");
  await expect.poll(() => page.locator("#stage").evaluate((c) => c.style.cursor)).toBe("grab");

  // Drag starting over the top node — Hand pans (stage scrolls), the node's source is untouched.
  await page.mouse.move(box.x + 80, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 120, { steps: 6 });
  await page.mouse.up();
  expect(await sourceValue(page)).toBe(before);
});

test("the Connect tool draws an edge from a plain drag between two nodes", async ({ page }) => {
  await ready(page);
  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /4 edge/);
  await page.keyboard.press("c");
  expect(await tool(page)).toBe("connect");

  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("no canvas box");
  await page.mouse.move(box.x + 88, box.y + 56); // Start (A)
  await page.mouse.down();
  await page.mouse.move(box.x + 88, box.y + 150, { steps: 6 }); // Choice (B)
  await page.mouse.up();

  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /5 edge/);
  await expect.poll(() => sourceValue(page)).toMatch(/\n\s*A --> B\s*\n/);
});

test("the Place tool drops a flowchart node at the click and returns to select", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await page.keyboard.press("p");
  expect(await tool(page)).toBe("place");

  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("no canvas box");
  await page.mouse.click(box.x + 18, box.y + box.height - 18); // empty in-bounds spot

  await expect.poll(() => sourceValue(page)).toContain("node 1");
  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /5 node/);
  expect(await tool(page)).toBe("select"); // one-shot
  expect(errors).toEqual([]);
});

test("modifier accelerators still work under the Select tool (no regression)", async ({ page }) => {
  await ready(page);
  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("no canvas box");

  // ⌥-drag connect still works without arming the Connect tool.
  await page.keyboard.down("Alt");
  await page.mouse.move(box.x + 88, box.y + 56);
  await page.mouse.down();
  await page.mouse.move(box.x + 88, box.y + 150, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /5 edge/);

  // ⌘-wheel zoom still changes the level off 100%.
  await page.mouse.move(box.x + 80, box.y + 80);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -120);
  await page.keyboard.up("Control");
  await expect(page.locator("#zoom-reset")).not.toHaveText("100%");
});
