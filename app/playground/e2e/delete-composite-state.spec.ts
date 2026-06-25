import { expect, test, type Page } from "@playwright/test";
import { watchPipelineErrors } from "./support/render.js";
import { expectSourceNotMatches, sourceValue, setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// Deleting a composite `state X { … }` must remove its whole brace block (not just the `state X {`
// line) plus the transitions into/out of it — otherwise the body rows + closing `}` are orphaned and
// the source no longer parses. The app routes the `state` family to the body-aware delete.
test("Delete on a composite state removes its whole block, leaving valid source", async ({
  page,
}) => {
  const errors = watchPipelineErrors(page);

  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(
    page,
    "stateDiagram-v2\n  [*] --> Active\n  state Active {\n    [*] --> Idle\n    Idle --> Running : go\n  }\n  Active --> Done : leave\n  Done --> [*]\n",
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  // Deleting a container cascades to its nested children, so the app asks for confirmation — accept it.
  page.on("dialog", (d) => void d.accept());

  // Click the composite container's title strip (above its inner children) to select the whole
  // composite, then Delete.
  await page.mouse.click(box.x + 85, box.y + 130);
  await page.keyboard.press("Delete");

  // the brace block and its body are gone — not orphaned
  await expectSourceNotMatches(page, /state Active/);
  await expectSourceNotMatches(page, /Running/);
  await expectSourceNotMatches(page, /Active --> Done/);
  // a sibling state and its own transition survive
  expect(await sourceValue(page)).toContain("Done --> [*]");
  // and the result still parses cleanly (no dangling `}` / orphaned rows)
  expect(errors).toEqual([]);
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(0);
});

test("dismissing the container-delete confirmation keeps the whole composite intact", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(
    page,
    "stateDiagram-v2\n  [*] --> Active\n  state Active {\n    [*] --> Idle\n    Idle --> Running : go\n  }\n  Active --> Done : leave\n  Done --> [*]\n",
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  page.on("dialog", (d) => void d.dismiss()); // cancel the confirmation

  const box = await canvas.boundingBox();
  if (box === null) return;
  await page.mouse.click(box.x + 85, box.y + 130);
  await page.keyboard.press("Delete");

  // Nothing was removed — the composite and its body survive.
  expect(await sourceValue(page)).toContain("state Active");
  expect(await sourceValue(page)).toContain("Running");
});
