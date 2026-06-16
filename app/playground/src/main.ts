import {
  addNode,
  applyOverrides,
  connect,
  deleteEdge,
  deleteNode,
  emptySelection,
  hitTest,
  moveNode,
  patchSpan,
  relabelNode,
  selectOnly,
  toggle,
} from "@m/builder";
import type { Selection } from "@m/builder";
import type {
  BlockSource,
  C4Source,
  CloudSource,
  DiagramAst,
  LayoutOverrides,
  NetworkSource,
  NodeId,
  Scene,
  SceneNodeId,
  SequenceSource,
  SourceMap,
} from "@m/contracts";
import { decodePack, defaultRegistry, findIcon, registerPack } from "@m/icons";
import { layout, layoutDiagram } from "@m/layout";
import {
  parseBlockWithSource,
  parseC4WithSource,
  parseCloudWithSource,
  parseDiagram,
  parseNetworkWithSource,
  parseSequenceWithSource,
  parseWithSource,
} from "@m/parser";
import { darkTheme, defaultTheme, paint, toDisplayList } from "@m/renderer";
import type { Theme } from "@m/renderer";
import { brand, isOk, point, type Point } from "@m/std";

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
const relaxBtn = document.querySelector<HTMLButtonElement>("#relax");
const regenBtn = document.querySelector<HTMLButtonElement>("#regenerate");
const addBtn = document.querySelector<HTMLButtonElement>("#add-node");
const connectBtn = document.querySelector<HTMLButtonElement>("#connect");
const themeBtn = document.querySelector<HTMLButtonElement>("#theme");
const sketchBtn = document.querySelector<HTMLButtonElement>("#sketch");
const loadPackEl = document.querySelector<HTMLInputElement>("#load-pack");
if (
  relaxBtn === null ||
  regenBtn === null ||
  addBtn === null ||
  connectBtn === null ||
  themeBtn === null ||
  sketchBtn === null ||
  loadPackEl === null
) {
  throw new Error("playground: missing toolbar controls");
}

let ast: DiagramAst | null = null;
let scene: Scene | null = null;
let source: SourceMap | null = null;
let seqSource: SequenceSource | null = null;
let c4Source: C4Source | null = null;
let blockSource: BlockSource | null = null;
let netSource: NetworkSource | null = null;
let cloudSource: CloudSource | null = null;
let overrides: LayoutOverrides = new Map();
let selection: Selection = emptySelection;
// Set membership is unordered, but `connect` needs a direction, so we track click order.
let selectionOrder: SceneNodeId[] = [];
let drag: { readonly id: SceneNodeId; readonly offsetX: number; readonly offsetY: number } | null =
  null;

// Icon glyphs rasterised from SVG once, keyed by `${pack}/${name}`, then drawn each paint.
const iconImages = new Map<string, CanvasImageSource>();
// The active icon registry; "Load icons" merges a user pack into it (overriding same-id packs).
let registry = defaultRegistry;

// Theme: an explicit choice (localStorage) wins; otherwise follow the OS `prefers-color-scheme`.
const THEME_KEY = "mermollusc-theme";
const prefersDark = (): boolean =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
const storedTheme = localStorage.getItem(THEME_KEY);
let theme: Theme =
  storedTheme === "dark" || (storedTheme === null && prefersDark()) ? darkTheme : defaultTheme;
// Sketch mode is orthogonal to light/dark — composed onto the active theme at paint time.
let sketch = false;
const SKETCH_FONT = '15px "Comic Sans MS", "Patrick Hand", cursive';
const activeTheme = (): Theme => (sketch ? { ...theme, sketch: true, font: SKETCH_FONT } : theme);

const rasterizeIcon = async (svg: string): Promise<HTMLImageElement> => {
  // An <img> can only decode an SVG that declares its namespace and an intrinsic size. Inject each
  // only if absent — vendored packs (e.g. simple-icons) already carry xmlns, and a duplicate
  // attribute would make decoding fail.
  let markup = svg;
  if (!markup.includes("xmlns=")) {
    markup = markup.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  }
  if (!/<svg[^>]*\swidth=/.test(markup)) {
    markup = markup.replace("<svg ", '<svg width="24" height="24" ');
  }
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  await img.decode();
  return img;
};

