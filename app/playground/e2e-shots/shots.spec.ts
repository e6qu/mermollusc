import { expect, type Page, test } from "@playwright/test";

// A scenario-driven UI instrument: each flow names a sequence of real interactions, drives them
// through the live app, and captures a full-page PNG to `shots/`. This is how we (a) review the
// design without a human in the loop and (b) exercise end-to-end flows beyond what the assertion
// suite covers. To add coverage of a new flow, append a `Flow` — no new harness code.

type Flow = {
  readonly name: string;
  readonly about: string;
  readonly drive: (page: Page) => Promise<void>;
};

const canvasWidth = (page: Page): Promise<number> =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// Wait until a parse+layout+paint cycle has produced a sized canvas, so the shot is never of a
// half-rendered frame. Callers that expect an *empty* render (parse error) skip this.
const settled = async (page: Page): Promise<void> => {
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
};

const setSource = async (page: Page, text: string): Promise<void> => {
  await page.locator("#src").fill(text);
  await settled(page);
};

// Click the canvas at a point relative to its top-left, in CSS pixels — the instrument's primitive
// for "interact with a node/edge" without reaching into scene internals.
const clickCanvas = async (page: Page, dx: number, dy: number): Promise<void> => {
  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.mouse.click(box.x + dx, box.y + dy);
};

