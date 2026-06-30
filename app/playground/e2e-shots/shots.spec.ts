import { expect, type Page, test } from "@playwright/test";
import { EXAMPLES } from "../src/examples.js";

// A scenario-driven UI instrument: each flow names a sequence of real interactions, drives them
// through the live app, and captures a full-page PNG to `shots/`. This is how we (a) review the
// design without a human in the loop and (b) exercise end-to-end flows beyond what the assertion
// suite covers. To add coverage of a new flow, append a `Flow` — no new harness code.

type Flow = {
  readonly name: string;
  readonly about: string;
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly fullPage?: boolean;
  readonly drive: (page: Page) => Promise<void>;
};

const canvasWidth = (page: Page): Promise<number> =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// Wait until a parse+layout+paint cycle has produced a sized canvas, so the shot is never of a
// half-rendered frame. Callers that expect an *empty* render (parse error) skip this.
const settled = async (page: Page): Promise<void> => {
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
};

// The source editor is CodeMirror, not a <textarea>, so it's driven through the `window.__editor`
// handle `main.ts` exposes (same mechanism as the e2e support helpers), not `.fill()`.
const setSource = async (page: Page, text: string): Promise<void> => {
  await expect.poll(() => page.evaluate(() => window.__editor !== undefined)).toBe(true);
  await page.evaluate((t) => window.__editor?.setValue(t), text);
  await settled(page);
};

const loadExample = async (page: Page, name: string): Promise<void> => {
  if (!EXAMPLES.has(name)) throw new Error(`missing screenshot example: ${name}`);
  await page.locator("#example").selectOption(name);
  await settled(page);
  await page.locator("#zoom-fit").click();
  await settled(page);
};

declare global {
  interface Window {
    __editor?: { value(): string; setValue(text: string): void };
    __nodeRect?: (nodeId: string) => { x: number; y: number; w: number; h: number } | null;
  }
}

const clickNode = async (page: Page, id: string): Promise<void> => {
  const box = await page.evaluate((nodeId) => window.__nodeRect?.(nodeId) ?? null, id);
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
};

const STATE_POLISH_SOURCE =
  "stateDiagram-v2\n  state fork <<fork>>\n  state join <<join>>\n  state choice <<choice>>\n  [*] --> Idle\n  Idle --> choice : submit\n  choice --> fork : accepted\n  choice --> Error : rejected\n  fork --> Cache\n  fork --> Notify\n  Cache --> join\n  Notify --> join\n  join --> Ready\n  Ready --> [*]\n  note right of Error : retry with corrected input\n  note left of Cache : cached locally\n  note over Ready : publish completion\n";