// Resolve every icon referenced by the scene to a drawable image before painting, so the painter
// never has to deal with a half-loaded glyph. A resolve failure is logged loudly, not swallowed.
const ensureIcons = async (s: Scene): Promise<void> => {
  for (const node of s.nodes) {
    if (node.icon === null) continue;
    const key = `${node.icon.pack}/${node.icon.name}`;
    if (iconImages.has(key)) continue;
    const resolved = findIcon(registry, node.icon.pack, node.icon.name);
    if (!isOk(resolved)) {
      console.error("icon resolve failed:", resolved.error.message);
      continue;
    }
    iconImages.set(key, await rasterizeIcon(resolved.value));
  }
};

const paintScene = (): void => {
  if (scene === null) return;
  const shown = applyOverrides(scene, overrides);
  const cssWidth = Math.ceil(shown.extent.size.width) + MARGIN * 2;
  const cssHeight = Math.ceil(shown.extent.size.height) + MARGIN * 2;
  // Back the canvas at device resolution but draw in CSS pixels, so it stays crisp on HiDPI
  // displays. The CSS size pins the on-screen box; the dpr scale fills the larger backing store.
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const active = activeTheme();
  canvas.style.backgroundColor = active.background;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.save();
  ctx.translate(MARGIN, MARGIN);
  paint(ctx, toDisplayList(shown), iconImages, active);
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
  const parsed = parseDiagram(text);
  if (!isOk(parsed)) {
    console.error("parse failed:", parsed.error.errors.join("; "));
    return;
  }
  const diagram = parsed.value;
  const laid = await layoutDiagram(diagram);
  if (!isOk(laid)) {
    console.error("layout failed:", laid.error.message);
    return;
  }
  ast = diagram;
  scene = laid.value;
  // Capture source spans for canvas→text edits — one family is live at a time.
  source = null;
  seqSource = null;
  c4Source = null;
  blockSource = null;
  netSource = null;
  cloudSource = null;
  switch (diagram.kind) {
    case "flowchart": {
      const withSource = parseWithSource(text);
      source = isOk(withSource) ? withSource.value.source : null;
      break;
    }
    case "sequence": {
      const withSource = parseSequenceWithSource(text);
      seqSource = isOk(withSource) ? withSource.value.source : null;
      break;
    }
    case "c4": {
      const withSource = parseC4WithSource(text);
      c4Source = isOk(withSource) ? withSource.value.source : null;
      break;
    }
    case "block": {
      const withSource = parseBlockWithSource(text);
      blockSource = isOk(withSource) ? withSource.value.source : null;
      break;
    }
    case "network": {
      const withSource = parseNetworkWithSource(text);
      netSource = isOk(withSource) ? withSource.value.source : null;
      break;
    }
    case "cloud": {
      const withSource = parseCloudWithSource(text);
      cloudSource = isOk(withSource) ? withSource.value.source : null;
      break;
    }
  }
  await ensureIcons(scene);
  paintScene();
};

