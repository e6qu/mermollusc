import { expect, test, type Page } from "@playwright/test";

// Pasting arbitrary Mermaid must "just work" everywhere: the diagram type is autodetected, the render
// switches, and every UI control re-syncs — plus a fenced ```mermaid block (the common copy shape from
// Markdown/GitHub/chat) unwraps on paste.

const kind = async (page: Page) => (await page.locator("#kind").textContent())?.trim() ?? null;
// Poll the kind badge rather than sleeping a fixed time after an edit: the re-render is async (a
// parse→layout→paint that runs slower under CI load), so a fixed wait races it.
const expectKind = (page: Page, want: string) => expect.poll(() => kind(page)).toBe(want);
const overrideCount = (page: Page) => page.evaluate(() => window.__overrideCount?.() ?? -1);
const geometryNodeIds = (page: Page) =>
  page.evaluate(() => (window.__shownGeometry?.()?.nodes ?? []).map((n) => n.id).sort());
const canvasReady = (page: Page) =>
  expect
    .poll(() => page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width))
    .toBeGreaterThan(0);

const CHARTS: [string, string][] = [
  ["sequenceDiagram\n  Alice->>Bob: Hi\n  Bob-->>Alice: Yo\n", "sequence"],
  ["stateDiagram-v2\n  [*] --> Idle\n  Idle --> Run\n", "state"],
  ["classDiagram\n  Animal <|-- Dog\n", "class"],
  ["erDiagram\n  CUSTOMER ||--o{ ORDER : places\n", "er"],
  ['pie title Pets\n  "Dogs": 3\n  "Cats": 2\n', "pie"],
  ["gantt\n  title T\n  section S\n  A task :a1, 2024-01-01, 3d\n", "gantt"],
  ["mindmap\n  root\n    a\n    b\n", "mindmap"],
  ["gitGraph\n  commit\n  branch dev\n  commit\n", "gitGraph"],
];

test("autodetects every family and drops the example select to placeholder", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("/");
  await canvasReady(page);
  for (const [src, want] of CHARTS) {
    await page.evaluate((s) => window.__editor?.setValue(s), src);
    await expectKind(page, want);
    expect(await page.locator("#example").inputValue().catch(() => "")).toBe("");
  }
  expect(errs).toEqual([]);
});

test("switching diagrams re-syncs UI and drops the previous overlay", async ({ page }) => {
  await page.goto("/");
  await canvasReady(page);
  // a flowchart node move creates an overlay override
  const r = await page.evaluate(() => window.__nodeRect?.("A") ?? null);
  if (r !== null) {
    await page.mouse.move(r.x + r.w / 2, r.y + r.h / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.w / 2 + 40, r.y + r.h / 2 + 40, { steps: 6 });
    await page.mouse.up();
  }
  await expect.poll(() => overrideCount(page)).toBe(1);
  const styleBefore = await page.locator("#layout-style").evaluate((s) => (s as HTMLSelectElement).options.length);

  await page.evaluate(() => window.__editor?.setValue("sequenceDiagram\n  Alice->>Bob: Hi\n"));
  await expectKind(page, "sequence");
  // the flowchart's override must not linger on the sequence diagram
  await expect.poll(() => overrideCount(page)).toBe(0);
  // the style select repopulated for the new family
  const styleAfter = await page.locator("#layout-style").evaluate((s) => (s as HTMLSelectElement).options.length);
  expect(styleAfter).not.toBe(styleBefore);
});

test("pasting a fenced ```mermaid block unwraps it and autodetects", async ({ page }) => {
  await page.goto("/");
  await canvasReady(page);
  await page.locator(".cm-content").first().click();
  await page.keyboard.press("Meta+A");
  await page.evaluate(() => {
    const el = document.querySelector(".cm-content");
    if (el === null) return;
    const dt = new DataTransfer();
    dt.setData("text/plain", "```mermaid\nclassDiagram\n  A <|-- B\n```");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expectKind(page, "class");
  expect((await page.evaluate(() => window.__editor?.value() ?? "")).includes("```")).toBe(false);
});

test("pasting Mermaid with style/classDef/linkStyle directives parses (compliance)", async ({ page }) => {
  await page.goto("/");
  await canvasReady(page);
  // land on a distinct graph first, so a failure to parse the styled source would be visible as staleness
  await page.evaluate(() => window.__editor?.setValue("flowchart TD\n  Z --> W\n"));
  await expect.poll(() => geometryNodeIds(page)).toEqual(["W", "Z"]);
  await page.evaluate(() =>
    window.__editor?.setValue(
      "flowchart TD\n  A[Start] --> B{Choice}\n  B --> C[Done]\n  style A fill:#f9f,stroke:#333\n  classDef hot fill:#f96\n  class C hot\n  linkStyle 0 stroke:#f00\n",
    ),
  );
  await expect.poll(() => geometryNodeIds(page)).toEqual(["A", "B", "C"]);
});

test("pasting a WHOLE diagram replaces the current one + switches the renderer type", async ({ page }) => {
  const pasteInto = async (text: string, expectKindValue: string) => {
    await page.locator(".cm-content").click();
    await page.evaluate((t) => {
      const el = document.querySelector(".cm-content");
      if (el === null) return;
      const dt = new DataTransfer();
      dt.setData("text/plain", t);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, text);
    await expectKind(page, expectKindValue);
  };

  await page.goto("/");
  await canvasReady(page);
  await page.evaluate(() => window.__editor?.setValue("flowchart TD\n  A --> B\n"));
  await expectKind(page, "flowchart");

  // a full diagram paste (no select-all) replaces the whole document and re-detects the type
  await pasteInto("sequenceDiagram\n  Alice->>Bob: Hi\n", "sequence");
  expect(await page.evaluate(() => window.__editor?.value() ?? "")).not.toContain("flowchart");
  await pasteInto("stateDiagram-v2\n  [*] --> Idle\n", "state");

  // a partial snippet (no diagram header) still inserts, not replaces
  await page.evaluate(() => window.__editor?.setValue("flowchart TD\n  A --> B\n"));
  await expectKind(page, "flowchart");
  await pasteInto("  C --> D\n", "flowchart");
  expect(await page.evaluate(() => window.__editor?.value() ?? "")).toContain("C --> D");
});
