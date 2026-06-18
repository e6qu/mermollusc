import {
  addNode,
  applyOverrides,
  connect,
  connectC4,
  connectEr,
  connectMessage,
  connectUndirected,
  decodeOverlay,
  deleteActor,
  deleteC4,
  deleteC4Rel,
  deleteEdge,
  deleteErRel,
  deleteMessage,
  deleteNode,
  emptySelection,
  group,
  hitTest,
  leafNodes,
  moveNode,
  patchSpan,
  pathLocked,
  pruneGroups,
  relabelNode,
  resizeNode,
  selectOnly,
  serializeOverlay,
  setGroupLabel,
  setLocked,
  toggle,
  topGroupOfNode,
  ungroup,
} from "@m/builder";
import type { Selection } from "@m/builder";
import type {
  BlockSource,
  C4Source,
  CloudSource,
  ErSource,
  DiagramAst,
  GroupId,
  GroupMember,
  Groups,
  LayoutOverrides,
  NetworkSource,
  NodeId,
  Scene,
  SceneNodeId,
  SequenceSource,
  SourceMap,
  StateSource,
  TextSpan,
} from "@m/contracts";
import { decodePack, defaultRegistry, findIcon, registerPack } from "@m/icons";
import { layout, layoutDiagram } from "@m/layout";
import {
  parseBlockWithSource,
  parseC4WithSource,
  parseCloudWithSource,
  parseErWithSource,
  parseDiagram,
  parseNetworkWithSource,
  parseSequenceWithSource,
  parseStateWithSource,
  parseWithSource,
} from "@m/parser";
import { darkTheme, defaultTheme, edgeLabelAnchor, paint, toDisplayList, toSvg } from "@m/renderer";
import type { Theme } from "@m/renderer";
import { brand, isOk, point, type Point, size } from "@m/std";
import { createEditor, type Editor } from "./editor.js";

const SAMPLE = `flowchart TD
  A[Start] --> B{Choice}
  B -->|yes| C(Process)
  B -->|no| D(End)
  C --> D
`;

const MARGIN = 24;

const editorMount = document.querySelector<HTMLDivElement>("#editor");
const canvas = document.querySelector<HTMLCanvasElement>("#stage");
if (editorMount === null || canvas === null)
  throw new Error("playground: missing #editor or #stage");

// Assigned once in the init block below (its change callback needs `renderFromText`, defined later);
// every handler that touches the source goes through this instead of a raw element. The definite-
// assignment assertion reflects that ordering — handlers only fire after init has run.
let editor!: Editor;
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
const exportBtn = document.querySelector<HTMLButtonElement>("#export-png");
const exportPdfBtn = document.querySelector<HTMLButtonElement>("#export-pdf");
const exportSvgBtn = document.querySelector<HTMLButtonElement>("#export-svg");
const shareBtn = document.querySelector<HTMLButtonElement>("#share-link");
const zoomInBtn = document.querySelector<HTMLButtonElement>("#zoom-in");
const zoomOutBtn = document.querySelector<HTMLButtonElement>("#zoom-out");
const zoomResetBtn = document.querySelector<HTMLButtonElement>("#zoom-reset");
const zoomFitBtn = document.querySelector<HTMLButtonElement>("#zoom-fit");
const minimap = document.querySelector<HTMLCanvasElement>("#minimap");
const groupBtn = document.querySelector<HTMLButtonElement>("#group");
const ungroupBtn = document.querySelector<HTMLButtonElement>("#ungroup");
const lockBtn = document.querySelector<HTMLButtonElement>("#lock");
const arrangeBtn = document.querySelector<HTMLButtonElement>("#arrange");
const arrangeMenu = document.querySelector<HTMLDivElement>("#arrange-menu");
// Distribute needs ≥3 units; kept as refs so the popover can disable them at <3 (the align buttons
// are wired by id without refs).
const distHBtn = document.querySelector<HTMLButtonElement>("#dist-h");
const distVBtn = document.querySelector<HTMLButtonElement>("#dist-v");
if (
  groupBtn === null ||
  ungroupBtn === null ||
  lockBtn === null ||
  arrangeBtn === null ||
  arrangeMenu === null ||
  zoomInBtn === null ||
  zoomOutBtn === null ||
  zoomResetBtn === null ||
  zoomFitBtn === null ||
  minimap === null ||
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
  iconGrid === null ||
  exportBtn === null ||
  exportPdfBtn === null ||
  exportSvgBtn === null ||
  shareBtn === null
) {
  throw new Error("playground: missing toolbar controls");
}
const miniCtx = minimap.getContext("2d");
if (miniCtx === null) throw new Error("playground: minimap 2d context unavailable");

let ast: DiagramAst | null = null;
let scene: Scene | null = null;
let source: SourceMap | null = null;
let seqSource: SequenceSource | null = null;
let c4Source: C4Source | null = null;
let blockSource: BlockSource | null = null;
let netSource: NetworkSource | null = null;
let cloudSource: CloudSource | null = null;
let stateSource: StateSource | null = null;
let erSource: ErSource | null = null;
let overrides: LayoutOverrides = new Map();
// Sidecar element groups (never in the diagram text). `groupSeq` mints fresh ids.
let groups: Groups = new Map();
let groupSeq = 0;
// On-screen zoom of the diagram sheet. 1 = the canvas is drawn at scene scale (the identity the
// hit-test math and e2e specs assume); only the zoom controls / ctrl-wheel change it.
let viewScale = 1;
const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
// The last laid-out scene + logical sheet size, cached so the minimap can redraw on scroll without
// re-running the main paint. The minimap renders a *simplified* view from the scene (node blocks,
// faint edges) rather than the full display list — shrunk labels/icons would just be noise.
let lastRender: {
  readonly scene: Scene;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
} | null = null;
// The minimap thumbnail fits inside this box (px), preserving the diagram's aspect.
const MINIMAP_MAX = 180;
let selection: Selection = emptySelection;
// Set membership is unordered, but `connect` needs a direction, so we track click order.
let selectionOrder: SceneNodeId[] = [];
// A drag moves every node in `ids` (the whole selection) by the pointer delta from where the drag
// began, using each node's start position in `origin` — so a multi-selection moves as one.
let drag: {
  readonly ids: readonly SceneNodeId[];
  readonly origin: ReadonlyMap<SceneNodeId, Point>;
  readonly pointerX: number;
  readonly pointerY: number;
} | null = null;
// Whether the in-progress drag has already snapshotted the overlay for undo (done on the first move,
// so a click that never moves leaves no no-op history entry).
let dragRecorded = false;
// Background-drag panning of the (scrollable) stage: the pointer position and scroll offsets at the
// moment the empty canvas was grabbed.
let pan: {
  readonly startX: number;
  readonly startY: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
} | null = null;
// A shift-drag box-select on the empty canvas: the start corner and the current corner, in scene
// coordinates. On release, every node the box touches is added to the selection.
let marquee: { readonly x0: number; readonly y0: number; x1: number; y1: number } | null = null;
// True while a run of arrow-key nudges is in progress, so the run shares a single undo entry (the
// pre-nudge overlay is recorded once); reset by any other interaction.
let nudging = false;
// A corner-handle resize of the single selected node: the *fixed* opposite corner (scene coords)
// the box grows from. `resizeRecorded` mirrors `dragRecorded` — the undo entry is taken on the first
// move so a handle click that doesn't move leaves no entry.
let resize: {
  readonly id: SceneNodeId;
  readonly anchorX: number;
  readonly anchorY: number;
} | null = null;
let resizeRecorded = false;
const RESIZE_MIN_W = 30;
const RESIZE_MIN_H = 24;
const HANDLE_HIT = 7;

// Icon glyphs rasterised from SVG once, keyed by `${pack}/${name}`, then drawn each paint.
const iconImages = new Map<string, CanvasImageSource>();
// The active icon registry; "Load icons" merges a user pack into it (overriding same-id packs).
let registry = defaultRegistry;

// The source text is persisted so a reload keeps the diagram you were working on (even mid-edit /
// not-yet-parsing) rather than resetting to the sample. Written through `renderFromText`, which
// every text change funnels through.
const SOURCE_KEY = "mermollusc-source";

// The sidecar overlay (manual node positions + element groups) persists alongside the source, keyed
// by scene-node id — a reload re-parses the same source to the same ids, so the overlay re-applies.
const OVERLAY_KEY = "mermollusc-overlay";
const persistOverlay = (): void => {
  localStorage.setItem(OVERLAY_KEY, serializeOverlay(overrides, groups));
};