// Relax: re-run ELK seeded by the current node positions, cleaning up overlaps/routing.
const relax = async (): Promise<void> => {
  if (ast === null || ast.kind !== "flowchart" || scene === null) return;
  const shown = applyOverrides(scene, overrides);
  const seed = new Map<NodeId, Point>(
    shown.nodes.map((n) => [brand<string, "NodeId">(n.id), n.bounds.origin]),
  );
  const laid = await layout(ast, seed);
  if (!isOk(laid)) {
    console.error("relax failed:", laid.error.message);
    return;
  }
  scene = laid.value;
  overrides = new Map();
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
  const additive = ev.shiftKey || ev.metaKey;

  if (additive && hit !== null) {
    selection = toggle(selection, hit);
    if (hit.kind === "node") {
      selectionOrder = selection.nodes.has(hit.id)
        ? [...selectionOrder.filter((id) => id !== hit.id), hit.id]
        : selectionOrder.filter((id) => id !== hit.id);
    }
  } else {
    selection = selectOnly(hit);
    selectionOrder = hit !== null && hit.kind === "node" ? [hit.id] : [];
  }

  // A plain click on a node starts a drag; an additive click only edits the selection.
  if (!additive && hit !== null && hit.kind === "node") {
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

// Two-way edit: rename what was double-clicked and write the patch back into the source text.
canvas.addEventListener("dblclick", (ev) => {
  if (scene === null || ast === null) return;
  const shown = applyOverrides(scene, overrides);
  const hit = hitTest(shown, scenePoint(ev));
  if (hit === null) return;

  if (ast.kind === "flowchart") {
    if (source === null) return;
    // An edge with a `|label|` patches that span directly; a node relabels via the source map.
    if (hit.kind === "edge") {
      const span = source.edges.get(brand<string, "EdgeId">(hit.id));
      if (span === undefined) return;
      const next = window.prompt("Edge label:", srcEl.value.slice(span.start, span.end));
      if (next === null) return;
      srcEl.value = patchSpan(srcEl.value, span, next);
      void renderFromText(srcEl.value);
      return;
    }
    const current = shown.nodes.find((n) => n.id === hit.id)?.label ?? "";
    const next = window.prompt("Label:", current);
    if (next === null) return;
    const patched = relabelNode(srcEl.value, source, brand<string, "NodeId">(hit.id), next);
    if (!isOk(patched)) {
      console.error("relabel failed:", patched.error.message);
      return;
    }
    srcEl.value = patched.value;
    void renderFromText(patched.value);
    return;
  }

  if (ast.kind === "c4") {
    if (c4Source === null) return;
    const span =
      hit.kind === "node"
        ? c4Source.elements.get(brand<string, "C4ElementId">(hit.id))
        : c4Source.rels.get(brand<string, "C4RelId">(hit.id));
    if (span === undefined) return;
    const next = window.prompt("Label:", srcEl.value.slice(span.start, span.end));
    if (next === null) return;
    srcEl.value = patchSpan(srcEl.value, span, next);
    void renderFromText(srcEl.value);
    return;
  }

  if (ast.kind === "block") {
    if (blockSource === null) return;
    const span =
      hit.kind === "node"
        ? blockSource.blocks.get(brand<string, "NodeId">(hit.id))
        : blockSource.edges.get(brand<string, "EdgeId">(hit.id));
    if (span === undefined) return;
    const next = window.prompt("Label:", srcEl.value.slice(span.start, span.end));
    if (next === null) return;
    srcEl.value = patchSpan(srcEl.value, span, next);
    void renderFromText(srcEl.value);
    return;
  }

  if (ast.kind === "network") {
    if (netSource === null) return;
    const span =
      hit.kind === "node"
        ? netSource.nodes.get(brand<string, "NodeId">(hit.id))
        : netSource.links.get(brand<string, "EdgeId">(hit.id));
    if (span === undefined) return;
    const next = window.prompt("Label:", srcEl.value.slice(span.start, span.end));
    if (next === null) return;
    srcEl.value = patchSpan(srcEl.value, span, next);
    void renderFromText(srcEl.value);
    return;
  }

  if (ast.kind === "cloud") {
    if (cloudSource === null) return;
    const id = brand<string, "NodeId">(hit.id);
    const span =
      hit.kind === "node"
        ? (cloudSource.nodes.get(id) ?? cloudSource.groups.get(id))
        : cloudSource.links.get(brand<string, "EdgeId">(hit.id));
    if (span === undefined) return;
    const next = window.prompt("Label:", srcEl.value.slice(span.start, span.end));
    if (next === null) return;
    srcEl.value = patchSpan(srcEl.value, span, next);
    void renderFromText(srcEl.value);
    return;
  }

  // sequence: rename an actor (its label span) or a message (its text span).
  if (ast.kind !== "sequence" || seqSource === null) return;
  const span =
    hit.kind === "node"
      ? seqSource.actors.get(brand<string, "ActorId">(hit.id))
      : seqSource.messages.get(brand<string, "MessageId">(hit.id));
  if (span === undefined) return;
  const next = window.prompt("Text:", srcEl.value.slice(span.start, span.end));
  if (next === null) return;
  srcEl.value = patchSpan(srcEl.value, span, next);
  void renderFromText(srcEl.value);
});

// Add node: append a fresh rect node to the flowchart text (flowchart only for now).
addBtn.addEventListener("click", () => {
  if (ast === null || ast.kind !== "flowchart") return;
  const used = new Set<string>(ast.nodes.map((n) => n.id));
  let n = 1;
  while (used.has(`n${n}`)) n++;
  srcEl.value = addNode(srcEl.value, brand<string, "NodeId">(`n${n}`), `node ${n}`, "rect");
  void renderFromText(srcEl.value);
});

// Connect: draw an edge between the first two shift-selected nodes (in click order).
connectBtn.addEventListener("click", () => {
  if (ast === null || ast.kind !== "flowchart" || selectionOrder.length < 2) return;
  const [from, to] = selectionOrder;
  if (from === undefined || to === undefined) return;
  srcEl.value = connect(
    srcEl.value,
    brand<string, "NodeId">(from),
    brand<string, "NodeId">(to),
    "arrow",
  );
  void renderFromText(srcEl.value);
});

// Delete key removes the selected nodes (and their edges) from the flowchart text. Guarded on the
// textarea not being focused so it never hijacks a Backspace while editing the source.
window.addEventListener("keydown", (ev) => {
  if (ev.key !== "Delete" && ev.key !== "Backspace") return;
  if (document.activeElement === srcEl) return;
  if (ast === null || ast.kind !== "flowchart") return;
  if (selectionOrder.length === 0 && selection.edges.size === 0) return;
  ev.preventDefault();
  let text = srcEl.value;
  for (const id of selectionOrder) text = deleteNode(text, brand<string, "NodeId">(id));
  if (scene !== null) {
    for (const edgeId of selection.edges) {
      const edge = scene.edges.find((e) => e.id === edgeId);
      if (edge !== undefined) {
        text = deleteEdge(
          text,
          brand<string, "NodeId">(edge.from),
          brand<string, "NodeId">(edge.to),
        );
      }
    }
  }
  selection = emptySelection;
  selectionOrder = [];
  srcEl.value = text;
  void renderFromText(text);
});

relaxBtn.addEventListener("click", () => {
  void relax();
});
// Regenerate: drop manual positions and lay out cleanly from the text.
regenBtn.addEventListener("click", () => {
  overrides = new Map();
  void renderFromText(srcEl.value);
});

// Theme toggle: switch the palette, persist the explicit choice, and repaint (colours only).
const syncThemeLabel = (): void => {
  themeBtn.textContent = theme === defaultTheme ? "Dark" : "Light";
};
themeBtn.addEventListener("click", () => {
  theme = theme === defaultTheme ? darkTheme : defaultTheme;
  localStorage.setItem(THEME_KEY, theme === darkTheme ? "dark" : "light");
  syncThemeLabel();
  paintScene();
});
syncThemeLabel();

// Sketch toggle: hand-drawn (wobbly outlines + handwriting font) vs. crisp. Repaints, no re-layout.
sketchBtn.addEventListener("click", () => {
  sketch = !sketch;
  sketchBtn.textContent = sketch ? "Crisp" : "Sketch";
  paintScene();
});

// Load icons: read a user-supplied icon-pack JSON, decode it at the boundary, and merge it into the
// active registry (a pack with id "arch" overrides the built-in glyphs). This is how vendor cloud
// packs (AWS/Azure/GCP) are used without bundling them. Failures are logged loudly, not swallowed.
const loadPack = async (file: File): Promise<void> => {
  const text = await file.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    console.error("pack parse failed:", e instanceof Error ? e.message : String(e));
    return;
  }
  const decoded = decodePack(json);
  if (!isOk(decoded)) {
    console.error("pack decode failed:", decoded.error.issues.join("; "));
    return;
  }
  registry = registerPack(registry, decoded.value);
  iconImages.clear(); // drop stale glyphs so overridden packs re-rasterise
  void renderFromText(srcEl.value);
};

loadPackEl.addEventListener("change", () => {
  const file = loadPackEl.files?.[0];
  if (file === undefined || file === null) return;
  void loadPack(file);
});

srcEl.value = SAMPLE;
srcEl.addEventListener("input", () => {
  overrides = new Map();
  void renderFromText(srcEl.value);
});
void renderFromText(SAMPLE);