const FLOWS: readonly Flow[] = [
  {
    name: "01-mobile",
    about: "phone-width responsive shell: stacked topbar, editor, stage, and wrapped status",
    viewport: { width: 390, height: 844 },
    drive: async (page) => {
      await settled(page);
    },
  },
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
      await clickNode(page, "A");
    },
  },
  {
    name: "02-edge-selected",
    about: "an edge selected through keyboard navigation → route halo and task guidance",
    drive: async (page) => {
      await settled(page);
      await page.locator("#diagram-nav").focus();
      await page.keyboard.press("End");
      await expect(page.locator("#stage-hud")).toBeVisible();
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
    about: "sequence diagram from the public Examples menu",
    drive: async (page) => {
      await loadExample(page, "sequence");
    },
  },
  {
    name: "06-c4",
    about: "C4 context diagram from the public Examples menu",
    drive: async (page) => {
      await loadExample(page, "c4");
    },
  },
  {
    name: "07-block",
    about: "block diagram from the public Examples menu",
    drive: async (page) => {
      await loadExample(page, "block");
    },
  },
  {
    name: "08-network",
    about: "network diagram from the public Examples menu with vendored glyphs",
    drive: async (page) => {
      await loadExample(page, "network");
    },
  },
  {
    name: "09-cloud",
    about: "cloud diagram from the public Examples menu with vendored brand marks",
    drive: async (page) => {
      await loadExample(page, "cloud");
    },
  },
  {
    name: "10-parse-error",
    about: "invalid source → the error surface (not just a stale canvas)",
    drive: async (page) => {
      await setSource(page, "flowchart TD\n  A[Start --> ??? broken |\n");
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
    fullPage: false,
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
  {
    name: "22-help",
    about: "shortcut help modal for keyboard and mouse workflows",
    drive: async (page) => {
      await settled(page);
      await page.locator("#help-toggle").click();
      await expect(page.locator("#help-panel")).toBeVisible();
    },
  },
  {
    name: "23-connect-network",
    about: "Connect works beyond flowchart — joining two network nodes with an undirected link",
    drive: async (page) => {
      await setSource(page, 'network\n  server a "Web"\n  database b "DB"\n');
      const box = await page.locator("#stage").boundingBox();
      if (box === null) return;
      const cy = box.y + box.height / 2;
      await page.keyboard.down("Shift");
      await page.mouse.click(box.x + 44, cy);
      await page.mouse.click(box.x + box.width - 44, cy);
      await page.keyboard.up("Shift");
      await page.locator("#connect").click();
      await settled(page);
    },
  },
  {
    name: "24-connect-sequence",
    about: "Connect adds a sequence message between two actors",
    drive: async (page) => {
      await setSource(page, "sequenceDiagram\n  A->>B: Hello\n");
      const a = await page.evaluate(() => window.__nodeRect?.("A") ?? null);
      const b = await page.evaluate(() => window.__nodeRect?.("B") ?? null);
      if (a === null || b === null) return;
      await page.keyboard.down("Shift");
      await page.mouse.click(a.x + a.w / 2, a.y + a.h / 2);
      await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
      await page.keyboard.up("Shift");
      await page.locator("#connect").click();
      await settled(page);
    },
  },
  {
    name: "25-er",
    about: "ER diagram from the public Examples menu",
    drive: async (page) => {
      await loadExample(page, "er");
    },
  },
  {
    name: "26-class",
    about: "UML class diagram from the public Examples menu",
    drive: async (page) => {
      await loadExample(page, "class");
    },
  },
  {
    name: "27-class-dark",
    about: "class diagram in dark theme — compartments + UML heads on the dark surface",
    drive: async (page) => {
      await setSource(
        page,
        "classDiagram\n  class Animal {\n    <<abstract>>\n    +String name\n    -int age\n    +isMammal() bool\n  }\n  Animal <|-- Duck\n  Animal *-- Leg\n",
      );
      await page.locator("#theme").click();
      await settled(page);
    },
  },
  {
    name: "28-er-sketch",
    about: "ER diagram in sketch mode — hand-drawn compartments + crow's-foot",
    drive: async (page) => {
      await setSource(
        page,
        "erDiagram\n  CUSTOMER {\n    string name PK\n    string email UK\n  }\n  CUSTOMER ||--o{ ORDER : places\n",
      );
      await page.locator("#sketch").click();
      await settled(page);
      await page.waitForTimeout(250);
    },
  },
  {
    name: "29-state-polish",
    about: "state diagram pseudo-states, direction, fork/join bars, choice diamond, and notes",
    drive: async (page) => {
      await loadExample(page, "state");
    },
  },
  {
    name: "30-sketch-state",
    about: "sketch mode over the polished state sample with filled hand-drawn boxes",
    drive: async (page) => {
      await setSource(page, STATE_POLISH_SOURCE);
      await page.locator("#sketch").click();
      await settled(page);
    },
  },
  {
    name: "31-requirement",
    about: "requirement diagram from the public Examples menu",
    drive: async (page) => {
      await loadExample(page, "requirement");
    },
  },
  {
    name: "32-pie-donut",
    about: "donut pie chart from the public Examples menu",
    drive: async (page) => {
      await loadExample(page, "pie");
    },
  },
  {
    name: "33-bpmn-banking",
    about: "BPMN-style banking workflow from the public Examples menu",
    drive: async (page) => {
      await loadExample(page, "bpmn");
    },
  },
  {
    name: "34-bpmn-insurance",
    about: "BPMN-style insurance adjusting workflow from the public Examples menu",
    drive: async (page) => {
      await loadExample(page, "bpmn-incident");
    },
  },
  {
    name: "35-dot",
    about: "Graphviz DOT import from the public Examples menu",
    drive: async (page) => {
      await loadExample(page, "dot");
    },
  },
  {
    name: "36-timeline",
    about: "timeline diagram from the public Examples menu",
    drive: async (page) => {
      await loadExample(page, "timeline");
    },
  },
  {
    name: "37-gantt",
    about: "gantt diagram from the public Examples menu",
    drive: async (page) => {
      await loadExample(page, "gantt");
    },
  },
  {
    name: "38-mindmap",
    about: "mindmap diagram from the public Examples menu",
    drive: async (page) => {
      await loadExample(page, "mindmap");
    },
  },
  {
    name: "39-gitgraph",
    about: "gitGraph diagram from the public Examples menu",
    drive: async (page) => {
      await loadExample(page, "gitGraph");
    },
  },
];

for (const flow of FLOWS) {
  test(`shot: ${flow.name} — ${flow.about}`, async ({ page }) => {
    if (flow.viewport !== undefined) await page.setViewportSize(flow.viewport);
    await page.goto("/");
    await flow.drive(page);
    await page.screenshot({ path: `shots/${flow.name}.png`, fullPage: flow.fullPage ?? true });
  });
}
