import { expect, test, type Page } from "@playwright/test";
import { expectSourceMatches, expectSourceNotMatches, setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("Connect links two network nodes with an undirected `a -- b`", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page, 'network\n  server a "A"\n  server b "B"\n');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  // Two nodes lay out side by side (a left, b right) on one row — select both, then Connect.
  const cy = box.y + box.height / 2;
  await page.keyboard.down("Shift");
  await page.mouse.click(box.x + 44, cy);
  await page.mouse.click(box.x + box.width - 44, cy);
  await page.keyboard.up("Shift");

  await expect(page.locator("#connect")).toBeEnabled();
  await page.locator("#connect").click();
  await expectSourceMatches(page, /\n {2}a -- b\n/);
});

test("Delete removes a network node and its links from the source", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page, 'network\n  server a "A"\n  server b "B"\n  a -- b\n');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.mouse.click(box.x + 44, box.y + box.height / 2); // select node "a"
  await page.keyboard.press("Delete");

  await expectSourceNotMatches(page, /server a/);
  await expectSourceNotMatches(page, /a -- b/);
  expect(errors).toEqual([]);
});

test("Connect adds a C4 Rel between two elements", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page, 'C4Context\n  Person(a, "A")\n  System(b, "B")\n');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  const cy = box.y + box.height / 2;
  await page.keyboard.down("Shift");
  await page.mouse.click(box.x + 50, cy);
  await page.mouse.click(box.x + box.width - 50, cy);
  await page.keyboard.up("Shift");

  await page.locator("#connect").click();
  await expectSourceMatches(page, /Rel\(a, b, ""\)/);
});

test("Connect adds a sequence message between two actors", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page, "sequenceDiagram\n  A->>B: hi\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  // Actor boxes sit on the top row (a margin inset + half the actor height down).
  await page.keyboard.down("Shift");
  await page.mouse.click(box.x + 40, box.y + 40);
  await page.mouse.click(box.x + box.width - 40, box.y + 40);
  await page.keyboard.up("Shift");

  await page.locator("#connect").click();
  await expectSourceMatches(page, /A->>B: message/);
});

test("Delete removes a C4 boundary block and relations to nested elements", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page,
    'C4Context\n  Person(u, "U")\n  Boundary(bk, "Backend") {\n    Container(api, "API")\n  }\n  Rel(u, api, "x")\n',
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.mouse.click(box.x + box.width - 48, box.y + 34);
  await page.keyboard.press("Delete");

  await expectSourceNotMatches(page, /Boundary\(bk/);
  await expectSourceNotMatches(page, /Container\(api/);
  await expectSourceNotMatches(page, /Rel\(u, api/);
  await expectSourceMatches(page, /Person\(u, "U"\)/);
  expect(errors).toEqual([]);
});

test("Delete removes a sequence actor and messages touching it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page,
    "sequenceDiagram\n  participant A\n  participant B\n  participant C\n  A->>B: hi\n  B->>C: yo\n",
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.mouse.click(box.x + 54, box.y + 42);
  await page.keyboard.press("Delete");

  await expectSourceNotMatches(page, /participant A/);
  await expectSourceNotMatches(page, /A->>B/);
  await expectSourceMatches(page, /B->>C: yo/);
  expect(errors).toEqual([]);
});

test("Delete removes a brace-bodied ER entity — its whole block, not just the id line", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const parseErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && m.text().includes("parse failed")) parseErrors.push(m.text());
  });

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(
    page,
    "erDiagram\n  CUSTOMER {\n    string name PK\n    string email UK\n    int age\n  }\n  ORDER {\n    int id PK\n  }\n  CUSTOMER ||--o{ ORDER : places\n",
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  // CUSTOMER is the tall left-hand box (laid out left-to-right); click well inside it, then Delete.
  await page.mouse.click(box.x + 50, box.y + box.height / 2);
  await page.keyboard.press("Delete");

  // The whole block goes — no orphaned attribute rows, no incident relationship — and ORDER stays.
  await expectSourceNotMatches(page, /CUSTOMER/);
  await expectSourceNotMatches(page, /string name PK/);
  await expectSourceNotMatches(page, /places/);
  await expectSourceMatches(page, /ORDER \{/);
  await expectSourceMatches(page, /int id PK/);
  // Crucially the source still parses (no stray `}`): the diagram re-renders without a parse error.
  expect(parseErrors).toEqual([]);
  expect(errors).toEqual([]);
});