// Undo/redo for sidecar overlay actions (drag, group/ungroup/lock, group label, regenerate) — the
// canvas counterpart to CodeMirror's text history (which owns the source text). `recordOverlay`
// snapshots the *pre-mutation* overlay; undo swaps that snapshot with the present state, redo
// reverses it. A text edit clears the stacks, since the saved positions belong to the old diagram.
interface OverlaySnapshot {
  readonly overrides: LayoutOverrides;
  readonly groups: Groups;
}
const HISTORY_LIMIT = 100;
let undoStack: OverlaySnapshot[] = [];
let redoStack: OverlaySnapshot[] = [];
const snapshotOverlay = (): OverlaySnapshot => ({
  overrides: new Map(overrides),
  groups: new Map(groups),
});
const recordOverlay = (): void => {
  undoStack.push(snapshotOverlay());
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack = [];
};
const clearOverlayHistory = (): void => {
  undoStack = [];
  redoStack = [];
};
const restoreOverlay = (snapshot: OverlaySnapshot): void => {
  overrides = new Map(snapshot.overrides);
  groups = new Map(snapshot.groups);
  nudging = false; // a fresh nudge run after undo/redo starts its own undo entry
  persistOverlay();
  paintScene();
  updateGroupButtons();
};
const undoOverlay = (): void => {
  const prev = undoStack.pop();
  if (prev === undefined) return;
  redoStack.push(snapshotOverlay());
  restoreOverlay(prev);
};
const redoOverlay = (): void => {
  const next = redoStack.pop();
  if (next === undefined) return;
  undoStack.push(snapshotOverlay());
  restoreOverlay(next);
};

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

// Real label measurement (offscreen canvas) so layout sizes nodes to the actual rendered text
// rather than a char-width guess. Measures with the *active* theme font — the sketch font is wider
// than the base, so sizing with it keeps labels inside their boxes in Sketch mode. Falls back to
// the heuristic when no 2D context is available.
const measureCtx = document.createElement("canvas").getContext("2d");
const measureLabel = (label: string): number => {
  if (measureCtx === null) return label.length * 8;
  measureCtx.font = activeTheme().font;
  return measureCtx.measureText(label).width;
};

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
  // Logical sheet size in scene px (+ margin); the on-screen box is this scaled by the zoom.
  const logicalWidth = Math.ceil(shown.extent.size.width) + MARGIN * 2;
  const logicalHeight = Math.ceil(shown.extent.size.height) + MARGIN * 2;
  const cssWidth = logicalWidth * viewScale;
  const cssHeight = logicalHeight * viewScale;
  // Back the canvas at device resolution but draw in CSS pixels, so it stays crisp on HiDPI
  // displays. The CSS size pins the on-screen box; the dpr·zoom scale fills the larger backing store
  // and keeps the diagram crisp at any zoom (we re-render, not bitmap-scale).
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(logicalWidth * dpr * viewScale);
  canvas.height = Math.round(logicalHeight * dpr * viewScale);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const active = activeTheme();
  canvas.style.backgroundColor = active.background;
  // Build the display list once and reuse it for both the main canvas and the minimap overview.
  const cmds = toDisplayList(shown);
  ctx.setTransform(dpr * viewScale, 0, 0, dpr * viewScale, 0, 0);
  ctx.clearRect(0, 0, logicalWidth, logicalHeight);
  ctx.save();
  ctx.translate(MARGIN, MARGIN);
  drawGroupOutlines(shown);
  paint(ctx, cmds, iconImages, active);
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 2;
  for (const node of shown.nodes) {
    if (selection.nodes.has(node.id)) {
      const { origin, size } = node.bounds;
      ctx.strokeRect(origin.x - 3, origin.y - 3, size.width + 6, size.height + 6);
    }
  }
  if (marquee !== null) {
    const x = Math.min(marquee.x0, marquee.x1);
    const y = Math.min(marquee.y0, marquee.y1);
    const w = Math.abs(marquee.x1 - marquee.x0);
    const h = Math.abs(marquee.y1 - marquee.y0);
    ctx.fillStyle = "rgba(37,99,235,0.08)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }
  // Resize handles: small squares at the corners of the single selected node.
  const resizableId = singleResizableNodeId();
  if (resizableId !== null) {
    const node = shown.nodes.find((n) => n.id === resizableId);
    if (node !== undefined) {
      const { origin, size: box } = node.bounds;
      const hs = 4;
      ctx.fillStyle = "#2563eb";
      const corners: ReadonlyArray<readonly [number, number]> = [
        [origin.x, origin.y],
        [origin.x + box.width, origin.y],
        [origin.x, origin.y + box.height],
        [origin.x + box.width, origin.y + box.height],
      ];
      for (const [hx, hy] of corners) {
        ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
      }
    }
  }
  ctx.restore();
  lastRender = { scene: shown, logicalWidth, logicalHeight };
  drawMinimap();
};

const GROUP_PAD = 10;
const GROUP_HIT_TOLERANCE = 6;
const GROUP_TITLE_HEIGHT = 24;
interface GroupBox {
  readonly id: GroupId;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const groupBoxes = (shown: Scene): readonly GroupBox[] => {
  const boundsById = new Map(shown.nodes.map((node) => [node.id, node.bounds]));
  const boxes: GroupBox[] = [];
  for (const g of groups.values()) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const id of leafNodes(groups, g.id)) {
      const b = boundsById.get(id);
      if (b === undefined) continue;
      minX = Math.min(minX, b.origin.x);
      minY = Math.min(minY, b.origin.y);
      maxX = Math.max(maxX, b.origin.x + b.size.width);
      maxY = Math.max(maxY, b.origin.y + b.size.height);
    }
    if (minX === Number.POSITIVE_INFINITY) continue;
    boxes.push({
      id: g.id,
      x: minX - GROUP_PAD,
      y: minY - GROUP_PAD,
      w: maxX - minX + GROUP_PAD * 2,
      h: maxY - minY + GROUP_PAD * 2,
    });
  }
  return boxes;
};

const groupOutlineAt = (shown: Scene, at: Point): GroupId | null => {
  const boxes = groupBoxes(shown);
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    if (box === undefined) continue;
    const inside = at.x >= box.x && at.x <= box.x + box.w && at.y >= box.y && at.y <= box.y + box.h;
    if (!inside) continue;
    const dx = Math.min(Math.abs(at.x - box.x), Math.abs(at.x - (box.x + box.w)));
    const dy = Math.min(Math.abs(at.y - box.y), Math.abs(at.y - (box.y + box.h)));
    if (Math.min(dx, dy) <= GROUP_HIT_TOLERANCE) return box.id;
  }
  return null;
};

const groupTitleAt = (shown: Scene, at: Point): GroupId | null => {
  const boxes = groupBoxes(shown);
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    if (box === undefined) continue;
    const inside =
      at.x >= box.x && at.x <= box.x + box.w && at.y >= box.y && at.y <= box.y + GROUP_TITLE_HEIGHT;
    if (inside) return box.id;
  }
  return null;
};

const groupAt = (shown: Scene, at: Point): GroupId | null => {
  const boxes = groupBoxes(shown);
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    if (box === undefined) continue;
    const inside = at.x >= box.x && at.x <= box.x + box.w && at.y >= box.y && at.y <= box.y + box.h;
    if (inside) return box.id;
  }
  return null;
};

const selectGroup = (id: GroupId): void => {
  const leaves = leafNodes(groups, id);
  selection = { nodes: new Set(leaves), edges: new Set() };
  selectionOrder = [...leaves];
};

const toggleGroupSelection = (id: GroupId): void => {
  const leaves = leafNodes(groups, id);
  const nodes = new Set(selection.nodes);
  const allSelected = leaves.every((leaf) => nodes.has(leaf));
  if (allSelected) {
    for (const leaf of leaves) nodes.delete(leaf);
    selectionOrder = selectionOrder.filter((leaf) => !leaves.includes(leaf));
  } else {
    for (const leaf of leaves) nodes.add(leaf);
    selectionOrder = [
      ...selectionOrder,
      ...leaves.filter((leaf) => !selectionOrder.includes(leaf)),
    ];
  }
  selection = { nodes, edges: selection.edges };
};

