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
  TextSpan,
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
const exampleEl = document.querySelector<HTMLSelectElement>("#example");
const kindEl = document.querySelector<HTMLSpanElement>("#kind");
const statusEl = document.querySelector<HTMLElement>("#status");
const stageWrap = document.querySelector<HTMLElement>("#stage-wrap");
const inlineEl = document.querySelector<HTMLInputElement>("#inline-edit");
const iconsToggle = document.querySelector<HTMLButtonElement>("#icons-toggle");
const iconsClose = document.querySelector<HTMLButtonElement>("#icons-close");
const iconPicker = document.querySelector<HTMLElement>("#icon-picker");
const iconFilter = document.querySelector<HTMLInputElement>("#icon-filter");
const iconGrid = document.querySelector<HTMLElement>("#icon-grid");
if (
  relaxBtn === null ||
  regenBtn === null ||
  addBtn === null ||
  connectBtn === null ||
  themeBtn === null ||
  sketchBtn === null ||
  loadPackEl === null ||
  exampleEl === null ||
  kindEl === null ||
  statusEl === null ||
  stageWrap === null ||
  inlineEl === null ||
  iconsToggle === null ||
  iconsClose === null ||
  iconPicker === null ||
  iconFilter === null ||
  iconGrid === null
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

// Real label measurement (offscreen canvas) so layout sizes nodes to the actual rendered text
// rather than a char-width guess; matches the base render font. Falls back to the heuristic.
const measureCtx = document.createElement("canvas").getContext("2d");
const measureLabel = (label: string): number => {
  if (measureCtx === null) return label.length * 8;
  measureCtx.font = "14px sans-serif";
  return measureCtx.measureText(label).width;
};

// Icon glyphs rasterised from SVG once, keyed by `${pack}/${name}`, then drawn each paint.
const iconImages = new Map<string, CanvasImageSource>();
// The active icon registry; "Load icons" merges a user pack into it (overriding same-id packs).
let registry = defaultRegistry;

// The source text is persisted so a reload keeps the diagram you were working on (even mid-edit /
// not-yet-parsing) rather than resetting to the sample. Written through `renderFromText`, which
// every text change funnels through.
const SOURCE_KEY = "mermollusc-source";

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

// An <img> can only decode an SVG that declares its namespace and an intrinsic size. Inject each
// only if absent — vendored packs (e.g. simple-icons) already carry xmlns, and a duplicate
// attribute would make decoding fail.
const svgDataUrl = (svg: string): string => {
  let markup = svg;
  if (!markup.includes("xmlns=")) {
    markup = markup.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  }
  if (!/<svg[^>]*\swidth=/.test(markup)) {
    markup = markup.replace("<svg ", '<svg width="24" height="24" ');
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
};

const rasterizeIcon = async (svg: string): Promise<HTMLImageElement> => {
  const img = new Image();
  img.src = svgDataUrl(svg);
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

// Surface the pipeline's health to the status bar — the canvas alone can't tell the user that the
// current text failed to parse (it would just keep showing the last good render). On error we also
// mark the stage stale so the dimmed sheet signals "this no longer matches your text". The shell
// still logs loudly; this is the human-facing half.
// The range a parse error points at, so the status bar can offer to jump to it. We never move the
// caret automatically — the parse runs on every keystroke while the textarea is focused, so seizing
// the selection would fight the typist; instead the located status is clickable.
let errorRange: { readonly offset: number; readonly length: number } | null = null;

const lineColOf = (
  text: string,
  offset: number,
): { readonly line: number; readonly col: number } => {
  let line = 1;
  let col = 1;
  const limit = Math.min(offset, text.length);
  for (let i = 0; i < limit; i++) {
    if (text[i] === "\n") {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  return { line, col };
};

const setStatus = (
  level: "ok" | "error",
  message: string,
  range: { readonly offset: number; readonly length: number } | null = null,
): void => {
  statusEl.textContent = message;
  statusEl.setAttribute("data-level", level);
  statusEl.setAttribute("data-locatable", range === null ? "false" : "true");
  stageWrap.setAttribute("data-stale", level === "error" ? "true" : "false");
  errorRange = range;
};

statusEl.addEventListener("click", () => {
  if (errorRange === null) return;
  srcEl.focus();
  srcEl.setSelectionRange(errorRange.offset, errorRange.offset + errorRange.length);
});

// Add/Connect/Relax patch flowchart text specifically and no-op elsewhere; disabling them off-
// flowchart makes that explicit instead of a silent dead click. Regenerate re-lays any family.
const flowchartOnly = [addBtn, connectBtn, relaxBtn];
const applyKind = (kind: DiagramAst["kind"]): void => {
  kindEl.textContent = kind;
  const isFlowchart = kind === "flowchart";
  for (const btn of flowchartOnly) {
    btn.disabled = !isFlowchart;
    btn.title = isFlowchart ? "" : "flowchart only";
  }
};

const EXAMPLES = new Map<string, string>([
  ["flowchart", SAMPLE],
  [
    "sequence",
    "sequenceDiagram\n  participant A as Alice\n  participant B as Bob\n  A->>B: Hello\n  B-->>A: Hi there\n",
  ],
  [
    "c4",
    'C4Context\n  Person(alice, "Alice", "A customer")\n  Boundary(b, "Backend") {\n    Container(api, "API")\n    Container(db, "Database")\n  }\n  Rel(alice, api, "uses")\n  Rel(api, db, "reads/writes")\n',
  ],
  ["block", 'block-beta\n  columns 2\n  a["Web"]\n  b["API"]\n  c["DB"]\n  a --> b\n  b --> c\n'],
  [
    "network",
    'network\n  cloud net "Internet"\n  router r1 "Edge"\n  server web "Web"\n  net -- r1\n  r1 -- web : "eth0"\n',
  ],
  [
    "cloud",
    'cloud\n  group "AWS" {\n    compute web "Web"\n    storage assets "Assets"\n    database db "Orders"\n    queue jobs "Jobs"\n    cdn edge "Edge"\n  }\n  web -- db\n',
  ],
]);

const renderFromText = async (text: string): Promise<void> => {
  localStorage.setItem(SOURCE_KEY, text);
  const parsed = parseDiagram(text);
  if (!isOk(parsed)) {
    const detail = parsed.error.errors.join("; ");
    console.error("parse failed:", detail);
    const pos = parsed.error.positions[0];
    if (pos === undefined) {
      setStatus("error", `parse error — ${detail}`);
    } else {
      const { line, col } = lineColOf(text, pos.offset);
      setStatus("error", `parse error (line ${line}:${col}) — ${detail} · click to locate`, pos);
    }
    return;
  }
  const diagram = parsed.value;
  const laid = await layoutDiagram(diagram, measureLabel);
  if (!isOk(laid)) {
    console.error("layout failed:", laid.error.message);
    setStatus("error", `layout error — ${laid.error.message}`);
    return;
  }
  applyKind(diagram.kind);
  const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;
  setStatus(
    "ok",
    `${diagram.kind} · ${plural(laid.value.nodes.length, "node")} · ${plural(laid.value.edges.length, "edge")}`,
  );
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
  const laid = await layout(ast, seed, measureLabel);
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

// Inline label editor: a small overlay <input> over the double-clicked element, committing on
// Enter/blur and cancelling on Escape — an in-place rename instead of a modal `window.prompt`.
// One editor at a time; `closeEditor` tears down the current one before another opens.
type Anchor = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
let closeEditor: ((apply: boolean) => void) | null = null;

const openInlineEditor = (anchor: Anchor, value: string, commit: (next: string) => void): void => {
  closeEditor?.(false);
  const cr = canvas.getBoundingClientRect();
  inlineEl.value = value;
  inlineEl.style.left = `${cr.left + MARGIN + anchor.x}px`;
  inlineEl.style.top = `${cr.top + MARGIN + anchor.y}px`;
  inlineEl.style.width = `${Math.max(64, anchor.w)}px`;
  inlineEl.style.height = `${Math.max(24, anchor.h)}px`;
  inlineEl.hidden = false;
  inlineEl.focus();
  inlineEl.select();
  closeEditor = (apply) => {
    closeEditor = null;
    inlineEl.hidden = true;
    inlineEl.onkeydown = null;
    inlineEl.onblur = null;
    if (apply) commit(inlineEl.value);
  };
  inlineEl.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      closeEditor?.(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeEditor?.(false);
    }
  };
  inlineEl.onblur = () => closeEditor?.(true);
};

// The screen-space box of the hit element, so the editor sits over it. Edges have no box, so we
// anchor a fixed-width slot at the straight midpoint of their endpoints.
const anchorFor = (
  shown: Scene,
  hit: { readonly kind: "node" | "edge"; readonly id: string },
): Anchor | null => {
  if (hit.kind === "node") {
    const n = shown.nodes.find((nn) => nn.id === hit.id);
    if (n === undefined) return null;
    const { origin, size } = n.bounds;
    return { x: origin.x, y: origin.y, w: size.width, h: size.height };
  }
  const e = shown.edges.find((ee) => ee.id === hit.id);
  if (e === undefined || e.waypoints.length === 0) return null;
  const first = e.waypoints[0];
  const last = e.waypoints[e.waypoints.length - 1];
  if (first === undefined || last === undefined) return null;
  return { x: (first.x + last.x) / 2 - 30, y: (first.y + last.y) / 2 - 12, w: 80, h: 24 };
};

// Two-way edit: rename what was double-clicked and write the patch back into the source text.
canvas.addEventListener("dblclick", (ev) => {
  if (scene === null || ast === null) return;
  const shown = applyOverrides(scene, overrides);
  const hit = hitTest(shown, scenePoint(ev));
  if (hit === null) return;

  // Most families edit a `TextSpan` via `patchSpan`; flowchart nodes relabel through the source map.
  const patchAt = (
    span: TextSpan,
  ): { readonly text: string; readonly commit: (n: string) => void } => ({
    text: srcEl.value.slice(span.start, span.end),
    commit: (next) => {
      srcEl.value = patchSpan(srcEl.value, span, next);
      void renderFromText(srcEl.value);
    },
  });

  let pending: { readonly text: string; readonly commit: (n: string) => void } | null = null;

  if (ast.kind === "flowchart" && source !== null) {
    const src = source;
    if (hit.kind === "edge") {
      const span = src.edges.get(brand<string, "EdgeId">(hit.id));
      if (span !== undefined) pending = patchAt(span);
    } else {
      const nodeId = brand<string, "NodeId">(hit.id);
      pending = {
        text: shown.nodes.find((n) => n.id === hit.id)?.label ?? "",
        commit: (next) => {
          const patched = relabelNode(srcEl.value, src, nodeId, next);
          if (!isOk(patched)) {
            console.error("relabel failed:", patched.error.message);
            return;
          }
          srcEl.value = patched.value;
          void renderFromText(patched.value);
        },
      };
    }
  } else if (ast.kind === "c4" && c4Source !== null) {
    const span =
      hit.kind === "node"
        ? c4Source.elements.get(brand<string, "C4ElementId">(hit.id))
        : c4Source.rels.get(brand<string, "C4RelId">(hit.id));
    if (span !== undefined) pending = patchAt(span);
  } else if (ast.kind === "block" && blockSource !== null) {
    const span =
      hit.kind === "node"
        ? blockSource.blocks.get(brand<string, "NodeId">(hit.id))
        : blockSource.edges.get(brand<string, "EdgeId">(hit.id));
    if (span !== undefined) pending = patchAt(span);
  } else if (ast.kind === "network" && netSource !== null) {
    const span =
      hit.kind === "node"
        ? netSource.nodes.get(brand<string, "NodeId">(hit.id))
        : netSource.links.get(brand<string, "EdgeId">(hit.id));
    if (span !== undefined) pending = patchAt(span);
  } else if (ast.kind === "cloud" && cloudSource !== null) {
    const id = brand<string, "NodeId">(hit.id);
    const span =
      hit.kind === "node"
        ? (cloudSource.nodes.get(id) ?? cloudSource.groups.get(id))
        : cloudSource.links.get(brand<string, "EdgeId">(hit.id));
    if (span !== undefined) pending = patchAt(span);
  } else if (ast.kind === "sequence" && seqSource !== null) {
    const span =
      hit.kind === "node"
        ? seqSource.actors.get(brand<string, "ActorId">(hit.id))
        : seqSource.messages.get(brand<string, "MessageId">(hit.id));
    if (span !== undefined) pending = patchAt(span);
  }

  if (pending === null) return;
  const anchor = anchorFor(shown, hit);
  if (anchor === null) return;
  openInlineEditor(anchor, pending.text, pending.commit);
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

// Theme toggle: switch the palette, persist the explicit choice, and repaint (colours only). The
// `data-theme` attribute drives the page chrome so it stays cohesive with the canvas surface.
const syncThemeLabel = (): void => {
  themeBtn.textContent = theme === defaultTheme ? "Dark" : "Light";
  document.documentElement.setAttribute("data-theme", theme === darkTheme ? "dark" : "light");
};
themeBtn.addEventListener("click", () => {
  theme = theme === defaultTheme ? darkTheme : defaultTheme;
  localStorage.setItem(THEME_KEY, theme === darkTheme ? "dark" : "light");
  syncThemeLabel();
  paintScene();
});
syncThemeLabel();

// Examples menu: drop in a known-good starter for any family so the syntax is discoverable, then
// reset the select back to its placeholder.
exampleEl.addEventListener("change", () => {
  const text = EXAMPLES.get(exampleEl.value);
  exampleEl.value = "";
  if (text === undefined) return;
  overrides = new Map();
  srcEl.value = text;
  void renderFromText(text);
});

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
    const detail = e instanceof Error ? e.message : String(e);
    console.error("pack parse failed:", detail);
    setStatus("error", `icon pack is not valid JSON — ${detail}`);
    return;
  }
  const decoded = decodePack(json);
  if (!isOk(decoded)) {
    const detail = decoded.error.issues.join("; ");
    console.error("pack decode failed:", detail);
    setStatus("error", `icon pack rejected — ${detail}`);
    return;
  }
  registry = registerPack(registry, decoded.value);
  iconImages.clear(); // drop stale glyphs so overridden packs re-rasterise
  setStatus("ok", `loaded icon pack "${decoded.value.meta.id}"`);
  void renderFromText(srcEl.value);
};

loadPackEl.addEventListener("change", () => {
  const file = loadPackEl.files?.[0];
  if (file === undefined || file === null) return;
  void loadPack(file);
});

// Icon picker: browse the active registry (pack → category → glyph) and insert an
// `icon "<pack>/<name>"` override at the editor caret. Built fresh on each open so it reflects any
// packs added via "Load icons". The glyph previews reuse the SVG→data-URL path (no innerHTML).
const insertIconRef = (packId: string, name: string): void => {
  const ref = ` icon "${packId}/${name}"`;
  const at = srcEl.selectionStart;
  srcEl.value = srcEl.value.slice(0, at) + ref + srcEl.value.slice(at);
  const caret = at + ref.length;
  srcEl.setSelectionRange(caret, caret);
  overrides = new Map();
  void renderFromText(srcEl.value);
};

const buildIconGrid = (filter: string): void => {
  iconGrid.replaceChildren();
  const needle = filter.trim().toLowerCase();
  let shown = 0;
  for (const [packId, pack] of registry.packs) {
    for (const [category, names] of pack.categories) {
      const matches = names.filter(
        (n) =>
          needle === "" ||
          n.toLowerCase().includes(needle) ||
          packId.toLowerCase().includes(needle),
      );
      if (matches.length === 0) continue;
      const title = document.createElement("div");
      title.className = "picker-group-title";
      title.textContent = `${packId} · ${category}`;
      const grid = document.createElement("div");
      grid.className = "picker-icons";
      for (const name of matches) {
        const svg = pack.icons.get(name);
        if (svg === undefined) continue;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "picker-icon";
        btn.title = `${packId}/${name}`;
        const img = document.createElement("img");
        img.alt = name;
        img.src = svgDataUrl(svg);
        btn.append(img);
        btn.addEventListener("click", () => insertIconRef(packId, name));
        grid.append(btn);
        shown += 1;
      }
      iconGrid.append(title, grid);
    }
  }
  if (shown === 0) {
    const empty = document.createElement("p");
    empty.className = "picker-empty";
    empty.textContent = "No icons match.";
    iconGrid.append(empty);
  }
};

let pickerOpen = false;
const setPickerOpen = (open: boolean): void => {
  pickerOpen = open;
  iconPicker.hidden = !open;
  iconsToggle.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) buildIconGrid(iconFilter.value);
};

iconsToggle.addEventListener("click", () => setPickerOpen(!pickerOpen));
iconsClose.addEventListener("click", () => setPickerOpen(false));
iconFilter.addEventListener("input", () => buildIconGrid(iconFilter.value));

const initialSource = localStorage.getItem(SOURCE_KEY) ?? SAMPLE;
srcEl.value = initialSource;
srcEl.addEventListener("input", () => {
  overrides = new Map();
  void renderFromText(srcEl.value);
});
void renderFromText(initialSource);
