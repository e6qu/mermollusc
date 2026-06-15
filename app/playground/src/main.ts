import {
  applyOverrides,
  emptySelection,
  hitTest,
  moveNode,
  relabelNode,
  selectOnly,
} from "@m/builder";
import type { Selection } from "@m/builder";
import type { LayoutOverrides, NodeId, Scene, SceneNodeId, SourceMap } from "@m/contracts";
import { layout } from "@m/layout";
import { parseWithSource } from "@m/parser";
import { paint, toDisplayList } from "@m/renderer";
import { brand, isOk, point } from "@m/std";

const SAMPLE = `flowchart TD
  A[Start] --> B{Choice}
  B -->|yes| C(Process)
  B -->|no| D(End)
  C --> D
`;

const MARGIN = 24;

const srcEl = document.querySelector<HTMLTextAreaElement>("#src");
const canvas = document.querySelector<HTMLCanvasElement>("#stage");
if (srcEl === null || canvas === null) throw new Error("playground: missing #src or #stage");
const ctx = canvas.getContext("2d");
if (ctx === null) throw new Error("playground: 2d context unavailable");

let scene: Scene | null = null;
let source: SourceMap | null = null;
let overrides: LayoutOverrides = new Map();
let selection: Selection = emptySelection;
let drag: { readonly id: SceneNodeId; readonly offsetX: number; readonly offsetY: number } | null =
  null;

const paintScene = (): void => {
  if (scene === null) return;
  const shown = applyOverrides(scene, overrides);
  canvas.width = Math.ceil(shown.extent.size.width) + MARGIN * 2;
  canvas.height = Math.ceil(shown.extent.size.height) + MARGIN * 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(MARGIN, MARGIN);
  paint(ctx, toDisplayList(shown));
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 2;
  for (const node of shown.nodes) {
    if (selection.nodes.has(node.id)) {
      const { origin, size } = node.bounds;
      ctx.strokeRect(origin.x - 3, origin.y - 3, size.width + 6, size.height + 6);
    }
  }
  ctx.restore();
};

const renderFromText = async (text: string): Promise<void> => {
  const parsed = parseWithSource(text);
  if (!isOk(parsed)) {
    console.error("parse failed:", parsed.error.errors.join("; "));
    return;
  }
  const laid = await layout(parsed.value.ast);
  if (!isOk(laid)) {
    console.error("layout failed:", laid.error.message);
    return;
  }
  scene = laid.value;
  source = parsed.value.source;
  paintScene();
};

const scenePoint = (ev: MouseEvent) => {
  const r = canvas.getBoundingClientRect();
  return point(ev.clientX - r.left - MARGIN, ev.clientY - r.top - MARGIN);
};

canvas.addEventListener("pointerdown", (ev) => {
  if (scene === null) return;
  const shown = applyOverrides(scene, overrides);
  const at = scenePoint(ev);
  const hit = hitTest(shown, at);
  selection = selectOnly(hit);
  if (hit !== null && hit.kind === "node") {
    const node = shown.nodes.find((n) => n.id === hit.id);
    if (node !== undefined) {
      drag = {
        id: hit.id,
        offsetX: at.x - node.bounds.origin.x,
        offsetY: at.y - node.bounds.origin.y,
      };
      canvas.setPointerCapture(ev.pointerId);
    }
  }
  paintScene();
});

canvas.addEventListener("pointermove", (ev) => {
  if (drag === null) return;
  const at = scenePoint(ev);
  overrides = moveNode(overrides, drag.id, point(at.x - drag.offsetX, at.y - drag.offsetY));
  paintScene();
});

canvas.addEventListener("pointerup", (ev) => {
  if (drag !== null) {
    canvas.releasePointerCapture(ev.pointerId);
    drag = null;
  }
});

// Two-way edit: relabel a node on the canvas, write the patch back into the source text.
canvas.addEventListener("dblclick", (ev) => {
  if (scene === null || source === null) return;
  const shown = applyOverrides(scene, overrides);
  const hit = hitTest(shown, scenePoint(ev));
  if (hit === null || hit.kind !== "node") return;
  const current = shown.nodes.find((n) => n.id === hit.id)?.label ?? "";
  const next = window.prompt("Label:", current);
  if (next === null) return;
  const id: NodeId = brand<string, "NodeId">(hit.id);
  const patched = relabelNode(srcEl.value, source, id, next);
  if (!isOk(patched)) {
    console.error("relabel failed:", patched.error.message);
    return;
  }
  srcEl.value = patched.value;
  void renderFromText(patched.value);
});

srcEl.value = SAMPLE;
srcEl.addEventListener("input", () => {
  overrides = new Map();
  void renderFromText(srcEl.value);
});
void renderFromText(SAMPLE);