// Draw each group as a rounded outline around its members' bounding box (drawn behind the nodes).
// Nested groups nest visually; a locked group is solid + accent with a padlock, unlocked is dashed.
const drawGroupOutlines = (shown: Scene): void => {
  if (groups.size === 0) return;
  const dark = theme === darkTheme;
  for (const box of groupBoxes(shown)) {
    const g = groups.get(box.id);
    if (g === undefined) continue;
    const accent = g.locked ? (dark ? "#f0894e" : "#d2602c") : dark ? "#4cc2c4" : "#0f6f74";
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fillStyle = g.locked ? "rgba(210,96,44,0.07)" : "rgba(15,111,116,0.05)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = accent;
    ctx.setLineDash(g.locked ? [] : [6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (g.locked) {
      ctx.fillStyle = accent;
      ctx.font = "12px sans-serif";
      ctx.fillText("🔒", box.x + 5, box.y + 15);
    }
    if (g.label.length > 0) {
      // A fieldset-style legend: the label sits on the top border, with a background-colored notch
      // behind it so the outline doesn't strike through the text.
      ctx.font = activeTheme().font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const cx = box.x + box.w / 2;
      const half = ctx.measureText(g.label).width / 2 + 4;
      ctx.fillStyle = activeTheme().background;
      ctx.fillRect(cx - half, box.y - 8, half * 2, 16);
      ctx.fillStyle = accent;
      ctx.fillText(g.label, cx, box.y);
    }
    ctx.restore();
  }
};

// The top-level group of the first selected node, or null — what Ungroup/Lock act on.
const selectedTopGroup = (): GroupId | null => {
  for (const id of selection.nodes) {
    const top = topGroupOfNode(groups, id);
    if (top !== null) return top;
  }
  return null;
};

// Distinct *movable* top-level units in the selection — a loose node or a whole top group, minus
// anything under a locked group. Alignment/distribution act on these (a group moves as a unit).
const movableUnitCount = (): number => {
  const seen = new Set<string>();
  for (const id of selection.nodes) {
    if (pathLocked(groups, id)) continue;
    const top = topGroupOfNode(groups, id);
    seen.add(top === null ? `n:${id}` : `g:${top}`);
  }
  return seen.size;
};

// The single selected node, when it's the only thing selected and not under a locked group — the one
// node that shows resize handles. (Resize is single-node; multi-select uses Group/Arrange instead.)
const singleResizableNodeId = (): SceneNodeId | null => {
  if (selection.nodes.size !== 1) return null;
  const [only] = selection.nodes;
  if (only === undefined || pathLocked(groups, only)) return null;
  return only;
};

// If `at` is on a corner handle of the resizable node, the fixed opposite corner the box grows from.
const resizeAnchorAt = (
  shown: Scene,
  at: Point,
): { readonly id: SceneNodeId; readonly anchorX: number; readonly anchorY: number } | null => {
  const id = singleResizableNodeId();
  if (id === null) return null;
  const node = shown.nodes.find((n) => n.id === id);
  if (node === undefined) return null;
  const { origin, size: box } = node.bounds;
  const x0 = origin.x;
  const y0 = origin.y;
  const x1 = origin.x + box.width;
  const y1 = origin.y + box.height;
  const corners = [
    { cx: x0, cy: y0, ax: x1, ay: y1 },
    { cx: x1, cy: y0, ax: x0, ay: y1 },
    { cx: x0, cy: y1, ax: x1, ay: y0 },
    { cx: x1, cy: y1, ax: x0, ay: y0 },
  ];
  for (const c of corners) {
    if (Math.abs(at.x - c.cx) <= HANDLE_HIT && Math.abs(at.y - c.cy) <= HANDLE_HIT) {
      return { id, anchorX: c.ax, anchorY: c.ay };
    }
  }
  return null;
};

// Reflect the current selection in the group controls (enabled state + Lock/Unlock label).
const updateGroupButtons = (): void => {
  const units = new Set<string>();
  for (const id of selection.nodes) {
    const top = topGroupOfNode(groups, id);
    units.add(top === null ? `n:${id}` : `g:${top}`);
  }
  groupBtn.disabled = units.size < 2;
  const top = selectedTopGroup();
  ungroupBtn.disabled = top === null;
  lockBtn.disabled = top === null;
  lockBtn.textContent = top !== null && groups.get(top)?.locked === true ? "Unlock" : "Lock";
  // Arrange acts on ≥2 movable units (distribute on ≥3); close the popover if it no longer applies.
  const movable = movableUnitCount();
  arrangeBtn.disabled = movable < 2;
  if (distHBtn !== null) distHBtn.disabled = movable < 3;
  if (distVBtn !== null) distVBtn.disabled = movable < 3;
  if (movable < 2) closeArrange();
};

type AlignKind = "left" | "right" | "top" | "bottom" | "centerX" | "centerY" | "distH" | "distV";

interface UnitBox {
  readonly leaves: readonly SceneNodeId[];
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

// Each movable selection unit (loose node or top group) with the bounding box of its leaves, in
// shown coordinates. Alignment translates a whole unit, so a group keeps its internal layout.
const selectedUnitBoxes = (shown: Scene): UnitBox[] => {
  const byId = new Map(shown.nodes.map((n) => [n.id, n.bounds]));
  const seen = new Set<string>();
  const units: UnitBox[] = [];
  for (const id of selection.nodes) {
    if (pathLocked(groups, id)) continue;
    const top = topGroupOfNode(groups, id);
    const key = top === null ? `n:${id}` : `g:${top}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const leaves = top === null ? [id] : leafNodes(groups, top);
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const leaf of leaves) {
      const b = byId.get(leaf);
      if (b === undefined) continue;
      minX = Math.min(minX, b.origin.x);
      minY = Math.min(minY, b.origin.y);
      maxX = Math.max(maxX, b.origin.x + b.size.width);
      maxY = Math.max(maxY, b.origin.y + b.size.height);
    }
    if (minX === Number.POSITIVE_INFINITY) continue;
    units.push({ leaves, x: minX, y: minY, w: maxX - minX, h: maxY - minY });
  }
  return units;
};

// The per-leaf translation that aligns/distributes the unit boxes. Distribute spaces the unit
// centres evenly between the extreme units (which stay put); align snaps an edge or centre axis.
const arrangeDeltas = (
  kind: AlignKind,
  units: readonly UnitBox[],
): Map<SceneNodeId, { readonly dx: number; readonly dy: number }> => {
  const deltas = new Map<SceneNodeId, { readonly dx: number; readonly dy: number }>();
  const put = (u: UnitBox, dx: number, dy: number): void => {
    for (const leaf of u.leaves) deltas.set(leaf, { dx, dy });
  };
  const lefts = units.map((u) => u.x);
  const rights = units.map((u) => u.x + u.w);
  const tops = units.map((u) => u.y);
  const bottoms = units.map((u) => u.y + u.h);
  switch (kind) {
    case "left": {
      const t = Math.min(...lefts);
      for (const u of units) put(u, t - u.x, 0);
      break;
    }
    case "right": {
      const t = Math.max(...rights);
      for (const u of units) put(u, t - u.w - u.x, 0);
      break;
    }
    case "top": {
      const t = Math.min(...tops);
      for (const u of units) put(u, 0, t - u.y);
      break;
    }
    case "bottom": {
      const t = Math.max(...bottoms);
      for (const u of units) put(u, 0, t - u.h - u.y);
      break;
    }
    case "centerX": {
      const axis = (Math.min(...lefts) + Math.max(...rights)) / 2;
      for (const u of units) put(u, axis - u.w / 2 - u.x, 0);
      break;
    }
    case "centerY": {
      const axis = (Math.min(...tops) + Math.max(...bottoms)) / 2;
      for (const u of units) put(u, 0, axis - u.h / 2 - u.y);
      break;
    }
    case "distH": {
      const sorted = [...units].sort((a, b) => a.x + a.w / 2 - (b.x + b.w / 2));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      if (first === undefined || last === undefined) break;
      const lo = first.x + first.w / 2;
      const step = (last.x + last.w / 2 - lo) / (sorted.length - 1);
      sorted.forEach((u, i) => {
        put(u, lo + i * step - u.w / 2 - u.x, 0);
      });
      break;
    }
    case "distV": {
      const sorted = [...units].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      if (first === undefined || last === undefined) break;
      const lo = first.y + first.h / 2;
      const step = (last.y + last.h / 2 - lo) / (sorted.length - 1);
      sorted.forEach((u, i) => {
        put(u, 0, lo + i * step - u.h / 2 - u.y);
      });
      break;
    }
  }
  return deltas;
};

const applyArrange = (kind: AlignKind): void => {
  if (scene === null) return;
  const shown = applyOverrides(scene, overrides);
  const units = selectedUnitBoxes(shown);
  const need = kind === "distH" || kind === "distV" ? 3 : 2;
  if (units.length < need) return;
  const deltas = arrangeDeltas(kind, units);
  if (deltas.size === 0) return;
  const origin = new Map(shown.nodes.map((n) => [n.id, n.bounds.origin]));
  recordOverlay();
  for (const [id, d] of deltas) {
    const at = origin.get(id);
    if (at !== undefined) overrides = moveNode(overrides, id, point(at.x + d.dx, at.y + d.dy));
  }
  persistOverlay();
  paintScene();
};

const closeArrange = (): void => {
  arrangeMenu.hidden = true;
  arrangeBtn.setAttribute("aria-expanded", "false");
};
arrangeBtn.addEventListener("click", (ev) => {
  ev.stopPropagation();
  const willOpen = arrangeMenu.hidden;
  arrangeMenu.hidden = !willOpen;
  arrangeBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
});
document.addEventListener("pointerdown", (ev) => {
  if (arrangeMenu.hidden) return;
  const t = ev.target;
  if (t instanceof Node && (arrangeMenu.contains(t) || t === arrangeBtn)) return;
  closeArrange();
});

const ARRANGE_ACTIONS: ReadonlyArray<{ readonly id: string; readonly kind: AlignKind }> = [
  { id: "align-left", kind: "left" },
  { id: "align-centerX", kind: "centerX" },
  { id: "align-right", kind: "right" },
  { id: "align-top", kind: "top" },
  { id: "align-centerY", kind: "centerY" },
  { id: "align-bottom", kind: "bottom" },
  { id: "dist-h", kind: "distH" },
  { id: "dist-v", kind: "distV" },
];
for (const { id, kind } of ARRANGE_ACTIONS) {
  document.querySelector<HTMLButtonElement>(`#${id}`)?.addEventListener("click", () => {
    applyArrange(kind);
    closeArrange();
  });
}

// Bundle the selection into a new group. Each selected node contributes its top group (nesting an
// existing group) or itself — so groups and loose elements bundle together, in selection order.
const groupSelection = (): void => {
  const units: GroupMember[] = [];
  const seen = new Set<string>();
  for (const id of selectionOrder) {
    const top = topGroupOfNode(groups, id);
    const member: GroupMember = top === null ? { kind: "node", id } : { kind: "group", id: top };
    const key = `${member.kind}:${member.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    units.push(member);
  }
  if (units.length < 2) return;
  recordOverlay();
  groups = group(groups, brand<string, "GroupId">(`g${groupSeq++}`), units);
  updateGroupButtons();
  persistOverlay();
  paintScene();
};

const ungroupSelection = (): void => {
  const top = selectedTopGroup();
  if (top === null) return;
  recordOverlay();
  groups = ungroup(groups, top);
  updateGroupButtons();
  persistOverlay();
  paintScene();
};

const toggleLockSelection = (): void => {
  const top = selectedTopGroup();
  const g = top === null ? undefined : groups.get(top);
  if (top === null || g === undefined) return;
  recordOverlay();
  groups = setLocked(groups, top, !g.locked);
  updateGroupButtons();
  persistOverlay();
  paintScene();
};

groupBtn.addEventListener("click", groupSelection);
ungroupBtn.addEventListener("click", ungroupSelection);
lockBtn.addEventListener("click", toggleLockSelection);
updateGroupButtons();

// A purpose-built small-scale view (not a shrunk copy of the canvas): nodes become solid blocks and
// edges thin guides, so the *structure* reads at ~180px where labels/icons would be noise. The
// visible region is left bright while everything outside it is dimmed by a scrim — a clear
// "you are here" — and framed in the drafting-table accent. Shown only when the sheet overflows.
const MINIMAP_ACCENT_LIGHT = "#d2602c";
const MINIMAP_ACCENT_DARK = "#f0894e";

const drawMinimap = (): void => {
  if (lastRender === null) return;
  const { scene, logicalWidth, logicalHeight } = lastRender;
  const overflowing =
    logicalWidth * viewScale > stageWrap.clientWidth + 1 ||
    logicalHeight * viewScale > stageWrap.clientHeight + 1;
  if (!overflowing) {
    minimap.hidden = true;
    return;
  }
  minimap.hidden = false;

  const miniScale = Math.min(MINIMAP_MAX / logicalWidth, MINIMAP_MAX / logicalHeight);
  const miniW = logicalWidth * miniScale;
  const miniH = logicalHeight * miniScale;
  const dpr = window.devicePixelRatio || 1;
  minimap.width = Math.round(miniW * dpr);
  minimap.height = Math.round(miniH * dpr);
  minimap.style.width = `${miniW}px`;
  minimap.style.height = `${miniH}px`;

  const active = activeTheme();
  // Work in logical coordinates (origin at the sheet's content, matching the canvas's MARGIN inset).
  miniCtx.setTransform(dpr * miniScale, 0, 0, dpr * miniScale, 0, 0);
  miniCtx.clearRect(0, 0, logicalWidth, logicalHeight);
  miniCtx.fillStyle = active.background;
  miniCtx.fillRect(0, 0, logicalWidth, logicalHeight);
  miniCtx.save();
  miniCtx.translate(MARGIN, MARGIN);
  // Faint edges first, then node blocks on top.
  miniCtx.strokeStyle = active.stroke;
  miniCtx.globalAlpha = 0.35;
  miniCtx.lineWidth = 1 / miniScale;
  for (const edge of scene.edges) {
    const [head, ...tail] = edge.waypoints;
    if (head === undefined) continue;
    miniCtx.beginPath();
    miniCtx.moveTo(head.x, head.y);
    for (const p of tail) miniCtx.lineTo(p.x, p.y);
    miniCtx.stroke();
  }
  miniCtx.globalAlpha = 1;
  miniCtx.fillStyle = active.nodeFill;
  miniCtx.strokeStyle = active.stroke;
  miniCtx.lineWidth = 1 / miniScale;
  for (const node of scene.nodes) {
    const { origin, size } = node.bounds;
    miniCtx.fillRect(origin.x, origin.y, size.width, size.height);
    miniCtx.strokeRect(origin.x, origin.y, size.width, size.height);
  }
  miniCtx.restore();

  // The visible logical region, derived from the live canvas/stage rects so the centred/padded
  // scroll container needs no special-casing. Coordinates are logical px from the canvas origin.
  const canvasRect = canvas.getBoundingClientRect();
  const wrapRect = stageWrap.getBoundingClientRect();
  const left = Math.max(0, (wrapRect.left - canvasRect.left) / viewScale);
  const top = Math.max(0, (wrapRect.top - canvasRect.top) / viewScale);
  const right = Math.min(logicalWidth, left + stageWrap.clientWidth / viewScale);
  const bottom = Math.min(logicalHeight, top + stageWrap.clientHeight / viewScale);

  // Dim everything *outside* the viewport with a scrim (four bands), leaving the visible region
  // bright — the strongest "you are here" cue at this size.
  const dark = theme === darkTheme;
  miniCtx.fillStyle = dark ? "rgba(7,16,15,0.5)" : "rgba(24,37,41,0.34)";
  miniCtx.fillRect(0, 0, logicalWidth, top);
  miniCtx.fillRect(0, bottom, logicalWidth, logicalHeight - bottom);
  miniCtx.fillRect(0, top, left, bottom - top);
  miniCtx.fillRect(right, top, logicalWidth - right, bottom - top);

  // A faint accent tint inside the viewport so the "here" region reads as a lit lens, not just an
  // un-dimmed gap — the scrim outside and the tint inside push the contrast from both sides.
  const accent = dark ? MINIMAP_ACCENT_DARK : MINIMAP_ACCENT_LIGHT;
  miniCtx.fillStyle = dark ? "rgba(240,137,78,0.12)" : "rgba(210,96,44,0.10)";
  miniCtx.fillRect(left, top, right - left, bottom - top);

  // Inset the stroke by half its width and clamp it inside the sheet, so the rectangle is never
  // half-clipped by the minimap edge when the viewport butts against the sheet boundary.
  const lineW = 2 / miniScale;
  const half = lineW / 2;
  const rx = Math.min(Math.max(left, half), logicalWidth - half);
  const ry = Math.min(Math.max(top, half), logicalHeight - half);
  const rr = Math.min(Math.max(right, half), logicalWidth - half);
  const rb = Math.min(Math.max(bottom, half), logicalHeight - half);
  miniCtx.strokeStyle = accent;
  miniCtx.lineWidth = lineW;
  miniCtx.strokeRect(rx, ry, rr - rx, rb - ry);
};

const updateZoomLabel = (): void => {
  zoomResetBtn.textContent = `${Math.round(viewScale * 100)}%`;
};

const setScale = (s: number): void => {
  viewScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  updateZoomLabel();
  paintScene();
};

// Fit the whole sheet inside the visible stage, never upscaling past 100%.
const fitView = (): void => {
  if (scene === null) return;
  const shown = applyOverrides(scene, overrides);
  const logicalWidth = Math.ceil(shown.extent.size.width) + MARGIN * 2;
  const logicalHeight = Math.ceil(shown.extent.size.height) + MARGIN * 2;
  const pad = 24;
  setScale(
    Math.min(
      1,
      (stageWrap.clientWidth - pad) / logicalWidth,
      (stageWrap.clientHeight - pad) / logicalHeight,
    ),
  );
};

zoomInBtn.addEventListener("click", () => setScale(viewScale * 1.25));
zoomOutBtn.addEventListener("click", () => setScale(viewScale / 1.25));
zoomResetBtn.addEventListener("click", () => setScale(1));
zoomFitBtn.addEventListener("click", fitView);

// Ctrl/⌘-wheel zooms (plain wheel still scrolls the stage), anchored on the cursor: the scene point
// under the pointer stays put. We measure the canvas rect before and after the re-render and nudge
// the stage scroll to cancel the drift — which avoids reasoning about the centred/padded container.
canvas.addEventListener(
  "wheel",
  (ev) => {
    if (!ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    const s0 = viewScale;
    const before = canvas.getBoundingClientRect();
    const logicalX = (ev.clientX - before.left) / s0;
    const logicalY = (ev.clientY - before.top) / s0;
    setScale(s0 * (ev.deltaY < 0 ? 1.1 : 1 / 1.1));
    if (viewScale === s0) return;
    const after = canvas.getBoundingClientRect();
    stageWrap.scrollLeft += after.left + logicalX * viewScale - ev.clientX;
    stageWrap.scrollTop += after.top + logicalY * viewScale - ev.clientY;
  },
  { passive: false },
);

// Keep the minimap's viewport rectangle in sync as the sheet scrolls/pans or the window resizes —
// cheap, since it reuses the cached display list rather than re-running the main paint.
stageWrap.addEventListener("scroll", drawMinimap);
window.addEventListener("resize", drawMinimap);

// Click or drag in the minimap to centre the stage viewport on that point. Maps minimap px →
// logical px → the canvas's (invariant) position in scroll-content coords → a target scroll offset.
let minimapDragging = false;
const minimapNavigate = (ev: PointerEvent): void => {
  if (lastRender === null || minimap.hidden) return;
  const rect = minimap.getBoundingClientRect();
  const miniScale = rect.width / lastRender.logicalWidth;
  const logicalX = (ev.clientX - rect.left) / miniScale;
  const logicalY = (ev.clientY - rect.top) / miniScale;
  const canvasRect = canvas.getBoundingClientRect();
  const wrapRect = stageWrap.getBoundingClientRect();
  const canvasContentLeft = stageWrap.scrollLeft + (canvasRect.left - wrapRect.left);
  const canvasContentTop = stageWrap.scrollTop + (canvasRect.top - wrapRect.top);
  stageWrap.scrollLeft = canvasContentLeft + logicalX * viewScale - stageWrap.clientWidth / 2;
  stageWrap.scrollTop = canvasContentTop + logicalY * viewScale - stageWrap.clientHeight / 2;
};
minimap.addEventListener("pointerdown", (ev) => {
  minimapDragging = true;
  minimap.setPointerCapture(ev.pointerId);
  minimapNavigate(ev);
});
minimap.addEventListener("pointermove", (ev) => {
  if (minimapDragging) minimapNavigate(ev);
});
minimap.addEventListener("pointerup", (ev) => {
  minimapDragging = false;
  minimap.releasePointerCapture(ev.pointerId);
});

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
  // Mirror the located error into the editor as an inline diagnostic (red squiggle + gutter marker +
  // hover message); clears it on any non-error status.
  editor.setError(range, message);
  // The canvas (role="img") needs a text alternative for screen readers — the status line is the
  // baseline; `renderFromText` enriches it with node labels on a successful render.
  canvas.setAttribute("aria-label", level === "error" ? `Diagram error: ${message}` : message);
};

statusEl.addEventListener("click", () => {
  if (errorRange === null) return;
  editor.focus();
  editor.select(errorRange.offset, errorRange.offset + errorRange.length);
});

// Add-node and Relax patch/seed flowchart specifically. Connect and Delete now work for every family
// (each dispatches to its own edge/element syntax). Disabling Add/Relax off flowchart makes that
// explicit rather than a silent dead click.
const flowchartOnly = [addBtn, relaxBtn];
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
    'C4Context\n  Person(alice, "Alice", "A customer")\n  Boundary(b, "Backend") {\n    Container(api, "API", "Handles requests")\n    Container(db, "Database")\n  }\n  Rel(alice, api, "uses")\n  Rel(api, db, "reads/writes")\n',
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
  [
    "state",
    "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Loading : fetch\n  Loading --> Ready : ok\n  Loading --> Idle : error\n  Ready --> [*]\n",
  ],
  [
    "er",
    "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE_ITEM : contains\n  PRODUCT ||--o{ LINE_ITEM : in\n",
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
  // Enrich the canvas's screen-reader text with the actual node labels (capped so a huge diagram
  // doesn't produce an unwieldy string).
  const labels = laid.value.nodes
    .map((n) => n.label)
    .filter((l) => l.length > 0)
    .slice(0, 24);
  const ellipsis = laid.value.nodes.filter((n) => n.label.length > 0).length > labels.length;
  canvas.setAttribute(
    "aria-label",
    `${diagram.kind} diagram: ${plural(laid.value.nodes.length, "node")}, ${plural(laid.value.edges.length, "edge")}${
      labels.length > 0 ? `. Nodes: ${labels.join(", ")}${ellipsis ? ", …" : ""}` : ""
    }`,
  );
  ast = diagram;
  scene = laid.value;
  // Drop sidecar groups whose nodes the edited text removed, so a group can't outlive its diagram and
  // resurrect onto reused ids later. (Overrides are cleared on edit; groups otherwise persist.)
  const prunedGroups = pruneGroups(groups, new Set(laid.value.nodes.map((n) => n.id)));
  if (prunedGroups !== groups) {
    groups = prunedGroups;
    persistOverlay();
    updateGroupButtons();
  }
  // Capture source spans for canvas→text edits — one family is live at a time.
  source = null;
  seqSource = null;
  c4Source = null;
  blockSource = null;
  netSource = null;
  cloudSource = null;
  stateSource = null;
  erSource = null;
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
    case "state": {
      const withSource = parseStateWithSource(text);
      stateSource = isOk(withSource) ? withSource.value.source : null;
      break;
    }
    case "er": {
      const withSource = parseErWithSource(text);
      erSource = isOk(withSource) ? withSource.value.source : null;
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
  persistOverlay();
  paintScene();
};

const scenePoint = (ev: MouseEvent) => {
  const r = canvas.getBoundingClientRect();
  // The bounding rect is the zoomed CSS box; divide by the zoom to recover scene coordinates.
  return point(
    (ev.clientX - r.left) / viewScale - MARGIN,
    (ev.clientY - r.top) / viewScale - MARGIN,
  );
};

canvas.addEventListener("pointerdown", (ev) => {
  if (scene === null) return;
  nudging = false; // a click ends any nudge run, so the next nudge is a new undo entry
  const shown = applyOverrides(scene, overrides);
  const at = scenePoint(ev);
  const hit = hitTest(shown, at);
  const groupHit =
    hit === null
      ? (groupTitleAt(shown, at) ?? groupOutlineAt(shown, at) ?? groupAt(shown, at))
      : null;
  const additive = ev.shiftKey || ev.metaKey;

  // A corner handle of the single selected node starts a resize (takes priority over re-selecting
  // the node under the corner). Shift/⌘ is multi-select intent, so skip resize then.
  const resizeStart = additive ? null : resizeAnchorAt(shown, at);
  if (resizeStart !== null) {
    resize = resizeStart;
    resizeRecorded = false;
    canvas.setPointerCapture(ev.pointerId);
    return;
  }

  if (additive) {
    if (hit !== null) {
      selection = toggle(selection, hit);
      if (hit.kind === "node") {
        selectionOrder = selection.nodes.has(hit.id)
          ? [...selectionOrder.filter((id) => id !== hit.id), hit.id]
          : selectionOrder.filter((id) => id !== hit.id);
      }
    } else if (groupHit !== null) {
      toggleGroupSelection(groupHit);
    } else {
      // Shift-drag on empty canvas → box-select; resolved on release in `pointerup`.
      marquee = { x0: at.x, y0: at.y, x1: at.x, y1: at.y };
      canvas.setPointerCapture(ev.pointerId);
      return;
    }
    paintScene();
    updateGroupButtons();
    return;
  }

  if (groupHit !== null) {
    selectGroup(groupHit);
    paintScene();
    updateGroupButtons();
    return;
  }

  // Plain click on a node that's already part of a multi-selection keeps that selection (so the
  // whole group can be dragged); otherwise the click selects just what's under it.
  const keepMulti =
    hit !== null && hit.kind === "node" && selection.nodes.has(hit.id) && selection.nodes.size > 1;
  if (!keepMulti) {
    selection = selectOnly(hit);
    selectionOrder = hit !== null && hit.kind === "node" ? [hit.id] : [];
  }

  // A plain click on a node drags it; if it's in a group, the whole group moves — unless the group
  // is locked, in which case it's selectable (for Ungroup/Lock) but not draggable. Empty canvas pans.
  if (hit !== null && hit.kind === "node" && !pathLocked(groups, hit.id)) {
    const moveIds = new Set<SceneNodeId>();
    for (const id of selection.nodes) {
      const top = topGroupOfNode(groups, id);
      if (top === null) moveIds.add(id);
      else for (const leaf of leafNodes(groups, top)) moveIds.add(leaf);
    }
    const origin = new Map<SceneNodeId, Point>();
    for (const node of shown.nodes) {
      if (moveIds.has(node.id))
        origin.set(node.id, point(node.bounds.origin.x, node.bounds.origin.y));
    }
    drag = { ids: [...origin.keys()], origin, pointerX: at.x, pointerY: at.y };
    dragRecorded = false;
    canvas.setPointerCapture(ev.pointerId);
  } else if (hit === null) {
    pan = {
      startX: ev.clientX,
      startY: ev.clientY,
      scrollLeft: stageWrap.scrollLeft,
      scrollTop: stageWrap.scrollTop,
    };
    canvas.setPointerCapture(ev.pointerId);
    canvas.style.cursor = "grabbing";
  }
  paintScene();
  updateGroupButtons();
});

canvas.addEventListener("pointermove", (ev) => {
  if (resize !== null) {
    const at = scenePoint(ev);
    if (!resizeRecorded) {
      recordOverlay();
      resizeRecorded = true;
    }
    const rawW = at.x - resize.anchorX;
    const rawH = at.y - resize.anchorY;
    const w = Math.max(RESIZE_MIN_W, Math.abs(rawW));
    const h = Math.max(RESIZE_MIN_H, Math.abs(rawH));
    const cornerX = resize.anchorX + (rawW >= 0 ? w : -w);
    const cornerY = resize.anchorY + (rawH >= 0 ? h : -h);
    overrides = resizeNode(
      overrides,
      resize.id,
      point(Math.min(resize.anchorX, cornerX), Math.min(resize.anchorY, cornerY)),
      size(w, h),
    );
    paintScene();
    return;
  }
  if (marquee !== null) {
    const at = scenePoint(ev);
    marquee = { ...marquee, x1: at.x, y1: at.y };
    paintScene();
    return;
  }
  if (pan !== null) {
    stageWrap.scrollLeft = pan.scrollLeft - (ev.clientX - pan.startX);
    stageWrap.scrollTop = pan.scrollTop - (ev.clientY - pan.startY);
    return;
  }
  if (drag === null) return;
  const at = scenePoint(ev);
  const dx = at.x - drag.pointerX;
  const dy = at.y - drag.pointerY;
  if (!dragRecorded && (dx !== 0 || dy !== 0)) {
    recordOverlay();
    dragRecorded = true;
  }
  for (const id of drag.ids) {
    const o = drag.origin.get(id);
    if (o !== undefined) overrides = moveNode(overrides, id, point(o.x + dx, o.y + dy));
  }
  paintScene();
});

canvas.addEventListener("pointerup", (ev) => {
  if (resize !== null) {
    canvas.releasePointerCapture(ev.pointerId);
    resize = null;
    persistOverlay();
    return;
  }
  if (marquee !== null) {
    canvas.releasePointerCapture(ev.pointerId);
    const box = marquee;
    marquee = null;
    if (scene !== null) {
      const shown = applyOverrides(scene, overrides);
      const minX = Math.min(box.x0, box.x1);
      const maxX = Math.max(box.x0, box.x1);
      const minY = Math.min(box.y0, box.y1);
      const maxY = Math.max(box.y0, box.y1);
      const nodes = new Set(selection.nodes);
      for (const node of shown.nodes) {
        const { origin, size } = node.bounds;
        const touches =
          origin.x < maxX &&
          origin.x + size.width > minX &&
          origin.y < maxY &&
          origin.y + size.height > minY;
        if (touches && !nodes.has(node.id)) {
          nodes.add(node.id);
          selectionOrder = [...selectionOrder, node.id];
        }
      }
      selection = { nodes, edges: selection.edges };
    }
    paintScene();
    updateGroupButtons();
    return;
  }
  if (pan !== null) {
    canvas.releasePointerCapture(ev.pointerId);
    pan = null;
    canvas.style.cursor = "";
  }
  if (drag !== null) {
    canvas.releasePointerCapture(ev.pointerId);
    drag = null;
    persistOverlay();
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

// The screen-space box of the hit element, so the editor sits over it. Edges have no box, so use
// the same routed-polyline label anchor as the renderer.
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
  if (e === undefined || e.waypoints.length < 2) return null;
  const anchor = edgeLabelAnchor(e.waypoints);
  return { x: anchor.x - 40, y: anchor.y - 12, w: 80, h: 24 };
};

// Two-way edit: rename what was double-clicked and write the patch back into the source text.
canvas.addEventListener("dblclick", (ev) => {
  if (scene === null || ast === null) return;
  const shown = applyOverrides(scene, overrides);
  const at = scenePoint(ev);
  const hit = hitTest(shown, at);
  const groupHit =
    hit === null
      ? (groupTitleAt(shown, at) ?? groupOutlineAt(shown, at) ?? groupAt(shown, at))
      : null;

  // Most families edit a `TextSpan` via `patchSpan`; flowchart nodes relabel through the source map.
  const patchAt = (
    span: TextSpan,
  ): { readonly text: string; readonly commit: (n: string) => void } => ({
    text: editor.value().slice(span.start, span.end),
    commit: (next) => {
      editor.setValue(patchSpan(editor.value(), span, next));
      void renderFromText(editor.value());
    },
  });

  let pending: { readonly text: string; readonly commit: (n: string) => void } | null = null;
  let anchor: Anchor | null = null;

  if (groupHit !== null) {
    const box = groupBoxes(shown).find((g) => g.id === groupHit);
    const g = groups.get(groupHit);
    if (box !== undefined && g !== undefined) {
      anchor = { x: box.x + 16, y: box.y, w: Math.max(96, box.w - 32), h: 24 };
      pending = {
        text: g.label,
        commit: (next) => {
          if (next === g.label) return;
          recordOverlay();
          groups = setGroupLabel(groups, groupHit, next);
          persistOverlay();
          paintScene();
        },
      };
    }
  } else if (hit !== null && ast.kind === "flowchart" && source !== null) {
    const src = source;
    if (hit.kind === "edge") {
      const span = src.edges.get(brand<string, "EdgeId">(hit.id));
      if (span !== undefined) pending = patchAt(span);
    } else {
      const nodeId = brand<string, "NodeId">(hit.id);
      pending = {
        text: shown.nodes.find((n) => n.id === hit.id)?.label ?? "",
        commit: (next) => {
          const patched = relabelNode(editor.value(), src, nodeId, next);
          if (!isOk(patched)) {
            console.error("relabel failed:", patched.error.message);
            return;
          }
          editor.setValue(patched.value);
          void renderFromText(patched.value);
        },
      };
    }
  } else if (hit !== null && ast.kind === "c4" && c4Source !== null) {
    const span =
      hit.kind === "node"
        ? c4Source.elements.get(brand<string, "C4ElementId">(hit.id))
        : c4Source.rels.get(brand<string, "C4RelId">(hit.id));
    if (span !== undefined) pending = patchAt(span);
  } else if (hit !== null && ast.kind === "block" && blockSource !== null) {
    const span =
      hit.kind === "node"
        ? blockSource.blocks.get(brand<string, "NodeId">(hit.id))
        : blockSource.edges.get(brand<string, "EdgeId">(hit.id));
    if (span !== undefined) pending = patchAt(span);
  } else if (hit !== null && ast.kind === "network" && netSource !== null) {
    const span =
      hit.kind === "node"
        ? netSource.nodes.get(brand<string, "NodeId">(hit.id))
        : netSource.links.get(brand<string, "EdgeId">(hit.id));
    if (span !== undefined) pending = patchAt(span);
  } else if (hit !== null && ast.kind === "cloud" && cloudSource !== null) {
    const id = brand<string, "NodeId">(hit.id);
    const span =
      hit.kind === "node"
        ? (cloudSource.nodes.get(id) ?? cloudSource.groups.get(id))
        : cloudSource.links.get(brand<string, "EdgeId">(hit.id));
    if (span !== undefined) pending = patchAt(span);
  } else if (hit !== null && ast.kind === "sequence" && seqSource !== null) {
    const span =
      hit.kind === "node"
        ? seqSource.actors.get(brand<string, "ActorId">(hit.id))
        : seqSource.messages.get(brand<string, "MessageId">(hit.id));
    if (span !== undefined) pending = patchAt(span);
  } else if (hit !== null && ast.kind === "state" && stateSource !== null) {
    const span =
      hit.kind === "node"
        ? stateSource.states.get(brand<string, "StateId">(hit.id))
        : stateSource.transitions.get(brand<string, "StateTransitionId">(hit.id));
    if (span !== undefined) pending = patchAt(span);
  } else if (hit !== null && ast.kind === "er" && erSource !== null) {
    const span =
      hit.kind === "node"
        ? erSource.entities.get(brand<string, "ErEntityId">(hit.id))
        : erSource.relationships.get(brand<string, "ErRelId">(hit.id));
    if (span !== undefined) pending = patchAt(span);
  }

  if (pending === null) return;
  anchor = anchor ?? (hit === null ? null : anchorFor(shown, hit));
  if (anchor === null) return;
  openInlineEditor(anchor, pending.text, pending.commit);
});

// Add node: append a fresh rect node to the flowchart text (flowchart only for now).
addBtn.addEventListener("click", () => {
  if (ast === null || ast.kind !== "flowchart") return;
  const used = new Set<string>(ast.nodes.map((n) => n.id));
  let n = 1;
  while (used.has(`n${n}`)) n++;
  editor.setValue(addNode(editor.value(), brand<string, "NodeId">(`n${n}`), `node ${n}`, "rect"));
  void renderFromText(editor.value());
});

// Connect: link the first two shift-selected nodes (in click order), in each family's own edge
// syntax — directed `-->` (flowchart/block), undirected `--` (network/cloud), `Rel(a,b,"")` (C4),
// or a `A->>B: message` (sequence).
connectBtn.addEventListener("click", () => {
  if (ast === null || selectionOrder.length < 2) return;
  const [first, second] = selectionOrder;
  if (first === undefined || second === undefined) return;
  editor.setValue(appendEdge(ast.kind, editor.value(), first, second));
  void renderFromText(editor.value());
});

const appendEdge = (
  kind: DiagramAst["kind"],
  text: string,
  first: SceneNodeId,
  second: SceneNodeId,
): string => {
  switch (kind) {
    case "network":
    case "cloud":
      return connectUndirected(
        text,
        brand<string, "NodeId">(first),
        brand<string, "NodeId">(second),
      );
    case "c4":
      return connectC4(
        text,
        brand<string, "C4ElementId">(first),
        brand<string, "C4ElementId">(second),
      );
    case "sequence":
      return connectMessage(
        text,
        brand<string, "ActorId">(first),
        brand<string, "ActorId">(second),
      );
    case "er":
      return connectEr(
        text,
        brand<string, "ErEntityId">(first),
        brand<string, "ErEntityId">(second),
      );
    default:
      return connect(
        text,
        brand<string, "NodeId">(first),
        brand<string, "NodeId">(second),
        "arrow",
      );
  }
};

// Remove a node/element/actor in the family's own syntax.
const removeNode = (kind: DiagramAst["kind"], text: string, id: SceneNodeId): string => {
  switch (kind) {
    case "c4":
      return deleteC4(text, brand<string, "C4ElementId">(id));
    case "sequence":
      return deleteActor(text, brand<string, "ActorId">(id));
    default:
      return deleteNode(text, brand<string, "NodeId">(id));
  }
};

// Remove an edge in the family's own syntax.
const removeEdge = (kind: DiagramAst["kind"], text: string, from: string, to: string): string => {
  switch (kind) {
    case "c4":
      return deleteC4Rel(
        text,
        brand<string, "C4ElementId">(from),
        brand<string, "C4ElementId">(to),
      );
    case "sequence":
      return deleteMessage(text, brand<string, "ActorId">(from), brand<string, "ActorId">(to));
    case "er":
      return deleteErRel(text, brand<string, "ErEntityId">(from), brand<string, "ErEntityId">(to));
    default:
      return deleteEdge(text, brand<string, "NodeId">(from), brand<string, "NodeId">(to));
  }
};

// Delete key removes the selected nodes (and their edges) from the text, in the active family's
// syntax. Guarded on the editor not being focused so it never hijacks a Backspace while editing.
window.addEventListener("keydown", (ev) => {
  if (ev.key !== "Delete" && ev.key !== "Backspace") return;
  if (editor.hasFocus()) return;
  if (ast === null) return;
  if (selectionOrder.length === 0 && selection.edges.size === 0) return;
  ev.preventDefault();
  const kind = ast.kind;
  let text = editor.value();
  for (const id of selectionOrder) text = removeNode(kind, text, id);
  if (scene !== null) {
    for (const edgeId of selection.edges) {
      const edge = scene.edges.find((e) => e.id === edgeId);
      if (edge !== undefined) text = removeEdge(kind, text, edge.from, edge.to);
    }
  }
  selection = emptySelection;
  selectionOrder = [];
  editor.setValue(text);
  void renderFromText(text);
});

// Undo/redo for canvas (overlay) actions — drag, group/ungroup/lock, group label, regenerate. Only
// when the editor isn't focused, so CodeMirror keeps ⌘Z for the source text; the two histories don't
// fight (text in CodeMirror, layout/groups here).
window.addEventListener("keydown", (ev) => {
  if (editor.hasFocus()) return;
  if (!ev.metaKey && !ev.ctrlKey) return;
  const key = ev.key.toLowerCase();
  if (key === "z" && !ev.shiftKey) {
    ev.preventDefault();
    undoOverlay();
  } else if (key === "y" || (key === "z" && ev.shiftKey)) {
    ev.preventDefault();
    redoOverlay();
  } else if (key === "a") {
    // Select every node (⌘A in the canvas; CodeMirror keeps it for the text when it's focused).
    if (scene === null) return;
    ev.preventDefault();
    const ids = scene.nodes.map((n) => n.id);
    selection = { nodes: new Set(ids), edges: new Set() };
    selectionOrder = ids;
    nudging = false;
    paintScene();
    updateGroupButtons();
  }
});

// Every leaf node the selection can move: a selected loose node, or all leaves of a selected node's
// group — minus anything under a locked group (which is selectable but not movable, like drag).
const movableSelectionLeaves = (): SceneNodeId[] => {
  const ids = new Set<SceneNodeId>();
  for (const id of selection.nodes) {
    if (pathLocked(groups, id)) continue;
    const top = topGroupOfNode(groups, id);
    if (top === null) ids.add(id);
    else for (const leaf of leafNodes(groups, top)) ids.add(leaf);
  }
  return [...ids];
};

// Arrow-key nudge: fine positioning to complement coarse drag (Shift = a bigger step). A run of
// nudges shares one undo entry. Escape clears the selection.
const nudgeSelection = (dx: number, dy: number): void => {
  if (scene === null) return;
  const ids = movableSelectionLeaves();
  if (ids.length === 0) return;
  const shown = applyOverrides(scene, overrides);
  const origin = new Map(shown.nodes.map((n) => [n.id, n.bounds.origin]));
  if (!nudging) {
    recordOverlay();
    nudging = true;
  }
  for (const id of ids) {
    const at = origin.get(id);
    if (at !== undefined) overrides = moveNode(overrides, id, point(at.x + dx, at.y + dy));
  }
  persistOverlay();
  paintScene();
};

window.addEventListener("keydown", (ev) => {
  if (editor.hasFocus()) return;
  if (ev.key === "Escape") {
    if (selection.nodes.size === 0 && selection.edges.size === 0) return;
    selection = emptySelection;
    selectionOrder = [];
    nudging = false;
    paintScene();
    updateGroupButtons();
    return;
  }
  if (ev.metaKey || ev.ctrlKey) return; // leave ⌘-combos to the other handlers / the browser
  const step = ev.shiftKey ? 10 : 1;
  switch (ev.key) {
    case "ArrowLeft":
      ev.preventDefault();
      nudgeSelection(-step, 0);
      break;
    case "ArrowRight":
      ev.preventDefault();
      nudgeSelection(step, 0);
      break;
    case "ArrowUp":
      ev.preventDefault();
      nudgeSelection(0, -step);
      break;
    case "ArrowDown":
      ev.preventDefault();
      nudgeSelection(0, step);
      break;
  }
});

relaxBtn.addEventListener("click", () => {
  void relax();
});
// Regenerate: drop manual positions and lay out cleanly from the text. Undoable — so a regenerate
// that throws away a hand-tuned layout can be taken back (the groups are kept either way).
regenBtn.addEventListener("click", () => {
  if (overrides.size > 0) recordOverlay();
  overrides = new Map();
  persistOverlay();
  void renderFromText(editor.value());
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
  clearOverlayHistory(); // a different diagram — the old positions/history no longer apply
  persistOverlay();
  editor.setValue(text);
  void renderFromText(text);
});

// Sketch toggle: hand-drawn (wobbly outlines + handwriting font) vs. crisp. Re-lays out, because the
// handwriting font is wider than the base — nodes must resize to keep labels inside their boxes.
sketchBtn.addEventListener("click", () => {
  sketch = !sketch;
  sketchBtn.textContent = sketch ? "Crisp" : "Sketch";
  void renderFromText(editor.value());
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
  void renderFromText(editor.value());
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
  editor.insertAtCursor(` icon "${packId}/${name}"`);
  overrides = new Map();
  persistOverlay();
  void renderFromText(editor.value());
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

// The themed surface colour lives only in CSS (the canvas pixels are transparent where nothing is
// drawn), so an export composites onto a background-filled offscreen canvas at device resolution —
// otherwise the output would have a transparent ground.
const compositeCanvas = (): HTMLCanvasElement | null => {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const octx = out.getContext("2d");
  if (octx === null) return null;
  octx.fillStyle = activeTheme().background;
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(canvas, 0, 0);
  return out;
};

const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

exportBtn.addEventListener("click", () => {
  const out = compositeCanvas();
  if (out === null) {
    console.error("export failed: 2d context unavailable");
    setStatus("error", "PNG export failed — no 2D context");
    return;
  }
  out.toBlob((blob) => {
    if (blob === null) {
      console.error("export failed: toBlob returned null");
      setStatus("error", "PNG export failed");
      return;
    }
    downloadBlob(blob, "mermollusc.png");
    setStatus("ok", "exported mermollusc.png");
  }, "image/png");
});

// PDF export, dependency-free: wrap the composited canvas (as a JPEG) in a minimal one-page PDF —
// a DCTDecode image XObject placed to fill a MediaBox sized in CSS px (so the embedded device-res
// JPEG renders at high DPI). Byte offsets are tracked as the body is assembled, for the xref table.
const bytesOf = (binary: string): Uint8Array => {
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
};

const buildImagePdf = (
  jpeg: Uint8Array,
  pxWidth: number,
  pxHeight: number,
  ptWidth: number,
  ptHeight: number,
): Blob => {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let len = 0;
  const pushBytes = (bytes: Uint8Array): void => {
    parts.push(bytes);
    len += bytes.length;
  };
  const pushText = (text: string): void => pushBytes(enc.encode(text));
  const startObject = (header: string): void => {
    offsets.push(len);
    pushText(header);
  };

  pushText("%PDF-1.4\n");
  startObject("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  startObject("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  startObject(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptWidth} ${ptHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );
  startObject(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pxWidth} /Height ${pxHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  pushBytes(jpeg);
  pushText("\nendstream\nendobj\n");
  const content = `q ${ptWidth} 0 0 ${ptHeight} 0 0 cm /Im0 Do Q`;
  startObject(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);

  const xrefAt = len;
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  pushText(xref);

  const pdf = new Uint8Array(len);
  let at = 0;
  for (const part of parts) {
    pdf.set(part, at);
    at += part.length;
  }
  return new Blob([pdf], { type: "application/pdf" });
};

exportPdfBtn.addEventListener("click", () => {
  const out = compositeCanvas();
  if (out === null) {
    console.error("export failed: 2d context unavailable");
    setStatus("error", "PDF export failed — no 2D context");
    return;
  }
  const dataUrl = out.toDataURL("image/jpeg", 0.92);
  const jpeg = bytesOf(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)));
  const dpr = window.devicePixelRatio || 1;
  const pdf = buildImagePdf(
    jpeg,
    out.width,
    out.height,
    Math.round(out.width / dpr),
    Math.round(out.height / dpr),
  );
  downloadBlob(pdf, "mermollusc.pdf");
  setStatus("ok", "exported mermollusc.pdf");
});

// SVG export, true vector: serialise the same display list the canvas paints, via the renderer's
// `toSvg` backend. Icon glyphs are embedded as `<image>` hrefs (the icon SVG as a data URL),
// resolved here because the renderer can't depend on `@m/icons`.
exportSvgBtn.addEventListener("click", () => {
  if (scene === null) {
    setStatus("error", "nothing to export yet");
    return;
  }
  const shown = applyOverrides(scene, overrides);
  const icons = new Map<string, string>();
  for (const node of shown.nodes) {
    if (node.icon === null) continue;
    const key = `${node.icon.pack}/${node.icon.name}`;
    if (icons.has(key)) continue;
    const resolved = findIcon(registry, node.icon.pack, node.icon.name);
    if (isOk(resolved)) icons.set(key, svgDataUrl(resolved.value));
    else console.error("icon resolve failed:", resolved.error.message);
  }
  const svg = toSvg(toDisplayList(shown), {
    width: Math.ceil(shown.extent.size.width) + MARGIN * 2,
    height: Math.ceil(shown.extent.size.height) + MARGIN * 2,
    margin: MARGIN,
    theme: activeTheme(),
    icons,
  });
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "mermollusc.svg");
  setStatus("ok", "exported mermollusc.svg");
});

// Share: encode the current source in the URL hash (so the link reproduces the diagram) and copy it
// to the clipboard. The hash is reflected in the address bar either way; clipboard is best-effort
// (it can be denied) and its outcome is surfaced to the status bar, never silently dropped.
const shareUrl = (): string =>
  `${location.origin}${location.pathname}#src=${encodeURIComponent(editor.value())}`;

shareBtn.addEventListener("click", () => {
  const url = shareUrl();
  history.replaceState(null, "", url);
  const clip = navigator.clipboard;
  if (clip === undefined) {
    setStatus("ok", "shareable link is in the address bar");
    return;
  }
  void clip.writeText(url).then(
    () => setStatus("ok", "shareable link copied to clipboard"),
    () => setStatus("ok", "shareable link is in the address bar"),
  );
});

// A `#src=…` hash (a shared link) wins over the persisted source, which wins over the sample.
const hashSource = (): string | null => {
  const prefix = "#src=";
  if (!location.hash.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(location.hash.slice(prefix.length));
  } catch (e) {
    console.error("ignoring malformed #src in URL:", e instanceof Error ? e.message : String(e));
    return null;
  }
};

const fromHash = hashSource();
const initialSource = fromHash ?? localStorage.getItem(SOURCE_KEY) ?? SAMPLE;
// Restore the persisted overlay only for the persisted source — a share-link source is a different
// diagram whose node ids wouldn't match. A corrupt/invalid overlay is logged loudly and ignored.
if (fromHash === null) {
  const rawOverlay = localStorage.getItem(OVERLAY_KEY);
  if (rawOverlay !== null) {
    try {
      const decoded = decodeOverlay(JSON.parse(rawOverlay));
      if (isOk(decoded)) {
        overrides = decoded.value.overrides;
        groups = decoded.value.groups;
      } else {
        console.error("ignoring invalid overlay:", decoded.error.issues.join("; "));
      }
    } catch (e) {
      console.error("ignoring corrupt overlay:", e instanceof Error ? e.message : String(e));
    }
  }
}
// Editing the text by hand drops manual layout (positions no longer match) and re-renders. The
// editor is created here, last, because its change callback closes over `renderFromText`.
editor = createEditor(editorMount, initialSource, (text) => {
  overrides = new Map();
  clearOverlayHistory(); // the text (and thus the diagram) changed — old positions/history are stale
  persistOverlay();
  void renderFromText(text);
});
void renderFromText(initialSource);