const FLOWS: readonly Flow[] = [
  {
    name: "01-launch",
    about: "default flowchart on first load (light theme)",
    drive: async (page) => {
      await settled(page);
    },
  },
  {
    name: "02-node-selected",
    about: "a node clicked → selection ring",
    drive: async (page) => {
      await settled(page);
      await clickCanvas(page, 70, 60);
    },
  },
  {
    name: "03-dark",
    about: "dark theme via the toggle",
    drive: async (page) => {
      await settled(page);
      await page.locator("#theme").click();
    },
  },
  {
    name: "04-sketch",
    about: "hand-drawn sketch mode",
    drive: async (page) => {
      await settled(page);
      await page.locator("#sketch").click();
      await settled(page);
    },
  },
  {
    name: "05-sequence",
    about: "sequence diagram",
    drive: async (page) => {
      await setSource(page, "sequenceDiagram\n  A->>B: Hello\n  B-->>A: Hi there\n");
    },
  },
  {
    name: "06-c4",
    about: "C4 context diagram",
    drive: async (page) => {
      await setSource(
        page,
        'C4Context\n  Person(alice, "Alice")\n  Boundary(b, "Backend") {\n    Container(api, "API")\n    Container(db, "Database")\n  }\n  Rel(alice, api, "uses")\n',
      );
    },
  },
  {
    name: "07-block",
    about: "block diagram",
    drive: async (page) => {
      await setSource(page, 'block-beta\n  columns 2\n  a["Web"]\n  b["API"]\n  c["DB"]\n  a --> b\n  b --> c\n');
    },
  },
  {
    name: "08-network",
    about: "network diagram with built-in glyphs",
    drive: async (page) => {
      await setSource(
        page,
        'network\n  cloud net "Internet"\n  router r1 "Edge"\n  server web "Web"\n  net -- r1\n  r1 -- web : "eth0"\n',
      );
    },
  },
  {
    name: "09-cloud",
    about: "cloud diagram with vendored brand marks",
    drive: async (page) => {
      await setSource(
        page,
        'cloud\n  group "AWS" {\n    compute web "Web"\n    storage assets "Assets"\n    database db "Orders"\n    queue jobs "Jobs"\n    cdn edge "Edge"\n  }\n  web -- db\n',
      );
      await page.waitForTimeout(200);
    },
  },
  {
    name: "10-parse-error",
    about: "invalid source → the error surface (not just a stale canvas)",
    drive: async (page) => {
      await settled(page);
      await page.locator("#src").fill("flowchart TD\n  A[Start --> ??? broken |\n");
      await page.waitForTimeout(150);
    },
  },
  {
    name: "11-inline-edit",
    about: "the inline label editor open over a double-clicked node",
    drive: async (page) => {
      await settled(page);
      const box = await page.locator("#stage").boundingBox();
      expect(box).not.toBeNull();
      if (box === null) return;
      // The default flowchart's "Start" node sits at the top; double-click it to open the editor.
      await page.mouse.dblclick(box.x + 88, box.y + 56);
      await expect(page.locator("#inline-edit")).toBeVisible();
    },
  },
  {
    name: "12-icon-picker",
    about: "the icon picker drawer browsing the registry",
    drive: async (page) => {
      await settled(page);
      await page.locator("#icons-toggle").click();
      await expect(page.locator("#icon-picker")).toBeVisible();
      await expect(page.locator("#icon-grid .picker-icon").first()).toBeVisible();
    },
  },
  {
    name: "13-subgraph",
    about: "a flowchart subgraph laid out as a nested container",
    drive: async (page) => {
      await setSource(
        page,
        "flowchart TD\n  subgraph Backend\n    api[API] --> db[DB]\n  end\n  user[User] --> api\n",
      );
    },
  },
  {
    name: "14-zoom-fit",
    about: "Fit scales a tall diagram down so all of it is visible at once",
    drive: async (page) => {
      await setSource(
        page,
        "flowchart TD\n  A-->B-->C-->D-->E-->F-->G-->H-->I-->J-->K-->L-->M-->N\n",
      );
      await page.locator("#zoom-fit").click();
      await expect(page.locator("#zoom-reset")).not.toHaveText("100%");
    },
  },
  {
    name: "15-zoom-in",
    about: "Zoom in enlarges the sheet (crisp re-render, not a bitmap scale)",
    drive: async (page) => {
      await setSource(page, "flowchart TD\n  A[Start]-->B{Choice}\n  B-->C(End)\n");
      await page.locator("#zoom-in").click();
      await page.locator("#zoom-in").click();
      await expect(page.locator("#zoom-reset")).toHaveText("156%");
    },
  },
  {
    name: "16-minimap",
    about: "overview minimap: simplified node blocks + a bright 'you are here' viewport over a dimmed rest",
    drive: async (page) => {
      await setSource(
        page,
        "flowchart TD\n  A-->B\n  A-->C\n  B-->D\n  C-->D\n  D-->E\n  D-->F\n  E-->G\n  F-->G\n  G-->H\n  G-->I\n",
      );
      // Zoom in so the (2-D) sheet overflows the stage and the minimap's viewport rect covers part of it.
      for (let i = 0; i < 4; i++) await page.locator("#zoom-in").click();
      await expect(page.locator("#minimap")).toBeVisible();
    },
  },
  {
    name: "17-minimap-dark",
    about: "minimap in dark theme",
    drive: async (page) => {
      await setSource(
        page,
        "flowchart TD\n  A-->B\n  A-->C\n  B-->D\n  C-->D\n  D-->E\n  D-->F\n  E-->G\n  F-->G\n  G-->H\n  G-->I\n",
      );
      await page.locator("#theme").click();
      for (let i = 0; i < 4; i++) await page.locator("#zoom-in").click();
      await expect(page.locator("#minimap")).toBeVisible();
    },
  },
  {
    name: "18-drag-reanchor",
    about: "a dragged node stays where dropped and its connector re-anchors to the new position",
    drive: async (page) => {
      await setSource(page, "flowchart TD\n  A[Start]-->B{Choice}\n  B-->C(Done)\n");
      const box = await page.locator("#stage").boundingBox();
      if (box === null) return;
      // Drag the top "Start" node to the right; it stays there and the edge follows (no re-layout).
      await page.mouse.move(box.x + 88, box.y + 56);
      await page.mouse.down();
      await page.mouse.move(box.x + 260, box.y + 90, { steps: 8 });
      await page.mouse.up();
    },
  },
  {
    name: "19-multidrag",
    about: "two shift-selected nodes drag together as one; their connectors re-anchor",
    drive: async (page) => {
      await setSource(page, "flowchart TD\n  A[Start]-->B{Choice}\n  B-->C(Done)\n");
      const box = await page.locator("#stage").boundingBox();
      if (box === null) return;
      // Select Start, shift-add Choice, then drag the pair down-right — both move as one.
      await page.mouse.click(box.x + 88, box.y + 56);
      await page.keyboard.down("Shift");
      await page.mouse.click(box.x + 88, box.y + 150);
      await page.keyboard.up("Shift");
      await page.mouse.move(box.x + 88, box.y + 56);
      await page.mouse.down();
      await page.mouse.move(box.x + 240, box.y + 140, { steps: 8 });
      await page.mouse.up();
    },
  },
  {
    name: "20-group",
    about: "two nodes bundled into a group — a dashed outline around their bounding box",
    drive: async (page) => {
      await setSource(page, "flowchart TD\n  A[Start]-->B{Choice}\n  B-->C(Done)\n");
      const box = await page.locator("#stage").boundingBox();
      if (box === null) return;
      await page.mouse.click(box.x + 88, box.y + 56);
      await page.keyboard.down("Shift");
      await page.mouse.click(box.x + 88, box.y + 150);
      await page.keyboard.up("Shift");
      await page.locator("#group").click();
    },
  },
  {
    name: "21-group-locked",
    about: "a locked group — solid accent outline with a padlock",
    drive: async (page) => {
      await setSource(page, "flowchart TD\n  A[Start]-->B{Choice}\n  B-->C(Done)\n");
      const box = await page.locator("#stage").boundingBox();
      if (box === null) return;
      await page.mouse.click(box.x + 88, box.y + 56);
      await page.keyboard.down("Shift");
      await page.mouse.click(box.x + 88, box.y + 150);
      await page.keyboard.up("Shift");
      await page.locator("#group").click();
      await page.locator("#lock").click();
    },
  },
];

for (const flow of FLOWS) {
  test(`shot: ${flow.name} — ${flow.about}`, async ({ page }) => {
    await page.goto("/");
    await flow.drive(page);
    await page.screenshot({ path: `shots/${flow.name}.png`, fullPage: true });
  });
}
