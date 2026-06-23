import {
  addNode,
  applyOverrides,
  connect,
  connectC4,
  connectClass,
  connectEr,
  connectMessage,
  connectRequirement,
  connectUndirected,
  decodeOverlay,
  deleteActor,
  deleteC4,
  deleteC4Rel,
  deleteClassEntity,
  deleteClassRel,
  deleteEdge,
  deleteErEntity,
  deleteErRel,
  deleteGanttTask,
  deleteMessage,
  deleteNode,
  deleteRequirementEntity,
  deleteRequirementRel,
  deleteStateEntity,
  emptySelection,
  hitTest,
  leafNodes,
  patchSpan,
  pathLocked,
  relabelNode,
  reshapeNode,
  selectOnly,
  serializeOverlay,
  snapAxis,
  snapCandidates,
  toggle,
  topGroupOfNode,
  validateLabel,
} from "@m/builder";
import type { HitTarget, LabelContext, Selection } from "@m/builder";
import type {
  BlockSource,
  C4Source,
  ClassSource,
  CloudSource,
  ErSource,
  ReqSource,
  DiagramAst,
  FlowDirection,
  GitGraphSource,
  TimelineSource,
  MindmapSource,
  GanttSource,
  GroupId,
  GroupMember,
  LayoutOverrides,
  NetworkSource,
  NodeId,
  NodeShape,
  OverlayDoc,
  Scene,
  SceneNodeId,
  SceneEdgeId,
  SequenceSource,
  SourceMap,
  StateSource,
  TextSpan,
} from "@m/contracts";
import { decodePack, defaultRegistry, findIcon, registerPack } from "@m/icons";
import { layout, layoutDiagram } from "@m/layout";
import { parseDiagramWithSource } from "@m/parser";
import {
  darkTheme,
  defaultTheme,
  edgeLabelAnchor,
  paint,
  toDisplayList,
  toDot,
  toSvg,
} from "@m/renderer";
import type { Theme } from "@m/renderer";
import {
  assertNever,
  brand,
  consoleLogger,
  isOk,
  messageOf,
  point,
  type Point,
  type ScreenCoord,
  screenCoord,
  screenPoint,
  type ScreenPoint,
  size,
} from "@m/std";
import {
  connectTransport,
  createCollabSession,
  reconnectingWebSocketTransport,
  type CollabSession,
  type ReconnectStatus,
} from "@m/collab";
import { createEditor, type Editor } from "./editor.js";
import { EXAMPLES, SAMPLE } from "./examples.js";
import { createLocalDocument } from "./document-model.js";
import { buildImagePdf, bytesOf } from "./pdf.js";
import { applyPlatformModifiers } from "./platform.js";
import { rasterizeIcon, svgDataUrl } from "./raster.js";
import { buildSyntaxReference } from "./syntax-reference.js";

declare global {
  interface Window {
    // e2e hook (collab mode only): the number of overlay position overrides currently in the document,
    // so a spec can assert a remote peer's drag landed in this tab.
    __collabOverrideCount?: () => number;
    // e2e hook (collab mode only): apply a server-granted role, to exercise the read-only viewer UI.
    __collabSetRole?: (role: string) => void;
    // e2e hook: whether a drag-alignment guide is currently active (a node is snapped to another).
    __snapActive?: () => boolean;
    // e2e hook: the armed canvas tool ("select" | "hand" | "connect" | "place").
    __activeTool?: () => string;
  }
}

const MARGIN = 24;

const editorMount = document.querySelector<HTMLDivElement>("#editor");
const canvas = document.querySelector<HTMLCanvasElement>("#stage");
const stageEmpty = document.querySelector<HTMLElement>("#stage-empty");
const stageHud = document.querySelector<HTMLElement>("#stage-hud");
const taskHudText = document.querySelector<HTMLElement>("#task-hud-text");
const taskStatusText = document.querySelector<HTMLElement>("#task-status-text");
if (
  editorMount === null ||
  canvas === null ||
  stageEmpty === null ||
  stageHud === null ||
  taskHudText === null ||
  taskStatusText === null
) {
  throw new Error("playground: missing editor, stage, or task feedback elements");
}

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
const diagramNav = document.querySelector<HTMLUListElement>("#diagram-nav");
const diagramLive = document.querySelector<HTMLElement>("#diagram-live");
const inlineEl = document.querySelector<HTMLInputElement>("#inline-edit");
const iconsToggle = document.querySelector<HTMLButtonElement>("#icons-toggle");
const iconsClose = document.querySelector<HTMLButtonElement>("#icons-close");
const iconBackdrop = document.querySelector<HTMLElement>("#icon-backdrop");
const iconPicker = document.querySelector<HTMLElement>("#icon-picker");
const iconFilter = document.querySelector<HTMLInputElement>("#icon-filter");
const iconGrid = document.querySelector<HTMLElement>("#icon-grid");
const copyBtn = document.querySelector<HTMLButtonElement>("#copy-png");
const exportBtn = document.querySelector<HTMLButtonElement>("#export-png");
const exportPdfBtn = document.querySelector<HTMLButtonElement>("#export-pdf");
const exportSvgBtn = document.querySelector<HTMLButtonElement>("#export-svg");
const exportDotBtn = document.querySelector<HTMLButtonElement>("#export-dot");
const shareBtn = document.querySelector<HTMLButtonElement>("#share-link");
const helpToggle = document.querySelector<HTMLButtonElement>("#help-toggle");
const resetCacheBtn = document.querySelector<HTMLButtonElement>("#reset-cache");
const helpClose = document.querySelector<HTMLButtonElement>("#help-close");
const helpOverlay = document.querySelector<HTMLElement>("#help-overlay");
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
const toolPalette = document.querySelector<HTMLElement>("#tool-palette");
const toolSelectBtn = document.querySelector<HTMLButtonElement>("#tool-select");
const toolHandBtn = document.querySelector<HTMLButtonElement>("#tool-hand");
const toolConnectBtn = document.querySelector<HTMLButtonElement>("#tool-connect");
const toolPlaceBtn = document.querySelector<HTMLButtonElement>("#tool-place");
const stageCol = document.querySelector<HTMLElement>(".stage-col");
const contextBar = document.querySelector<HTMLElement>("#context-bar");
const ctxRelabelBtn = document.querySelector<HTMLButtonElement>("#ctx-relabel");
const ctxShapeBtn = document.querySelector<HTMLButtonElement>("#ctx-shape");
const ctxConnectBtn = document.querySelector<HTMLButtonElement>("#ctx-connect");
const ctxDuplicateBtn = document.querySelector<HTMLButtonElement>("#ctx-duplicate");
const ctxGroupBtn = document.querySelector<HTMLButtonElement>("#ctx-group");
const ctxUngroupBtn = document.querySelector<HTMLButtonElement>("#ctx-ungroup");
const ctxLockBtn = document.querySelector<HTMLButtonElement>("#ctx-lock");
const ctxArrangeBtn = document.querySelector<HTMLButtonElement>("#ctx-arrange");
const ctxDeleteBtn = document.querySelector<HTMLButtonElement>("#ctx-delete");
if (
  toolPalette === null ||
  toolSelectBtn === null ||
  toolHandBtn === null ||
  toolConnectBtn === null ||
  toolPlaceBtn === null ||
  stageCol === null ||
  contextBar === null ||
  ctxRelabelBtn === null ||
  ctxShapeBtn === null ||
  ctxConnectBtn === null ||
  ctxDuplicateBtn === null ||
  ctxGroupBtn === null ||
  ctxUngroupBtn === null ||
  ctxLockBtn === null ||
  ctxArrangeBtn === null ||
  ctxDeleteBtn === null ||
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
  diagramNav === null ||
  diagramLive === null ||
  inlineEl === null ||
  iconsToggle === null ||
  iconsClose === null ||
  iconBackdrop === null ||
  iconPicker === null ||
  iconFilter === null ||
  iconGrid === null ||
  copyBtn === null ||
  exportBtn === null ||
  exportPdfBtn === null ||
  exportSvgBtn === null ||
  exportDotBtn === null ||
  shareBtn === null ||
  helpToggle === null ||
  resetCacheBtn === null ||
  helpClose === null ||
  helpOverlay === null
) {
  throw new Error("playground: missing toolbar controls");
}
const miniCtx = minimap.getContext("2d");
if (miniCtx === null) throw new Error("playground: minimap 2d context unavailable");

let ast: DiagramAst | null = null;
let scene: Scene | null = null;
let currentRenderValid = false;
let source: SourceMap | null = null;
let seqSource: SequenceSource | null = null;
let c4Source: C4Source | null = null;
let blockSource: BlockSource | null = null;
let netSource: NetworkSource | null = null;
let cloudSource: CloudSource | null = null;
let stateSource: StateSource | null = null;
let erSource: ErSource | null = null;
let classSource: ClassSource | null = null;
let reqSource: ReqSource | null = null;
let gitSource: GitGraphSource | null = null;
let timelineSource: TimelineSource | null = null;
let mindmapSource: MindmapSource | null = null;
let ganttSource: GanttSource | null = null;
// The current diagram's flow direction, when it has one (flowchart / imported DOT); carried into DOT export.
let lastDirection: FlowDirection | null = null;
// On-screen zoom of the diagram sheet. 1 = the canvas is drawn at scene scale (the identity the
// hit-test math and e2e specs assume); only the zoom controls / ctrl-wheel change it.
let viewScale = 1;
const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
// True when this client's collaborative role is `viewer` — the editor and canvas become read-only (the
// server is the real boundary; this is the matching UX). Always false in single-user / non-collab.
let viewerMode = false;
// The armed canvas tool (whiteboard-style). `select` is byte-for-byte the historical behavior; the
// other tools only *bias* the existing gesture branches (modifiers like ⌥-connect / ⇧-marquee /
// ⌘-wheel stay always-on accelerators in every tool). `spaceHeld` is a transient hand override (hold
// Space to pan); `lastPointer` lets `setTool` recompute the cursor without waiting for a pointer move.
type Tool = "select" | "hand" | "connect" | "place";
let activeTool: Tool = "select";
let spaceHeld = false;
let lastPointer: PointerEvent | null = null;
// The tool actually in effect: a held Space (or a viewer, who can only look/pan) outranks the armed tool.
const effectiveTool = (): Tool => {
  if (viewerMode) return spaceHeld ? "hand" : "select";
  if (spaceHeld) return "hand";
  return activeTool;
};
window.__activeTool = () => activeTool;
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
// Alignment snapping for a single-node drag or a corner-handle resize: the candidate guide lines (other
// nodes' left/centre/right xs and top/middle/bottom ys) captured at the gesture start + the dragged
// node's size (`w`/`h`, unused by resize, which snaps only the moving corner), and the currently snapped
// lines to draw (`vx` vertical, `hy` horizontal). Null `snapTargets` = no snapping (multi-drag).
let snapTargets: {
  readonly xs: readonly number[];
  readonly ys: readonly number[];
  readonly w: number;
  readonly h: number;
} | null = null;
let snapGuides: { vx: number | null; hy: number | null } = { vx: null, hy: null };
// `snapAxis` / `snapCandidates` / `SNAP_T` are the pure alignment geometry, homed in `@m/builder`'s
// core (tested there); the stateful guide tracking below stays in the shell.
window.__snapActive = () => snapGuides.vx !== null || snapGuides.hy !== null;
// Background-drag panning of the (scrollable) stage: the pointer position and scroll offsets at the
// moment the empty canvas was grabbed.
// `startX`/`startY` are the *screen* (viewport-px) pointer position when the empty canvas was grabbed;
// `scrollLeft`/`scrollTop` the stage scroll then. Screen-typed so they can't be mistaken for scene coords.
let pan: {
  readonly startX: ScreenCoord;
  readonly startY: ScreenCoord;
  readonly scrollLeft: number;
  readonly scrollTop: number;
} | null = null;
// A shift-drag box-select on the empty canvas: the start corner and the current corner, in scene
// coordinates. On release, every node the box touches is added to the selection.
let marquee: { readonly x0: number; readonly y0: number; x1: number; y1: number } | null = null;
// An ⌥-drag from a node draws a rubber-band toward the cursor; releasing over another node creates an
// edge between them (in the family's own syntax). `from`/`fromX`/`fromY` are the source node + its
// centre, `x`/`y` the live cursor, all in scene coordinates.
let connectDrag: {
  readonly from: SceneNodeId;
  readonly fromX: number;
  readonly fromY: number;
  x: number;
  y: number;
} | null = null;
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

// The overlay document owns overrides + groups + their undo/redo history. It starts empty; the
// persisted overlay (when the source isn't a share-link) is decoded and loaded via `doc.replace`
// below, before the first render. `save` is the only IO it touches — a localStorage write today,
// the seam where a collaborative backend would broadcast instead.
//
// `?collab` swaps the local document for the Yjs-backed `OverlayDoc` from
// `@m/collab` — same interface, so every call site is unchanged. When the URL also reaches a relay
// (the dev WebSocket server), two tabs on the same `?collab&room=…` edit the overlay live. In collab
// mode the shared Y.Doc is the source of truth, so the session is kept (to wire the transport +
// remote-repaint at the end of this file) and the persisted localStorage overlay is *not* restored
// (it would clobber the room). Default off, and disabled entirely in the backend-free Pages demo, so
// the public demo never attempts to open a relay socket.
const saveOverlay = (serialized: string): void => localStorage.setItem(OVERLAY_KEY, serialized);
const collabRequested = new URLSearchParams(location.search).has("collab");
const backendFreeDemo = import.meta.env.VITE_BACKEND_FREE_DEMO === "1";
const useCollab = collabRequested && !backendFreeDemo;
let collabSession: CollabSession | null = null;
let doc: OverlayDoc;
if (useCollab) {
  collabSession = createCollabSession({
    initialOverrides: new Map(),
    initialGroups: new Map(),
    initialSource: "",
    save: saveOverlay,
    logger: consoleLogger,
  });
  doc = collabSession.overlay;
} else {
  doc = createLocalDocument({
    initialOverrides: new Map(),
    initialGroups: new Map(),
    save: saveOverlay,
  });
}

// Undo/redo for sidecar overlay actions (drag, group/ungroup/lock, group label, regenerate) — the
// canvas counterpart to CodeMirror's text history (which owns the source text). The history itself
// lives in the document model; these wrappers add the canvas side effects (repaint + button sync)
// the doc deliberately stays out of, so undo/redo of a state the doc restored shows on screen.
const applyRestored = (): void => {
  nudging = false; // a fresh nudge run after undo/redo starts its own undo entry
  doc.persist();
  paintScene();
  updateGroupButtons();
};
const undoOverlay = (): void => {
  if (doc.undo()) {
    applyRestored();
    setStatusAndAnnounce("ok", "layout undone");
  }
};
const redoOverlay = (): void => {
  if (doc.redo()) {
    applyRestored();
    setStatusAndAnnounce("ok", "layout redone");
  }
};

// Theme: an explicit choice (localStorage) wins; otherwise follow the OS `prefers-color-scheme`.
const THEME_KEY = "mermollusc-theme";
const prefersDark = (): boolean =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
const forcedColorsQuery = window.matchMedia?.("(forced-colors: active)") ?? null;
const forcedColors = (): boolean => forcedColorsQuery?.matches ?? false;
const storedTheme = localStorage.getItem(THEME_KEY);
let theme: Theme =
  storedTheme === "dark" || (storedTheme === null && prefersDark()) ? darkTheme : defaultTheme;
// Sketch mode is orthogonal to light/dark — composed onto the active theme at paint time.
let sketch = false;
const SKETCH_FONT = '15px "Comic Sans MS", "Patrick Hand", cursive';
const forcedTheme = (font: string): Theme => ({
  background: "Canvas",
  nodeFill: "Canvas",
  stroke: "CanvasText",
  text: "CanvasText",
  font,
  sketch: false,
});
const activeTheme = (): Theme => {
  const font = sketch ? SKETCH_FONT : theme.font;
  if (forcedColors()) return forcedTheme(font);
  return sketch ? { ...theme, sketch: true, font } : theme;
};

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

// Resolve every icon referenced by the scene to a drawable image before painting, so the painter
// never has to deal with a half-loaded glyph. A resolve failure, or a decode failure (a pack whose
// markup is invalid SVG — `img.decode()` rejects), is logged loudly and the icon is skipped: the
// painter draws the box + label without the glyph, and the diagram still renders rather than the whole
// frame failing on an unhandled rejection. Returns the keys that failed so the caller can surface them.
const ensureIcons = async (s: Scene): Promise<readonly string[]> => {
  const failed: string[] = [];
  for (const node of s.nodes) {
    if (node.icon === null) continue;
    const key = `${node.icon.pack}/${node.icon.name}`;
    if (iconImages.has(key)) continue;
    const resolved = findIcon(registry, node.icon.pack, node.icon.name);
    if (!isOk(resolved)) {
      console.error("icon resolve failed:", resolved.error.message);
      failed.push(key);
      continue;
    }
    try {
      iconImages.set(key, await rasterizeIcon(resolved.value));
    } catch (e) {
      console.error("icon decode failed:", key, messageOf(e));
      failed.push(key);
    }
  }
  return failed;
};

// Memoise `applyOverrides` across a frame: a repaint that didn't change the overlay (a theme toggle,
// a selection change, a marquee) reuses the last result instead of rebuilding the whole scene. Any
// overlay mutation returns a fresh overrides map (a new reference), so the cache invalidates on its
// own — a drag, which legitimately changes the overlay each frame, still recomputes.
let shownCacheScene: Scene | null = null;
let shownCacheOverrides: LayoutOverrides | null = null;
let shownCacheResult: Scene | null = null;
const shownScene = (base: Scene): Scene => {
  const ov = doc.overrides();
  if (shownCacheResult !== null && shownCacheScene === base && shownCacheOverrides === ov) {
    return shownCacheResult;
  }
  const shown = applyOverrides(base, ov);
  shownCacheScene = base;
  shownCacheOverrides = ov;
  shownCacheResult = shown;
  return shown;
};

// True while a pointer gesture (drag/resize/marquee/connect/pan) is in flight — used to defer the
// minimap cache rebuild and to hide the selection context bar mid-gesture.
const isInteracting = (): boolean =>
  drag !== null || resize !== null || marquee !== null || connectDrag !== null || pan !== null;

const paintScene = (): void => {
  if (scene === null) return;
  const shown = shownScene(scene);
  // Logical sheet size in scene px (+ margin); the on-screen box is this scaled by the zoom.
  const logicalWidth = Math.ceil(shown.extent.size.width) + MARGIN * 2;
  const logicalHeight = Math.ceil(shown.extent.size.height) + MARGIN * 2;
  const cssWidth = logicalWidth * viewScale;
  const cssHeight = logicalHeight * viewScale;
  // Back the canvas at device resolution but draw in CSS pixels, so it stays crisp on HiDPI
  // displays. The CSS size pins the on-screen box; the dpr·zoom scale fills the larger backing store
  // and keeps the diagram crisp at any zoom (we re-render, not bitmap-scale).
  const dpr = window.devicePixelRatio || 1;
  // Only (re)size the backing store when it actually changed: assigning `canvas.width` reallocates and
  // clears the canvas, so doing it every frame — including each drag frame where the size is unchanged
  // — is wasted work. `clearRect` below clears regardless, so skipping the resize is safe.
  const backingW = Math.round(logicalWidth * dpr * viewScale);
  const backingH = Math.round(logicalHeight * dpr * viewScale);
  if (canvas.width !== backingW || canvas.height !== backingH) {
    canvas.width = backingW;
    canvas.height = backingH;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
  }
  const active = activeTheme();
  canvas.style.backgroundColor = active.background;
  // Build the display list once and reuse it for both the main canvas and the minimap overview.
  const cmds = toDisplayList(shown);
  ctx.setTransform(dpr * viewScale, 0, 0, dpr * viewScale, 0, 0);
  ctx.clearRect(0, 0, logicalWidth, logicalHeight);
  ctx.save();
  // Offset by the extent origin so a node dragged to negative coordinates maps into the canvas (the
  // origin is (0,0) unless something was dragged past the top-left, so this is normally just MARGIN).
  ctx.translate(MARGIN - shown.extent.origin.x, MARGIN - shown.extent.origin.y);
  drawGroupOutlines(shown);
  paint(ctx, cmds, iconImages, active);
  const overlayLine = Math.max(1, 2 / viewScale);
  const overlayHalo = Math.max(3, 8 / viewScale);
  const overlayDash = Math.max(2, 5 / viewScale);
  const handleSize = Math.max(3, 4 / viewScale);
  const selectedStroke = forcedColors() ? "Highlight" : activeTheme().text;
  const selectedFill = forcedColors() ? "Highlight" : "#2563eb";
  for (const edge of shown.edges) {
    if (!selection.edges.has(edge.id)) continue;
    const [head, ...tail] = edge.waypoints;
    if (head === undefined) continue;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = forcedColors() ? "Highlight" : "rgba(37,99,235,0.28)";
    ctx.lineWidth = overlayHalo;
    ctx.beginPath();
    ctx.moveTo(head.x, head.y);
    for (const p of tail) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.strokeStyle = selectedStroke;
    ctx.lineWidth = overlayLine;
    ctx.setLineDash([overlayDash, overlayDash]);
    ctx.beginPath();
    ctx.moveTo(head.x, head.y);
    for (const p of tail) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const anchor = edgeLabelAnchor(edge.waypoints);
    ctx.fillStyle = selectedFill;
    ctx.fillRect(anchor.x - handleSize, anchor.y - handleSize, handleSize * 2, handleSize * 2);
    ctx.restore();
  }
  ctx.strokeStyle = selectedFill;
  ctx.lineWidth = overlayLine;
  for (const node of shown.nodes) {
    if (selection.nodes.has(node.id)) {
      const { origin, size } = node.bounds;
      const pad = Math.max(3, 3 / viewScale);
      ctx.strokeRect(origin.x - pad, origin.y - pad, size.width + pad * 2, size.height + pad * 2);
    }
  }
  if (marquee !== null) {
    const x = Math.min(marquee.x0, marquee.x1);
    const y = Math.min(marquee.y0, marquee.y1);
    const w = Math.abs(marquee.x1 - marquee.x0);
    const h = Math.abs(marquee.y1 - marquee.y0);
    ctx.fillStyle = "rgba(37,99,235,0.08)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = selectedFill;
    ctx.lineWidth = Math.max(1, 1 / viewScale);
    ctx.setLineDash([overlayDash, overlayDash]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }
  if (connectDrag !== null) {
    // The in-progress ⌥-connect: a dashed rubber-band from the source node centre to the cursor.
    ctx.strokeStyle = selectedFill;
    ctx.fillStyle = selectedFill;
    ctx.lineWidth = overlayLine;
    ctx.setLineDash([overlayDash, overlayDash]);
    ctx.beginPath();
    ctx.moveTo(connectDrag.fromX, connectDrag.fromY);
    ctx.lineTo(connectDrag.x, connectDrag.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(connectDrag.x, connectDrag.y, handleSize, 0, Math.PI * 2);
    ctx.fill();
  }
  if (snapGuides.vx !== null || snapGuides.hy !== null) {
    // Alignment guides: amber dashed lines on the axes the dragged node snapped to, spanning content.
    const ex = shown.extent;
    ctx.strokeStyle = "#f5a623";
    ctx.lineWidth = Math.max(1, 1 / viewScale);
    ctx.setLineDash([overlayDash, overlayDash]);
    if (snapGuides.vx !== null) {
      ctx.beginPath();
      ctx.moveTo(snapGuides.vx, ex.origin.y);
      ctx.lineTo(snapGuides.vx, ex.origin.y + ex.size.height);
      ctx.stroke();
    }
    if (snapGuides.hy !== null) {
      ctx.beginPath();
      ctx.moveTo(ex.origin.x, snapGuides.hy);
      ctx.lineTo(ex.origin.x + ex.size.width, snapGuides.hy);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  // Resize handles: small squares at the corners of the single selected node.
  const resizableId = singleResizableNodeId();
  if (resizableId !== null) {
    const node = shown.nodes.find((n) => n.id === resizableId);
    if (node !== undefined) {
      const { origin, size: box } = node.bounds;
      ctx.fillStyle = selectedFill;
      const corners: ReadonlyArray<readonly [number, number]> = [
        [origin.x, origin.y],
        [origin.x + box.width, origin.y],
        [origin.x, origin.y + box.height],
        [origin.x + box.width, origin.y + box.height],
      ];
      for (const [hx, hy] of corners) {
        ctx.fillRect(hx - handleSize, hy - handleSize, handleSize * 2, handleSize * 2);
      }
    }
  }
  ctx.restore();
  lastRender = { scene: shown, logicalWidth, logicalHeight };
  // Rebuilding the minimap cache is a *second* full render of the scene (to an offscreen canvas). During
  // an active interaction (drag/resize/marquee/connect) the canvas repaints every frame, so doing that
  // each frame doubles the per-frame cost on a large diagram. Skip it while interacting — the minimap
  // goes briefly stale and the release (which repaints with no interaction in flight) refreshes it. A
  // scroll/pan only blits the cache + redraws the viewport scrim (`drawMinimap`), never rebuilds.
  if (!isInteracting()) buildMinimapCache();
  drawMinimap();
  positionContextBar();
};

// Coalesces repaints to one per animation frame. Pointer-move events (drag/resize/marquee) can fire
// many times per frame; without this each would rebuild the display list + repaint the whole canvas +
// minimap. `requestPaint` collapses a burst into a single paint, so interaction stays smooth on large
// diagrams. One-shot paints (toggles, re-render) call `paintScene` directly.
let paintQueued = false;
const requestPaint = (): void => {
  if (paintQueued) return;
  paintQueued = true;
  requestAnimationFrame(() => {
    paintQueued = false;
    paintScene();
  });
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
  if (doc.groups().size === 0) return [];
  const boundsById = new Map(shown.nodes.map((node) => [node.id, node.bounds]));
  const boxes: GroupBox[] = [];
  for (const g of doc.groups().values()) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const id of leafNodes(doc.groups(), g.id)) {
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

// The three group hit-tests take a precomputed `boxes` (one `groupBoxes` build the caller shares across
// all three) rather than each rebuilding the group bounds — a pointer-move over a grouped diagram ran
// the bounds map three times per event.
const groupOutlineAt = (boxes: readonly GroupBox[], at: Point): GroupId | null => {
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

const groupTitleAt = (boxes: readonly GroupBox[], at: Point): GroupId | null => {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    if (box === undefined) continue;
    const inside =
      at.x >= box.x && at.x <= box.x + box.w && at.y >= box.y && at.y <= box.y + GROUP_TITLE_HEIGHT;
    if (inside) return box.id;
  }
  return null;
};

const groupAt = (boxes: readonly GroupBox[], at: Point): GroupId | null => {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    if (box === undefined) continue;
    const inside = at.x >= box.x && at.x <= box.x + box.w && at.y >= box.y && at.y <= box.y + box.h;
    if (inside) return box.id;
  }
  return null;
};

// The group under a point — title bar, outline edge, then interior — with the group bounds built once.
const groupHitAt = (shown: Scene, at: Point): GroupId | null => {
  const boxes = groupBoxes(shown);
  return groupTitleAt(boxes, at) ?? groupOutlineAt(boxes, at) ?? groupAt(boxes, at);
};

const selectGroup = (id: GroupId): void => {
  const leaves = leafNodes(doc.groups(), id);
  selection = { nodes: new Set(leaves), edges: new Set() };
  selectionOrder = [...leaves];
};

const toggleGroupSelection = (id: GroupId): void => {
  const leaves = leafNodes(doc.groups(), id);
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
  if (doc.groups().size === 0) return;
  const dark = theme === darkTheme;
  for (const box of groupBoxes(shown)) {
    const g = doc.groups().get(box.id);
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
    const top = topGroupOfNode(doc.groups(), id);
    if (top !== null) return top;
  }
  return null;
};

// Distinct *movable* top-level units in the selection — a loose node or a whole top group, minus
// anything under a locked group. Alignment/distribution act on these (a group moves as a unit).
const movableUnitCount = (): number => {
  const seen = new Set<string>();
  for (const id of selection.nodes) {
    if (pathLocked(doc.groups(), id)) continue;
    const top = topGroupOfNode(doc.groups(), id);
    seen.add(top === null ? `n:${id}` : `g:${top}`);
  }
  return seen.size;
};

// The single selected node, when it's the only thing selected and not under a locked group — the one
// node that shows resize handles. (Resize is single-node; multi-select uses Group/Arrange instead.)
const singleResizableNodeId = (): SceneNodeId | null => {
  if (selection.nodes.size !== 1) return null;
  const [only] = selection.nodes;
  if (only === undefined || pathLocked(doc.groups(), only)) return null;
  return only;
};

type TaskTone = "quiet" | "action" | "blocked";

const setTask = (message: string, tone: TaskTone): void => {
  taskStatusText.textContent = message;
  taskStatusText.parentElement?.setAttribute("data-tone", tone);
  taskHudText.textContent = message;
  stageHud.hidden = tone === "quiet";
};

// What cross-family canvas affordances each diagram family's *grammar* can actually accept. Connect
// and the icon override inject family-specific syntax into the source; offering them on a family
// whose grammar would reject the result silently corrupts the text (a grey, un-parseable diagram).
// Exhaustive over the closed `DiagramAst["kind"]` union — a new family must declare its affordances
// here or this won't compile.
interface FamilyAffordances {
  readonly connect: boolean;
  readonly iconOverride: boolean;
}
const familyAffordances = (kind: DiagramAst["kind"]): FamilyAffordances => {
  switch (kind) {
    case "network":
    case "cloud":
    case "block":
      return { connect: true, iconOverride: true };
    case "flowchart":
    case "state":
    case "c4":
    case "sequence":
    case "er":
    case "class":
    case "requirement":
      return { connect: true, iconOverride: false };
    case "gitGraph":
    case "timeline":
    case "mindmap":
    case "pie":
    case "gantt":
      return { connect: false, iconOverride: false };
    default:
      return assertNever(kind);
  }
};

const updateTask = (): void => {
  if (!currentRenderValid) {
    setTask("fix the source before editing or exporting", "blocked");
    return;
  }
  if (selection.nodes.size + selection.edges.size === 0) {
    setTask("select a diagram item, edit the source, or export when ready", "quiet");
    return;
  }
  if (selection.edges.size > 0 && selection.nodes.size === 0) {
    setTask("relabel this edge or delete it", "action");
    return;
  }
  if (selection.nodes.size === 1) {
    setTask("drag, rename, or resize with corner handles", "action");
    return;
  }
  const canConnect =
    ast !== null && familyAffordances(ast.kind).connect && selectionOrder.length >= 2;
  setTask(
    canConnect ? "connect, group, arrange, or drag selection" : "group, arrange, or drag selection",
    "action",
  );
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

// What the current selection + family can do — computed once and consumed by BOTH the workbench
// controls (`updateGroupButtons`) and the on-canvas selection context toolbar (`renderContextBar`), so
// the two surfaces provably can't drift (e.g. Connect offered on one but not the other). `valid` folds
// the `currentRenderValid && !viewerMode` gate; every flag is false when not valid.
interface CapabilityState {
  readonly valid: boolean;
  readonly canConnect: boolean;
  readonly connectTitle: string;
  readonly iconCapable: boolean;
  readonly iconTitle: string;
  readonly canGroup: boolean;
  readonly hasGroup: boolean;
  readonly isLocked: boolean;
  readonly canArrange: boolean;
  readonly canDistribute: boolean;
  readonly canShape: boolean;
  readonly canDuplicate: boolean;
  readonly canRelabel: boolean;
  readonly canDelete: boolean;
  readonly isEdgeOnly: boolean;
}

const TOOL_BUTTONS: Record<Tool, HTMLButtonElement> = {
  select: toolSelectBtn,
  hand: toolHandBtn,
  connect: toolConnectBtn,
  place: toolPlaceBtn,
};
const TOOL_ORDER: readonly Tool[] = ["select", "hand", "connect", "place"];

// Reflect the armed tool + per-family availability on the palette radiogroup (roving tabindex). If the
// armed tool is no longer available (e.g. Connect on a family that can't accept it, or a switch to a
// viewer), fall back to Select so `aria-checked` never points at a disabled control.
const syncToolPalette = (): void => {
  const available: Record<Tool, boolean> = {
    select: true,
    hand: true,
    connect: !viewerMode && ast !== null && familyAffordances(ast.kind).connect,
    place: !viewerMode && ast !== null && ast.kind === "flowchart",
  };
  if (!available[activeTool]) {
    activeTool = "select";
    stageWrap.setAttribute("data-tool", "select");
  }
  for (const t of TOOL_ORDER) {
    const btn = TOOL_BUTTONS[t];
    const checked = activeTool === t;
    btn.setAttribute("aria-checked", checked ? "true" : "false");
    btn.tabIndex = checked ? 0 : -1;
    btn.disabled = !available[t];
  }
};

// Which verbs the selection context toolbar offers, driven by the same CapabilityState the workbench
// controls use (so they can't disagree). Geometry/visibility of the bar itself is `positionContextBar`.
const renderContextBar = (caps: CapabilityState): void => {
  ctxRelabelBtn.hidden = !caps.canRelabel;
  ctxShapeBtn.hidden = !caps.canShape;
  ctxConnectBtn.hidden = !caps.canConnect;
  ctxDuplicateBtn.hidden = !caps.canDuplicate;
  ctxGroupBtn.hidden = !caps.canGroup;
  ctxUngroupBtn.hidden = !caps.hasGroup;
  ctxLockBtn.hidden = !caps.hasGroup;
  ctxLockBtn.textContent = caps.isLocked ? "Unlock" : "Lock";
  ctxArrangeBtn.hidden = !caps.canArrange;
  ctxDeleteBtn.hidden = !caps.canDelete;
};

const computeCapabilities = (): CapabilityState => {
  const valid = currentRenderValid && !viewerMode;
  const blockedTitle = currentRenderValid ? "viewer mode" : "fix source first";
  if (!valid) {
    return {
      valid: false,
      canConnect: false,
      connectTitle: blockedTitle,
      iconCapable: false,
      iconTitle: blockedTitle,
      canGroup: false,
      hasGroup: false,
      isLocked: false,
      canArrange: false,
      canDistribute: false,
      canShape: false,
      canDuplicate: false,
      canRelabel: false,
      canDelete: false,
      isEdgeOnly: false,
    };
  }
  const kindLabel = ast === null ? "this diagram" : ast.kind;
  const connectable = ast !== null && familyAffordances(ast.kind).connect;
  const iconCapable = ast !== null && familyAffordances(ast.kind).iconOverride;
  const isFlowchart = ast !== null && ast.kind === "flowchart";
  const units = new Set<string>();
  for (const id of selection.nodes) {
    const top = topGroupOfNode(doc.groups(), id);
    units.add(top === null ? `n:${id}` : `g:${top}`);
  }
  const top = selectedTopGroup();
  const movable = movableUnitCount();
  const totalSelected = selection.nodes.size + selection.edges.size;
  return {
    valid: true,
    canConnect: connectable && selectionOrder.length >= 2,
    connectTitle: !connectable
      ? `connect isn't available for ${kindLabel}`
      : selectionOrder.length < 2
        ? "select two nodes"
        : "",
    iconCapable,
    iconTitle: iconCapable
      ? "Insert an icon override on a node"
      : `icons aren't available for ${kindLabel}`,
    canGroup: units.size >= 2,
    hasGroup: top !== null,
    isLocked: top !== null && doc.groups().get(top)?.locked === true,
    canArrange: movable >= 2,
    canDistribute: movable >= 3,
    canShape: isFlowchart && selectionOrder.length >= 1,
    canDuplicate: isFlowchart && selectionOrder.length >= 1,
    canRelabel: totalSelected === 1,
    canDelete: selectionOrder.length > 0 || selection.edges.size > 0,
    isEdgeOnly: selectionOrder.length === 0 && selection.edges.size > 0,
  };
};

// Reflect the current selection in the workbench controls (enabled state + Lock/Unlock label).
const updateGroupButtons = (): void => {
  const caps = computeCapabilities();
  groupBtn.disabled = !caps.canGroup;
  ungroupBtn.disabled = !caps.hasGroup;
  lockBtn.disabled = !caps.hasGroup;
  lockBtn.textContent = caps.isLocked ? "Unlock" : "Lock";
  arrangeBtn.disabled = !caps.canArrange;
  if (distHBtn !== null) distHBtn.disabled = !caps.canDistribute;
  if (distVBtn !== null) distVBtn.disabled = !caps.canDistribute;
  if (!caps.canArrange) closeArrange();
  connectBtn.disabled = !caps.canConnect;
  connectBtn.title = caps.connectTitle;
  iconsToggle.disabled = !caps.iconCapable;
  iconsToggle.title = caps.iconTitle;
  syncToolPalette();
  renderContextBar(caps);
  updateTask();
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
    if (pathLocked(doc.groups(), id)) continue;
    const top = topGroupOfNode(doc.groups(), id);
    const key = top === null ? `n:${id}` : `g:${top}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const leaves = top === null ? [id] : leafNodes(doc.groups(), top);
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

// Fold-based min/max — never `Math.min(...arr)`, whose argument spread throws (RangeError) once the
// array is large enough (a select-all-then-align on a big diagram would hit that limit).
const minOf = (ns: readonly number[]): number =>
  ns.reduce((m, n) => Math.min(m, n), Number.POSITIVE_INFINITY);
const maxOf = (ns: readonly number[]): number =>
  ns.reduce((m, n) => Math.max(m, n), Number.NEGATIVE_INFINITY);

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
      const t = minOf(lefts);
      for (const u of units) put(u, t - u.x, 0);
      break;
    }
    case "right": {
      const t = maxOf(rights);
      for (const u of units) put(u, t - u.w - u.x, 0);
      break;
    }
    case "top": {
      const t = minOf(tops);
      for (const u of units) put(u, 0, t - u.y);
      break;
    }
    case "bottom": {
      const t = maxOf(bottoms);
      for (const u of units) put(u, 0, t - u.h - u.y);
      break;
    }
    case "centerX": {
      const axis = (minOf(lefts) + maxOf(rights)) / 2;
      for (const u of units) put(u, axis - u.w / 2 - u.x, 0);
      break;
    }
    case "centerY": {
      const axis = (minOf(tops) + maxOf(bottoms)) / 2;
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
  if (scene === null || viewerMode) return;
  const shown = shownScene(scene);
  const units = selectedUnitBoxes(shown);
  const need = kind === "distH" || kind === "distV" ? 3 : 2;
  if (units.length < need) return;
  const deltas = arrangeDeltas(kind, units);
  const moved = new Map([...deltas].filter(([, d]) => d.dx !== 0 || d.dy !== 0));
  if (moved.size === 0) {
    announce("selection is already arranged");
    return;
  }
  const origin = new Map(shown.nodes.map((n) => [n.id, n.bounds.origin]));
  doc.record();
  for (const [id, d] of moved) {
    const at = origin.get(id);
    if (at !== undefined) doc.moveNode(id, point(at.x + d.dx, at.y + d.dy));
  }
  doc.persist();
  paintScene();
  announce(`arranged ${units.length} item${units.length === 1 ? "" : "s"}`);
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
  if (viewerMode) return;
  const units: GroupMember[] = [];
  const seen = new Set<string>();
  for (const id of selectionOrder) {
    const top = topGroupOfNode(doc.groups(), id);
    const member: GroupMember = top === null ? { kind: "node", id } : { kind: "group", id: top };
    const key = `${member.kind}:${member.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    units.push(member);
  }
  if (units.length < 2) return;
  doc.record();
  doc.groupNodes(units);
  updateGroupButtons();
  doc.persist();
  paintScene();
  announce(`grouped ${units.length} item${units.length === 1 ? "" : "s"}`);
};

const ungroupSelection = (): void => {
  if (viewerMode) return;
  const top = selectedTopGroup();
  if (top === null) return;
  doc.record();
  doc.ungroupAt(top);
  updateGroupButtons();
  doc.persist();
  paintScene();
  announce("ungrouped selection");
};

const toggleLockSelection = (): void => {
  if (viewerMode) return;
  const top = selectedTopGroup();
  const g = top === null ? undefined : doc.groups().get(top);
  if (top === null || g === undefined) return;
  doc.record();
  doc.setGroupLocked(top, !g.locked);
  updateGroupButtons();
  doc.persist();
  paintScene();
  announce(g.locked ? "unlocked group" : "locked group");
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

// The minimap's static content (background + faint edges + node blocks) is cached to an offscreen
// canvas, rebuilt only when the scene/theme changes. A scroll then just blits the cache and redraws the
// (cheap) viewport scrim — so panning a large diagram is O(1), not O(node count) per scroll event.
const miniCache = document.createElement("canvas");
const miniCacheCtx = miniCache.getContext("2d");
// Null when the diagram fits (minimap hidden); else the layout the cache was built at.
let miniLayout: {
  readonly scale: number;
  readonly w: number;
  readonly h: number;
  readonly dpr: number;
} | null = null;

const buildMinimapCache = (): void => {
  miniLayout = null;
  if (lastRender === null || miniCacheCtx === null) return;
  const { scene, logicalWidth, logicalHeight } = lastRender;
  const overflowing =
    logicalWidth * viewScale > stageWrap.clientWidth + 1 ||
    logicalHeight * viewScale > stageWrap.clientHeight + 1;
  if (!overflowing) return;

  const scale = Math.min(MINIMAP_MAX / logicalWidth, MINIMAP_MAX / logicalHeight);
  const dpr = window.devicePixelRatio || 1;
  miniCache.width = Math.round(logicalWidth * scale * dpr);
  miniCache.height = Math.round(logicalHeight * scale * dpr);

  const active = activeTheme();
  // Work in logical coordinates (origin at the sheet's content, matching the canvas's MARGIN inset).
  miniCacheCtx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  miniCacheCtx.clearRect(0, 0, logicalWidth, logicalHeight);
  miniCacheCtx.fillStyle = active.background;
  miniCacheCtx.fillRect(0, 0, logicalWidth, logicalHeight);
  miniCacheCtx.save();
  miniCacheCtx.translate(MARGIN - scene.extent.origin.x, MARGIN - scene.extent.origin.y);
  // Faint edges first, then node blocks on top.
  miniCacheCtx.strokeStyle = active.stroke;
  miniCacheCtx.globalAlpha = 0.35;
  miniCacheCtx.lineWidth = 1 / scale;
  for (const edge of scene.edges) {
    const [head, ...tail] = edge.waypoints;
    if (head === undefined) continue;
    miniCacheCtx.beginPath();
    miniCacheCtx.moveTo(head.x, head.y);
    for (const p of tail) miniCacheCtx.lineTo(p.x, p.y);
    miniCacheCtx.stroke();
  }
  miniCacheCtx.globalAlpha = 1;
  miniCacheCtx.fillStyle = active.nodeFill;
  miniCacheCtx.strokeStyle = active.stroke;
  miniCacheCtx.lineWidth = 1 / scale;
  for (const node of scene.nodes) {
    const { origin, size } = node.bounds;
    miniCacheCtx.fillRect(origin.x, origin.y, size.width, size.height);
    miniCacheCtx.strokeRect(origin.x, origin.y, size.width, size.height);
  }
  miniCacheCtx.restore();
  miniLayout = { scale, w: logicalWidth * scale, h: logicalHeight * scale, dpr };
};

const drawMinimap = (): void => {
  if (miniLayout === null || lastRender === null) {
    minimap.hidden = true;
    return;
  }
  minimap.hidden = false;
  const { logicalWidth, logicalHeight } = lastRender;
  const { scale: miniScale, w: miniW, h: miniH, dpr } = miniLayout;
  const W = Math.round(miniW * dpr);
  const H = Math.round(miniH * dpr);
  if (minimap.width !== W || minimap.height !== H) {
    minimap.width = W;
    minimap.height = H;
    minimap.style.width = `${miniW}px`;
    minimap.style.height = `${miniH}px`;
  }

  // Blit the cached static content 1:1, then draw the viewport overlay in logical coordinates.
  miniCtx.setTransform(1, 0, 0, 1, 0, 0);
  miniCtx.clearRect(0, 0, W, H);
  miniCtx.drawImage(miniCache, 0, 0);
  miniCtx.setTransform(dpr * miniScale, 0, 0, dpr * miniScale, 0, 0);

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
  const highContrast = forcedColors();
  const dark = theme === darkTheme;
  miniCtx.fillStyle = highContrast ? "Canvas" : dark ? "rgba(7,16,15,0.5)" : "rgba(24,37,41,0.34)";
  miniCtx.fillRect(0, 0, logicalWidth, top);
  miniCtx.fillRect(0, bottom, logicalWidth, logicalHeight - bottom);
  miniCtx.fillRect(0, top, left, bottom - top);
  miniCtx.fillRect(right, top, logicalWidth - right, bottom - top);

  // A faint accent tint inside the viewport so the "here" region reads as a lit lens, not just an
  // un-dimmed gap — the scrim outside and the tint inside push the contrast from both sides.
  const accent = highContrast ? "Highlight" : dark ? MINIMAP_ACCENT_DARK : MINIMAP_ACCENT_LIGHT;
  miniCtx.fillStyle = highContrast
    ? "transparent"
    : dark
      ? "rgba(240,137,78,0.12)"
      : "rgba(210,96,44,0.10)";
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
  const shown = shownScene(scene);
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
stageWrap.addEventListener("scroll", () => {
  drawMinimap();
  positionContextBar(); // the bar tracks the selection as the sheet scrolls inside the stage
});
window.addEventListener("resize", () => {
  buildMinimapCache();
  drawMinimap();
});

// Click or drag in the minimap to centre the stage viewport on that point. Maps minimap px →
// logical px → the canvas's (invariant) position in scroll-content coords → a target scroll offset.
// Centre the stage viewport on a point given in the diagram's logical px (the sheet coordinate space,
// origin at the sheet's top-left including the margin). Shared by minimap navigation and the keyboard
// diagram navigator.
const scrollToLogical = (logicalX: number, logicalY: number): void => {
  const canvasRect = canvas.getBoundingClientRect();
  const wrapRect = stageWrap.getBoundingClientRect();
  const canvasContentLeft = stageWrap.scrollLeft + (canvasRect.left - wrapRect.left);
  const canvasContentTop = stageWrap.scrollTop + (canvasRect.top - wrapRect.top);
  stageWrap.scrollLeft = canvasContentLeft + logicalX * viewScale - stageWrap.clientWidth / 2;
  stageWrap.scrollTop = canvasContentTop + logicalY * viewScale - stageWrap.clientHeight / 2;
};

let minimapDragging = false;
const minimapNavigate = (ev: PointerEvent): void => {
  if (lastRender === null || minimap.hidden) return;
  const rect = minimap.getBoundingClientRect();
  const miniScale = rect.width / lastRender.logicalWidth;
  scrollToLogical((ev.clientX - rect.left) / miniScale, (ev.clientY - rect.top) / miniScale);
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
minimap.addEventListener("keydown", (ev) => {
  if (lastRender === null || minimap.hidden) return;
  const step = ev.shiftKey ? 120 : 40;
  if (ev.key === "ArrowLeft") {
    ev.preventDefault();
    stageWrap.scrollLeft -= step;
  } else if (ev.key === "ArrowRight") {
    ev.preventDefault();
    stageWrap.scrollLeft += step;
  } else if (ev.key === "ArrowUp") {
    ev.preventDefault();
    stageWrap.scrollTop -= step;
  } else if (ev.key === "ArrowDown") {
    ev.preventDefault();
    stageWrap.scrollTop += step;
  } else if (ev.key === "Home") {
    ev.preventDefault();
    stageWrap.scrollLeft = 0;
    stageWrap.scrollTop = 0;
  } else if (ev.key === "End") {
    ev.preventDefault();
    stageWrap.scrollLeft = stageWrap.scrollWidth;
    stageWrap.scrollTop = stageWrap.scrollHeight;
  }
});

// ---- Keyboard diagram navigator ----
// A focusable listbox mirrors the scene's nodes and edges so the diagram is operable without a mouse.
// Arrow keys move the active option, which drives the canvas selection and centres it in view; a live
// region announces it.
const announce = (message: string): void => {
  diagramLive.textContent = message;
};

const centerOnNode = (id: SceneNodeId): void => {
  if (lastRender === null) return;
  const node = lastRender.scene.nodes.find((n) => n.id === id);
  if (node === undefined) return;
  const cx = node.bounds.origin.x + node.bounds.size.width / 2;
  const cy = node.bounds.origin.y + node.bounds.size.height / 2;
  scrollToLogical(
    MARGIN - lastRender.scene.extent.origin.x + cx,
    MARGIN - lastRender.scene.extent.origin.y + cy,
  );
};

// The navigator's options are the scene's nodes then its edges, each a focus target. `HitTarget` is the
// node/edge shape the selection and relabel paths already speak, so an item feeds them directly.
let navItems: HitTarget[] = [];
let navIndex = -1; // the active option's index into `navItems`, or -1 when nothing is active yet
// The chosen source while a keyboard Connect is in progress (press `c` to pick it, navigate, `c` again
// to connect to the target). Cleared on connect, cancel, or any re-render.
let navConnectSource: SceneNodeId | null = null;
const navActive = (): HitTarget | null => (navIndex >= 0 ? (navItems[navIndex] ?? null) : null);

const navLabel = (id: SceneNodeId): string => {
  const node = scene?.nodes.find((n) => n.id === id);
  return node !== undefined && node.label.length > 0 ? node.label : "node";
};

// An edge spoken as "Alpha to Beta" plus its own label, if any, readable without the visual arrow.
const edgeLabel = (id: SceneEdgeId): string => {
  const edge = scene?.edges.find((e) => e.id === id);
  if (edge === undefined) return "edge";
  const ends = `${navLabel(edge.from)} to ${navLabel(edge.to)}`;
  return edge.label !== null && edge.label.length > 0 ? `${ends}, ${edge.label}` : ends;
};

// A spoken summary of a node's edges, so a screen-reader user grasps the topology, not just the node
// list: "to Gamma; from Alpha" (capped so a hub node stays concise), or "no connections".
const describeConnections = (id: SceneNodeId): string => {
  if (scene === null) return "";
  const outgoing = scene.edges.filter((e) => e.from === id).map((e) => navLabel(e.to));
  const incoming = scene.edges.filter((e) => e.to === id).map((e) => navLabel(e.from));
  const list = (xs: readonly string[]): string =>
    xs.length <= 3 ? xs.join(", ") : `${xs.slice(0, 3).join(", ")} and ${xs.length - 3} more`;
  const parts: string[] = [];
  if (outgoing.length > 0) parts.push(`to ${list(outgoing)}`);
  if (incoming.length > 0) parts.push(`from ${list(incoming)}`);
  return parts.length === 0 ? "no connections" : parts.join("; ");
};

const centerOnEdge = (id: SceneEdgeId): void => {
  if (lastRender === null) return;
  const edge = lastRender.scene.edges.find((e) => e.id === id);
  if (edge === undefined) return;
  const anchor = edgeLabelAnchor(edge.waypoints);
  const origin = lastRender.scene.extent.origin;
  scrollToLogical(MARGIN - origin.x + anchor.x, MARGIN - origin.y + anchor.y);
};

const rebuildNav = (): void => {
  diagramNav.replaceChildren();
  diagramNav.removeAttribute("aria-activedescendant");
  navIndex = -1;
  navConnectSource = null;
  if (scene === null) {
    navItems = [];
    return;
  }
  navItems = [
    ...scene.nodes.map((n): HitTarget => ({ kind: "node", id: n.id })),
    ...scene.edges.map((e): HitTarget => ({ kind: "edge", id: e.id })),
  ];
  navItems.forEach((item, i) => {
    const option = document.createElement("li");
    option.id = `diagram-item-${i}`;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    option.textContent =
      item.kind === "node" ? navLabel(item.id) || `node ${i + 1}` : `${edgeLabel(item.id)} (edge)`;
    diagramNav.appendChild(option);
  });
};

const setNavActive = (index: number): void => {
  if (navItems.length === 0) return;
  const clamped = Math.max(0, Math.min(index, navItems.length - 1));
  const item = navItems[clamped];
  const option = diagramNav.children[clamped];
  if (item === undefined || option === undefined) return;
  for (const child of Array.from(diagramNav.children)) child.setAttribute("aria-selected", "false");
  option.setAttribute("aria-selected", "true");
  diagramNav.setAttribute("aria-activedescendant", option.id);
  navIndex = clamped;
  const position = `${clamped + 1} of ${navItems.length}`;
  // Drive the canvas selection so the item highlights and the existing Delete handler can remove it.
  if (item.kind === "node") {
    selection = { nodes: new Set([item.id]), edges: new Set() };
    selectionOrder = [item.id];
    paintScene();
    updateGroupButtons();
    centerOnNode(item.id);
    announce(`${navLabel(item.id)}, ${position}. ${describeConnections(item.id)}`);
  } else {
    selection = { nodes: new Set(), edges: new Set([item.id]) };
    selectionOrder = [];
    paintScene();
    updateGroupButtons();
    centerOnEdge(item.id);
    announce(`${edgeLabel(item.id)}, edge, ${position}`);
  }
};

diagramNav.addEventListener("focus", () => {
  // Ring the stage so a sighted keyboard user sees focus is in the diagram (the navigator is hidden).
  stageWrap.classList.add("kbd-focus");
  if (navIndex < 0) setNavActive(0);
});
diagramNav.addEventListener("blur", () => {
  stageWrap.classList.remove("kbd-focus");
  navConnectSource = null; // an in-progress Connect doesn't outlive focus leaving the navigator
});
const ARROW_DELTA: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

diagramNav.addEventListener("keydown", (ev) => {
  if (scene === null || navItems.length === 0) return;
  const item = navActive();
  // Alt+Arrow nudges the active node (keyboard parity with drag; Shift = a bigger step); the move drives
  // the same override path as dragging, so it shares one undo entry per run. Edges aren't positioned.
  const delta = ARROW_DELTA[ev.key];
  if (ev.altKey && delta !== undefined && item?.kind === "node" && !viewerMode) {
    ev.preventDefault();
    const step = ev.shiftKey ? 10 : 1;
    nudgeSelection(delta[0] * step, delta[1] * step);
    announce(`moved ${navLabel(item.id)}`);
    return;
  }
  if (ev.key === "ArrowDown" || ev.key === "ArrowRight") {
    ev.preventDefault();
    setNavActive(navIndex + 1);
  } else if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") {
    ev.preventDefault();
    setNavActive(navIndex <= 0 ? 0 : navIndex - 1);
  } else if (ev.key === "Home") {
    ev.preventDefault();
    setNavActive(0);
  } else if (ev.key === "End") {
    ev.preventDefault();
    setNavActive(navItems.length - 1);
  } else if (ev.key === "Enter" && item !== null && !viewerMode) {
    // Open the inline relabel editor on the active node or edge — parity with a canvas double-click.
    ev.preventDefault();
    navConnectSource = null;
    beginRelabel(shownScene(scene), item, null);
  } else if (
    (ev.key === "c" || ev.key === "C") &&
    item?.kind === "node" &&
    ast !== null &&
    !viewerMode
  ) {
    // Two-step keyboard Connect: `c` picks the active node as the source, navigate to a target, `c`
    // again draws the edge in the family's own syntax (parity with an Alt-drag between nodes).
    ev.preventDefault();
    if (navConnectSource === null) {
      navConnectSource = item.id;
      announce(`connecting from ${navLabel(item.id)} — move to a target and press c`);
    } else if (navConnectSource === item.id) {
      announce("connect cancelled");
      navConnectSource = null;
    } else {
      const from = navLabel(navConnectSource);
      const to = navLabel(item.id);
      const text = appendEdge(ast.kind, editor.value(), navConnectSource, item.id);
      navConnectSource = null;
      if (text === editor.value()) {
        announce("connect isn't available for this diagram");
      } else {
        editor.setValue(text);
        void renderFromText(text);
        announce(`connected ${from} to ${to}`);
      }
    }
  } else if (ev.key === "Escape" && navConnectSource !== null) {
    ev.preventDefault();
    navConnectSource = null;
    announce("connect cancelled");
  }
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
  level: "ok" | "warning" | "error",
  message: string,
  range: { readonly offset: number; readonly length: number } | null = null,
): void => {
  statusEl.textContent = message;
  statusEl.setAttribute("data-level", level);
  statusEl.setAttribute("data-locatable", range === null ? "false" : "true");
  stageWrap.setAttribute("data-stale", level === "error" ? "true" : "false");
  stageEmpty.hidden = !(level === "error" && scene === null);
  errorRange = range;
  // Mirror the located error into the editor as an inline diagnostic (red squiggle + gutter marker +
  // hover message); clears it on any non-error status.
  editor.setError(range, message);
  // The canvas (role="img") needs a text alternative for screen readers — the status line is the
  // baseline; `renderFromText` enriches it with node labels on a successful render.
  // On an error the canvas still shows the last good render (greyed), so say so for screen readers
  // rather than implying it's blank.
  canvas.setAttribute(
    "aria-label",
    level === "error"
      ? scene === null
        ? `Diagram error: ${message}`
        : `Diagram error: ${message}. Showing last valid render.`
      : message,
  );
  updateTask();
};

const setStatusAndAnnounce = (
  level: "ok" | "warning" | "error",
  message: string,
  range: { readonly offset: number; readonly length: number } | null = null,
): void => {
  setStatus(level, message, range);
  announce(message);
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
  const isFlowchart = currentRenderValid && kind === "flowchart";
  for (const btn of flowchartOnly) {
    btn.disabled = !isFlowchart;
    btn.title = isFlowchart ? "" : currentRenderValid ? "flowchart only" : "fix source first";
  }
};

const reconcileSelection = (rendered: Scene): void => {
  const liveNodes = new Set(rendered.nodes.map((node) => node.id));
  const liveEdges = new Set(rendered.edges.map((edge) => edge.id));
  const nodes = new Set([...selection.nodes].filter((id) => liveNodes.has(id)));
  const edges = new Set([...selection.edges].filter((id) => liveEdges.has(id)));
  selectionOrder = selectionOrder.filter((id) => nodes.has(id));
  selection = { nodes, edges };
  nudging = false;
};

// Layout runs in a Web Worker (off the main thread), so its result arrives asynchronously and a
// later render can overtake an earlier one. `renderSeq` tags each render; a stale result (one whose
// tag is no longer current) is dropped instead of painting over a newer diagram.
let renderSeq = 0;

const renderFromText = async (text: string): Promise<void> => {
  const mySeq = ++renderSeq;
  currentRenderValid = false;
  updateGroupButtons();
  localStorage.setItem(SOURCE_KEY, text);
  // One parse yields both the AST (to lay out) and the family's source map (the spans the inline editor
  // patches) — previously every family was parsed twice per render. `parsed.value.family` is the closed
  // discriminator: it separates flowchart from DOT-import (both have ast kind `flowchart`).
  const parsed = parseDiagramWithSource(text);
  if (!isOk(parsed)) {
    const detail = parsed.error.errors.join("; ");
    console.error("parse failed:", detail);
    const pos = parsed.error.positions[0];
    if (pos === undefined) {
      setStatusAndAnnounce("error", `parse error — ${detail}`);
    } else {
      const { line, col } = lineColOf(text, pos.offset);
      setStatusAndAnnounce(
        "error",
        `parse error (line ${line}:${col}) — ${detail} · click to locate`,
        pos,
      );
    }
    if (ast !== null) applyKind(ast.kind);
    return;
  }
  const result = parsed.value;
  const diagram = result.ast;
  lastDirection = "direction" in diagram ? diagram.direction : null;
  const laid = await layoutDiagram(diagram, measureLabel);
  if (mySeq !== renderSeq) return; // a newer render started while we awaited layout — drop this one
  if (!isOk(laid)) {
    console.error("layout failed:", laid.error.message);
    setStatusAndAnnounce("error", `layout error — ${laid.error.message}`);
    if (ast !== null) applyKind(ast.kind);
    return;
  }
  currentRenderValid = true;
  applyKind(diagram.kind);
  const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;
  const statusMsg = `${diagram.kind} · ${plural(laid.value.nodes.length, "node")} · ${plural(laid.value.edges.length, "edge")}`;
  setStatus("ok", statusMsg);
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
  reconcileSelection(laid.value);
  // Rebuild the keyboard diagram navigator to mirror the new scene (resets the active item).
  rebuildNav();
  // Drop sidecar groups and overrides whose nodes the edited text removed, so they can't outlive their
  // diagram and resurrect onto reused ids later. We prune *after* a successful layout (keeping the
  // manual positions of nodes that still exist) rather than wiping the whole overlay on every keystroke —
  // editing one node's label no longer discards the layout of every other node, and the prune is
  // undoable. In collab mode the shared room owns the overlay (stale overrides are inert and a peer may
  // still hold the node), so we leave it untouched there.
  const liveIds = new Set(laid.value.nodes.map((n) => n.id));
  if (doc.pruneGroupsTo(liveIds)) {
    doc.persist();
    updateGroupButtons();
  }
  if (!useCollab) {
    const kept = new Map([...doc.overrides()].filter(([id]) => liveIds.has(id)));
    if (kept.size !== doc.overrides().size) {
      doc.record();
      doc.replaceOverrides(kept);
      doc.persist();
    }
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
  classSource = null;
  reqSource = null;
  gitSource = null;
  timelineSource = null;
  mindmapSource = null;
  // Adopt the source map produced by the single parse above (the spans the inline editor patches).
  // Exhaustive over the closed `family` union — a new family must add its arm or this won't compile.
  ganttSource = null;
  switch (result.family) {
    // DOT import has no span parser (an empty source map), so it simply has no editable spans.
    case "flowchart":
    case "dot":
      source = result.source;
      break;
    case "sequence":
      seqSource = result.source;
      break;
    case "c4":
      c4Source = result.source;
      break;
    case "block":
      blockSource = result.source;
      break;
    case "network":
      netSource = result.source;
      break;
    case "cloud":
      cloudSource = result.source;
      break;
    case "state":
      stateSource = result.source;
      break;
    case "er":
      erSource = result.source;
      break;
    case "class":
      classSource = result.source;
      break;
    case "requirement":
      reqSource = result.source;
      break;
    case "gitGraph":
      gitSource = result.source;
      break;
    case "timeline":
      timelineSource = result.source;
      break;
    case "mindmap":
      mindmapSource = result.source;
      break;
    case "pie":
      // pie has no editable source map (no node/edge text spans to patch).
      break;
    case "gantt":
      ganttSource = result.source;
      break;
    default:
      assertNever(result);
  }
  const failedIcons = await ensureIcons(scene);
  if (failedIcons.length > 0) {
    // The diagram rendered fine (just glyph-less), so keep the `ok` level — surfacing the missing
    // glyph as a warning appended to the node/edge counts, rather than an `error` that would grey out
    // the whole (correct) canvas and hide the counts.
    setStatus(
      "ok",
      `${statusMsg} · ⚠ ${failedIcons.length} icon(s) failed: ${failedIcons.join(", ")}`,
    );
  }
  paintScene();
  updateGroupButtons();
};

// Relax: re-run ELK seeded by the current node positions, cleaning up overlaps/routing.
const relax = async (): Promise<void> => {
  if (ast === null || ast.kind !== "flowchart" || scene === null) return;
  const shown = shownScene(scene);
  const seed = new Map<NodeId, Point>(
    shown.nodes.map((n) => [brand<string, "NodeId">(n.id), n.bounds.origin]),
  );
  const laid = await layout(ast, seed, measureLabel);
  if (!isOk(laid)) {
    console.error("relax failed:", laid.error.message);
    return;
  }
  scene = laid.value;
  doc.clearOverrides();
  doc.persist();
  paintScene();
};

// The displayed extent origin (the offset `paintScene` translates by) — (0,0) until the first render.
const sceneExtentOrigin = (): Point =>
  point(lastRender?.scene.extent.origin.x ?? 0, lastRender?.scene.extent.origin.y ?? 0);

// The single scene↔screen transform pair, kept together so they can't drift out of being inverses.
// Screen here is viewport CSS px (what `getBoundingClientRect`, `clientX/Y` and `style.left/top` use);
// scene is diagram space. `scenePoint` is screen→scene (used for hit-testing pointer events) and
// `sceneToScreen` its inverse (used to place DOM overlays like the inline editor). They previously
// existed as two hand-copied arithmetic expressions, and a copy that dropped `* viewScale` shipped a
// drift bug — folding them here is what makes that class of mistake a single, tested place.
const scenePoint = (ev: MouseEvent): Point => {
  const r = canvas.getBoundingClientRect();
  const o = sceneExtentOrigin();
  return point(
    (ev.clientX - r.left) / viewScale - MARGIN + o.x,
    (ev.clientY - r.top) / viewScale - MARGIN + o.y,
  );
};

// scene → viewport CSS px (left/top). Inverse of `scenePoint`. Returns a `ScreenPoint`, so its result
// can't be fed back into a scene API (`moveNode`, `hitTest`, …) without an obvious second conversion.
const sceneToScreen = (p: Point): ScreenPoint => {
  const r = canvas.getBoundingClientRect();
  const o = sceneExtentOrigin();
  return screenPoint(
    r.left + (MARGIN - o.x + p.x) * viewScale,
    r.top + (MARGIN - o.y + p.y) * viewScale,
  );
};

// Position a DOM overlay at a screen point. Typed to require a `ScreenPoint`, so a raw scene `Point`
// (or a value off the canvas's scene coordinates) can't be used to place an element by mistake.
const positionOverlay = (el: HTMLElement, at: ScreenPoint): void => {
  el.style.left = `${at.x}px`;
  el.style.top = `${at.y}px`;
};

// Show + place the selection context toolbar above the selection's bounding box (flipping below if it
// would clip the stage top). Hidden when nothing is selected or while a gesture is in flight. Positioned
// relative to `.stage-col` (the bar's offset parent), so it stays put as the sheet scrolls inside it.
const CONTEXT_BAR_GAP = 10;
const positionContextBar = (): void => {
  if (
    scene === null ||
    isInteracting() ||
    (selection.nodes.size === 0 && selection.edges.size === 0)
  ) {
    contextBar.hidden = true;
    return;
  }
  const shown = shownScene(scene);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of shown.nodes) {
    if (!selection.nodes.has(node.id)) continue;
    const { origin, size: box } = node.bounds;
    minX = Math.min(minX, origin.x);
    minY = Math.min(minY, origin.y);
    maxX = Math.max(maxX, origin.x + box.width);
    maxY = Math.max(maxY, origin.y + box.height);
  }
  for (const edge of shown.edges) {
    if (!selection.edges.has(edge.id)) continue;
    const a = edgeLabelAnchor(edge.waypoints);
    minX = Math.min(minX, a.x);
    minY = Math.min(minY, a.y);
    maxX = Math.max(maxX, a.x);
    maxY = Math.max(maxY, a.y);
  }
  if (minX === Number.POSITIVE_INFINITY) {
    contextBar.hidden = true;
    return;
  }
  const colRect = stageCol.getBoundingClientRect();
  contextBar.hidden = false; // unhide before measuring so offsetWidth/Height are real
  const cx = (minX + maxX) / 2;
  const above = sceneToScreen(point(cx, minY));
  const bw = contextBar.offsetWidth;
  const bh = contextBar.offsetHeight;
  let top = above.y - colRect.top - bh - CONTEXT_BAR_GAP;
  if (top < 4) {
    // Would clip the stage top — flip below the selection.
    top = sceneToScreen(point(cx, maxY)).y - colRect.top + CONTEXT_BAR_GAP;
  }
  const left = Math.max(4, Math.min(above.x - colRect.left - bw / 2, colRect.width - bw - 4));
  contextBar.style.left = `${left}px`;
  contextBar.style.top = `${Math.max(4, top)}px`;
};

const updateCanvasCursor = (ev: PointerEvent): void => {
  lastPointer = ev;
  if (scene === null) {
    canvas.style.cursor = "";
    return;
  }
  const shown = shownScene(scene);
  const at = scenePoint(ev);
  const hit = hitTest(shown, at);
  // Non-select tools own the cursor outright; select keeps the rich hit-aware feedback below.
  const tool = effectiveTool();
  if (tool === "hand") {
    canvas.style.cursor = "grab";
    return;
  }
  if (tool === "place") {
    canvas.style.cursor = "copy";
    return;
  }
  if (tool === "connect") {
    canvas.style.cursor = hit !== null && hit.kind === "node" ? "crosshair" : "default";
    return;
  }
  const gboxes = groupBoxes(shown);
  if (!viewerMode && resizeAnchorAt(shown, at) !== null) {
    canvas.style.cursor = "nwse-resize";
  } else if (ev.altKey && !viewerMode && hit !== null && hit.kind === "node") {
    canvas.style.cursor = "crosshair";
  } else if (
    hit !== null &&
    hit.kind === "node" &&
    !viewerMode &&
    !pathLocked(doc.groups(), hit.id)
  ) {
    canvas.style.cursor = "grab";
  } else if (
    hit !== null ||
    groupTitleAt(gboxes, at) !== null ||
    groupOutlineAt(gboxes, at) !== null ||
    groupAt(gboxes, at) !== null
  ) {
    canvas.style.cursor = "pointer";
  } else {
    canvas.style.cursor = "grab";
  }
};

const TOOL_LABELS: Record<Tool, string> = {
  select: "Select",
  hand: "Hand",
  connect: "Connect",
  place: "Place node",
};

// Recompute the canvas cursor for the current tool without waiting for a pointer move.
const refreshCursor = (): void => {
  if (lastPointer !== null) updateCanvasCursor(lastPointer);
};

// Arm a tool. Connect/place are clamped to the families that support them and rejected *loudly*
// (announced) rather than silently switching; a viewer may only select/hand. Repaints palette + cursor.
const setTool = (t: Tool): void => {
  if (t === "connect" && !(ast !== null && familyAffordances(ast.kind).connect)) {
    setStatusAndAnnounce(
      "ok",
      `the connect tool isn't available for ${ast === null ? "this diagram" : ast.kind}`,
    );
    return;
  }
  if (t === "place" && !(ast !== null && ast.kind === "flowchart")) {
    setStatusAndAnnounce("ok", "the place tool adds flowchart nodes");
    return;
  }
  if (viewerMode && t !== "select" && t !== "hand") return;
  activeTool = t;
  stageWrap.setAttribute("data-tool", t);
  syncToolPalette();
  // Announce to the live region only — `setStatus` would overwrite the canvas's diagram aria-label
  // (the SR text alternative) with the transient tool name. The palette's active state is the visual cue.
  announce(`${TOOL_LABELS[t]} tool`);
  refreshCursor();
};

// Place tool: drop a fresh flowchart node at the clicked point, pin it, select it, return to select.
// Mirrors `duplicateSelection`'s add-then-pin pattern — node geometry never enters the source text.
const placeNodeAt = async (at: Point): Promise<void> => {
  if (viewerMode || ast === null || ast.kind !== "flowchart") return;
  const used = new Set<string>(ast.nodes.map((n) => n.id));
  let n = 1;
  while (used.has(`n${n}`)) n++;
  const id = `n${n}`;
  editor.setValue(addNode(editor.value(), brand<string, "NodeId">(id), `node ${n}`, "rect"));
  await renderFromText(editor.value());
  if (scene === null) return;
  const sid = brand<string, "SceneNodeId">(id);
  doc.record();
  doc.moveNode(sid, at);
  doc.persist();
  selection = { nodes: new Set([sid]), edges: new Set() };
  selectionOrder = [sid];
  paintScene();
  updateGroupButtons();
  setTool("select");
  announce(`placed node ${n}`);
};

for (const t of TOOL_ORDER) {
  TOOL_BUTTONS[t].addEventListener("click", () => setTool(t));
}
// Roving-tabindex arrow navigation within the palette (APG radiogroup), skipping disabled tools.
toolPalette.addEventListener("keydown", (ev) => {
  const forward = ev.key === "ArrowDown" || ev.key === "ArrowRight";
  const backward = ev.key === "ArrowUp" || ev.key === "ArrowLeft";
  if (!forward && !backward) return;
  ev.preventDefault();
  const enabled = TOOL_ORDER.filter((t) => !TOOL_BUTTONS[t].disabled);
  if (enabled.length === 0) return;
  const cur = enabled.indexOf(activeTool);
  const base = cur < 0 ? 0 : cur;
  const next =
    enabled[forward ? (base + 1) % enabled.length : (base - 1 + enabled.length) % enabled.length];
  if (next !== undefined) {
    setTool(next);
    TOOL_BUTTONS[next].focus();
  }
});
syncToolPalette();

canvas.addEventListener("pointerdown", (ev) => {
  if (scene === null) return;
  nudging = false; // a click ends any nudge run, so the next nudge is a new undo entry
  const shown = shownScene(scene);
  const at = scenePoint(ev);
  const hit = hitTest(shown, at);
  const groupHit = hit === null ? groupHitAt(shown, at) : null;
  const tool = effectiveTool();
  // Place tool: a click drops a new node at the pointer (flowchart only), then snaps back to select.
  if (tool === "place" && ast !== null && ast.kind === "flowchart" && !viewerMode) {
    ev.preventDefault();
    void placeNodeAt(at);
    return;
  }
  // Hand tool: a drag always pans, even when it starts over a node.
  if (tool === "hand") {
    pan = {
      startX: screenCoord(ev.clientX),
      startY: screenCoord(ev.clientY),
      scrollLeft: stageWrap.scrollLeft,
      scrollTop: stageWrap.scrollTop,
    };
    canvas.setPointerCapture(ev.pointerId);
    canvas.style.cursor = "grabbing";
    return;
  }
  // Shift or the platform command key adds to the selection — accept Ctrl too, so additive-click works
  // on Windows/Linux (the help panel advertises "Ctrl click" there).
  const additive = ev.shiftKey || ev.metaKey || ev.ctrlKey;

  // ⌥-drag from a node (or any drag from a node under the Connect tool) starts a connect — a rubber-band
  // to the cursor, an edge on release over another node — before the resize/move paths. Viewers can't.
  if ((ev.altKey || tool === "connect") && !viewerMode && hit !== null && hit.kind === "node") {
    const src = shown.nodes.find((nd) => nd.id === hit.id);
    if (src !== undefined) {
      ev.preventDefault();
      connectDrag = {
        from: hit.id,
        fromX: src.bounds.origin.x + src.bounds.size.width / 2,
        fromY: src.bounds.origin.y + src.bounds.size.height / 2,
        x: at.x,
        y: at.y,
      };
      canvas.setPointerCapture(ev.pointerId);
      return;
    }
  }

  // A corner handle of the single selected node starts a resize (takes priority over re-selecting
  // the node under the corner). Shift/⌘ is multi-select intent, so skip resize then; a viewer never
  // resizes (read-only).
  const resizeStart = additive || viewerMode ? null : resizeAnchorAt(shown, at);
  if (resizeStart !== null) {
    resize = resizeStart;
    resizeRecorded = false;
    snapGuides = { vx: null, hy: null };
    // The moving corner snaps to other nodes' alignment lines, like a single-node drag.
    snapTargets = { ...snapCandidates(shown.nodes, resizeStart.id), w: 0, h: 0 };
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
  if (hit !== null && hit.kind === "node" && !pathLocked(doc.groups(), hit.id) && !viewerMode) {
    const moveIds = new Set<SceneNodeId>();
    for (const id of selection.nodes) {
      const top = topGroupOfNode(doc.groups(), id);
      if (top === null) moveIds.add(id);
      else for (const leaf of leafNodes(doc.groups(), top)) moveIds.add(leaf);
    }
    const origin = new Map<SceneNodeId, Point>();
    for (const node of shown.nodes) {
      if (moveIds.has(node.id))
        origin.set(node.id, point(node.bounds.origin.x, node.bounds.origin.y));
    }
    drag = { ids: [...origin.keys()], origin, pointerX: at.x, pointerY: at.y };
    dragRecorded = false;
    snapGuides = { vx: null, hy: null };
    // Snap only a single-node drag: capture every *other* node's edge/centre lines as snap candidates.
    snapTargets = null;
    if (origin.size === 1) {
      const dragged = hit.id;
      const me = shown.nodes.find((nd) => nd.id === dragged);
      if (me !== undefined) {
        const { xs, ys } = snapCandidates(shown.nodes, dragged);
        snapTargets = { xs, ys, w: me.bounds.size.width, h: me.bounds.size.height };
      }
    }
    canvas.setPointerCapture(ev.pointerId);
  } else if (hit === null) {
    pan = {
      startX: screenCoord(ev.clientX),
      startY: screenCoord(ev.clientY),
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
  if (connectDrag !== null) {
    const at = scenePoint(ev);
    connectDrag = { ...connectDrag, x: at.x, y: at.y };
    requestPaint();
    return;
  }
  if (resize !== null) {
    const at = scenePoint(ev);
    if (!resizeRecorded) {
      doc.record();
      resizeRecorded = true;
    }
    const rawW = at.x - resize.anchorX;
    const rawH = at.y - resize.anchorY;
    // Snap the moving corner to nearby alignment lines; the min-size clamp can pull it back off a line,
    // so derive the guides from the *final* corner and only show one when the corner actually lands on it.
    let snapX: number = at.x;
    let snapY: number = at.y;
    let vx: number | null = null;
    let hy: number | null = null;
    if (snapTargets !== null) {
      const sx = snapAxis([at.x], snapTargets.xs);
      const sy = snapAxis([at.y], snapTargets.ys);
      snapX += sx.delta;
      snapY += sy.delta;
      vx = sx.line;
      hy = sy.line;
    }
    const w = Math.max(RESIZE_MIN_W, Math.abs(snapX - resize.anchorX));
    const h = Math.max(RESIZE_MIN_H, Math.abs(snapY - resize.anchorY));
    const cornerX = resize.anchorX + (rawW >= 0 ? w : -w);
    const cornerY = resize.anchorY + (rawH >= 0 ? h : -h);
    snapGuides = {
      vx: vx !== null && Math.abs(cornerX - vx) <= 0.5 ? vx : null,
      hy: hy !== null && Math.abs(cornerY - hy) <= 0.5 ? hy : null,
    };
    doc.resizeNode(
      resize.id,
      point(Math.min(resize.anchorX, cornerX), Math.min(resize.anchorY, cornerY)),
      size(w, h),
    );
    requestPaint();
    return;
  }
  if (marquee !== null) {
    const at = scenePoint(ev);
    marquee = { ...marquee, x1: at.x, y1: at.y };
    requestPaint();
    return;
  }
  if (pan !== null) {
    stageWrap.scrollLeft = pan.scrollLeft - (ev.clientX - pan.startX);
    stageWrap.scrollTop = pan.scrollTop - (ev.clientY - pan.startY);
    return;
  }
  if (drag === null) {
    updateCanvasCursor(ev);
    return;
  }
  const at = scenePoint(ev);
  let dx = at.x - drag.pointerX;
  let dy = at.y - drag.pointerY;
  if (!dragRecorded && (dx !== 0 || dy !== 0)) {
    doc.record();
    dragRecorded = true;
  }
  // Single-node drag snaps its edges/centre to nearby nodes' lines; the snapped lines become guides.
  const single = snapTargets !== null && drag.ids.length === 1 ? drag.ids[0] : undefined;
  const start = single === undefined ? undefined : drag.origin.get(single);
  if (snapTargets !== null && start !== undefined) {
    const nx = start.x + dx;
    const ny = start.y + dy;
    const sx = snapAxis([nx, nx + snapTargets.w / 2, nx + snapTargets.w], snapTargets.xs);
    const sy = snapAxis([ny, ny + snapTargets.h / 2, ny + snapTargets.h], snapTargets.ys);
    dx += sx.delta;
    dy += sy.delta;
    snapGuides = { vx: sx.line, hy: sy.line };
  } else {
    snapGuides = { vx: null, hy: null };
  }
  for (const id of drag.ids) {
    const o = drag.origin.get(id);
    if (o !== undefined) doc.moveNode(id, point(o.x + dx, o.y + dy));
  }
  requestPaint();
});

canvas.addEventListener("pointerleave", () => {
  if (
    drag === null &&
    resize === null &&
    pan === null &&
    marquee === null &&
    connectDrag === null
  ) {
    canvas.style.cursor = "";
  }
});

canvas.addEventListener("pointerup", (ev) => {
  if (connectDrag !== null) {
    canvas.releasePointerCapture(ev.pointerId);
    const cd = connectDrag;
    connectDrag = null;
    const target = scene === null ? null : hitTest(shownScene(scene), scenePoint(ev));
    if (ast !== null && target !== null && target.kind === "node" && target.id !== cd.from) {
      editor.setValue(appendEdge(ast.kind, editor.value(), cd.from, target.id));
      void renderFromText(editor.value());
    } else {
      paintScene(); // released on empty space / the same node — clear the rubber-band
    }
    return;
  }
  if (resize !== null) {
    canvas.releasePointerCapture(ev.pointerId);
    resize = null;
    snapTargets = null;
    snapGuides = { vx: null, hy: null };
    doc.persist();
    requestPaint(); // clear any guides + refresh the minimap (deferred during the resize)
    return;
  }
  if (marquee !== null) {
    canvas.releasePointerCapture(ev.pointerId);
    const box = marquee;
    marquee = null;
    if (scene !== null) {
      const shown = shownScene(scene);
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
    snapTargets = null;
    snapGuides = { vx: null, hy: null };
    doc.persist();
    requestPaint(); // clear any guides + refresh the minimap (deferred during the drag)
  }
});

// Inline label editor: a small overlay <input> over the double-clicked element, committing on
// Enter/blur and cancelling on Escape — an in-place rename instead of a modal `window.prompt`.
// One editor at a time; `closeEditor` tears down the current one before another opens.
type Anchor = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
let closeEditor: ((apply: boolean) => void) | null = null;

const openInlineEditor = (
  anchor: Anchor,
  value: string,
  commit: (next: string) => void,
  announceCommit: (next: string) => void,
): void => {
  closeEditor?.(false);
  inlineEl.value = value;
  // The anchor is in scene coordinates; map it to screen through the shared `sceneToScreen` (the sole
  // inverse of `scenePoint`) so the overlay sits on its target after a zoom/Fit — it previously
  // re-derived the transform inline and a dropped `* viewScale` made it drift off the element.
  // Recomputed on scroll/resize while open, since the stage scrolls and the canvas rect is viewport-relative.
  const place = (): void => {
    positionOverlay(inlineEl, sceneToScreen(point(anchor.x, anchor.y)));
    inlineEl.style.width = `${Math.max(64, anchor.w * viewScale)}px`;
    inlineEl.style.height = `${Math.max(24, anchor.h * viewScale)}px`;
  };
  place();
  // `true` capture so a scroll on the stage container (not just window) repositions the overlay.
  window.addEventListener("scroll", place, true);
  window.addEventListener("resize", place);
  inlineEl.hidden = false;
  inlineEl.focus();
  inlineEl.select();
  closeEditor = (apply) => {
    closeEditor = null;
    window.removeEventListener("scroll", place, true);
    window.removeEventListener("resize", place);
    inlineEl.hidden = true;
    inlineEl.onkeydown = null;
    inlineEl.onblur = null;
    if (apply) {
      commit(inlineEl.value);
      if (inlineEl.value !== value) announceCommit(inlineEl.value);
    }
  };
  inlineEl.onkeydown = (e) => {
    // Stop Enter/Escape from also reaching the window handler (which would clear the selection).
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      closeEditor?.(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
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
  if (e === undefined) return null;
  const anchor = edgeLabelAnchor(e.waypoints); // waypoints is TwoOrMore — always anchorable
  return { x: anchor.x - 40, y: anchor.y - 12, w: 80, h: 24 };
};

// Two-way edit: rename what was double-clicked and write the patch back into the source text.
// Open the inline relabel editor for a hit (a node/edge, or a group title) — shared by the canvas
// double-click and the keyboard navigator's Enter. `ast`/source maps are read from module state.
// Returns true when an editor was opened.
const beginRelabel = (shown: Scene, hit: HitTarget | null, groupHit: GroupId | null): boolean => {
  if (ast === null) return false;
  // Most families edit a `TextSpan` via `patchSpan`; flowchart nodes relabel through the source map.
  // The character immediately before the label span is its opening delimiter — it tells us which
  // closer the new text must not contain, so a label with a stray `|`/`"`/`]` can't terminate the
  // token early and write un-parseable source. We validate loudly and reject rather than corrupt.
  const contextFor = (text: string, span: TextSpan): LabelContext => {
    const opener = span.start > 0 ? text[span.start - 1] : "";
    if (opener === "|") return "pipe";
    if (opener === '"') return "quoted";
    if (opener === "[" || opener === "(" || opener === "{") return "flowchartBracket";
    return "plain";
  };
  const patchAt = (
    span: TextSpan,
  ): { readonly text: string; readonly commit: (n: string) => void } => ({
    text: editor.value().slice(span.start, span.end),
    commit: (next) => {
      if (next === editor.value().slice(span.start, span.end)) return;
      const checked = validateLabel(next, contextFor(editor.value(), span));
      if (!isOk(checked)) {
        console.error("relabel rejected:", checked.error.message);
        setStatusAndAnnounce("error", `can't rename — ${checked.error.message}`);
        return;
      }
      editor.setValue(patchSpan(editor.value(), span, next));
      void renderFromText(editor.value());
    },
  });

  let pending: { readonly text: string; readonly commit: (n: string) => void } | null = null;
  let anchor: Anchor | null = null;

  if (groupHit !== null) {
    const box = groupBoxes(shown).find((g) => g.id === groupHit);
    const g = doc.groups().get(groupHit);
    if (box !== undefined && g !== undefined) {
      anchor = { x: box.x + 16, y: box.y, w: Math.max(96, box.w - 32), h: 24 };
      pending = {
        text: g.label,
        commit: (next) => {
          if (next === g.label) return;
          doc.record();
          doc.setGroupLabel(groupHit, next);
          doc.persist();
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
            setStatusAndAnnounce("error", `can't rename — ${patched.error.message}`);
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
  } else if (hit !== null && ast.kind === "class" && classSource !== null) {
    const span =
      hit.kind === "node"
        ? classSource.entities.get(brand<string, "ClassEntityId">(hit.id))
        : classSource.relationships.get(brand<string, "ClassRelId">(hit.id));
    if (span !== undefined) pending = patchAt(span);
  } else if (hit !== null && ast.kind === "requirement" && reqSource !== null) {
    // Entity names and relationship verbs are both editable (the verb is the edge label); re-typing a
    // verb to another of the seven round-trips, an invalid one fails the parse loudly.
    const span =
      hit.kind === "node"
        ? reqSource.entities.get(brand<string, "ReqEntityId">(hit.id))
        : reqSource.relationships.get(brand<string, "ReqRelId">(hit.id));
    if (span !== undefined) pending = patchAt(span);
  } else if (hit !== null && ast.kind === "gitGraph" && gitSource !== null) {
    // Only a commit with an explicit `id: "…"` is relabel-able; branch heads and auto-id commits
    // carry no span, so they simply don't open the editor.
    const span =
      hit.kind === "node" ? gitSource.commits.get(brand<string, "GitCommitId">(hit.id)) : undefined;
    if (span !== undefined) pending = patchAt(span);
  } else if (
    hit !== null &&
    ast.kind === "timeline" &&
    timelineSource !== null &&
    hit.kind === "node"
  ) {
    // Periods and events are both editable; section bands (and the spine) carry no span.
    const span =
      timelineSource.periods.get(brand<string, "TimelinePeriodId">(hit.id)) ??
      timelineSource.events.get(brand<string, "TimelineEventId">(hit.id));
    if (span !== undefined) pending = patchAt(span);
  } else if (
    hit !== null &&
    ast.kind === "mindmap" &&
    mindmapSource !== null &&
    hit.kind === "node"
  ) {
    const span = mindmapSource.nodes.get(brand<string, "MindmapNodeId">(hit.id));
    if (span !== undefined) pending = patchAt(span);
  } else if (hit !== null && ast.kind === "gantt" && ganttSource !== null && hit.kind === "node") {
    // A task bar / milestone relabels through its label span; the day-axis chrome carries no span.
    const span = ganttSource.tasks.get(brand<string, "GanttTaskId">(hit.id));
    if (span !== undefined) pending = patchAt(span);
  }

  if (pending === null) return false;
  anchor = anchor ?? (hit === null ? null : anchorFor(shown, hit));
  if (anchor === null) return false;
  openInlineEditor(anchor, pending.text, pending.commit, () => announce("relabel committed"));
  return true;
};

canvas.addEventListener("dblclick", (ev) => {
  if (scene === null || ast === null || viewerMode) return; // a viewer can't rename
  const shown = shownScene(scene);
  const at = scenePoint(ev);
  const hit = hitTest(shown, at);
  const groupHit = hit === null ? groupHitAt(shown, at) : null;
  beginRelabel(shown, hit, groupHit);
});

// Add node: append a fresh rect node to the flowchart text (flowchart only for now).
addBtn.addEventListener("click", () => {
  if (viewerMode || ast === null || ast.kind !== "flowchart") return;
  const used = new Set<string>(ast.nodes.map((n) => n.id));
  let n = 1;
  while (used.has(`n${n}`)) n++;
  editor.setValue(addNode(editor.value(), brand<string, "NodeId">(`n${n}`), `node ${n}`, "rect"));
  void renderFromText(editor.value());
  announce(`added node ${n}`);
});

// Duplicate the selected flowchart node(s) (⌘D): append a fresh-id copy of each (same label + shape)
// to the source, then — after the re-layout — pin each copy just off its original via an override and
// select the copies. (Edges aren't copied; the duplicates are loose, like Add node.)
const duplicateSelection = async (): Promise<void> => {
  if (viewerMode || ast === null || ast.kind !== "flowchart" || selectionOrder.length === 0) return;
  const nodeById = new Map(ast.nodes.map((nd) => [nd.id, nd]));
  const used = new Set<string>(ast.nodes.map((nd) => nd.id));
  let next = 1;
  const pairs: Array<{ readonly from: SceneNodeId; readonly to: SceneNodeId }> = [];
  let text = editor.value();
  for (const id of selectionOrder) {
    const orig = nodeById.get(brand<string, "NodeId">(id));
    if (orig === undefined) continue;
    while (used.has(`n${next}`)) next++;
    const newId = `n${next}`;
    used.add(newId);
    text = addNode(text, brand<string, "NodeId">(newId), orig.label, orig.shape);
    pairs.push({ from: id, to: brand<string, "SceneNodeId">(newId) });
  }
  if (pairs.length === 0) return;
  editor.setValue(text);
  await renderFromText(text);
  if (scene === null) return;
  const posById = new Map(shownScene(scene).nodes.map((nd) => [nd.id, nd.bounds.origin]));
  doc.record();
  for (const { from, to } of pairs) {
    const p = posById.get(from);
    if (p !== undefined) doc.moveNode(to, point(p.x + 28, p.y + 28));
  }
  doc.persist();
  selection = { nodes: new Set(pairs.map((p) => p.to)), edges: new Set() };
  selectionOrder = pairs.map((p) => p.to);
  paintScene();
  updateGroupButtons();
  announce(`duplicated ${pairs.length} node${pairs.length === 1 ? "" : "s"}`);
};

// In-memory node clipboard for ⌘C/⌘V (flowchart). Each entry is a node's label + shape and its offset
// from the copied group's top-left, so a multi-node paste keeps the arrangement. It persists across
// edits (copy once, paste repeatedly), and `pasteSeq` cascades successive pastes so a paste doesn't
// stack exactly on the previous one. Edges aren't copied — the pasted nodes are loose, like Add node.
let nodeClipboard: ReadonlyArray<{
  readonly label: string;
  readonly shape: NodeShape;
  readonly dx: number;
  readonly dy: number;
}> | null = null;
let clipboardOrigin: Point | null = null;
let pasteSeq = 0;

const copySelection = (): void => {
  if (viewerMode || ast === null || ast.kind !== "flowchart" || scene === null) return;
  const byId = new Map(shownScene(scene).nodes.map((nd) => [nd.id, nd]));
  const picked = selectionOrder.flatMap((id) => {
    const nd = byId.get(id);
    return nd === undefined ? [] : [nd];
  });
  if (picked.length === 0) return;
  const minX = picked.reduce((m, nd) => Math.min(m, nd.bounds.origin.x), Number.POSITIVE_INFINITY);
  const minY = picked.reduce((m, nd) => Math.min(m, nd.bounds.origin.y), Number.POSITIVE_INFINITY);
  nodeClipboard = picked.map((nd) => ({
    label: nd.label,
    shape: nd.shape,
    dx: nd.bounds.origin.x - minX,
    dy: nd.bounds.origin.y - minY,
  }));
  clipboardOrigin = point(minX, minY);
  pasteSeq = 0;
  setStatusAndAnnounce("ok", `copied ${picked.length} node${picked.length === 1 ? "" : "s"}`);
};

const pasteClipboard = async (): Promise<void> => {
  if (viewerMode || ast === null || ast.kind !== "flowchart") return;
  const clip = nodeClipboard;
  const origin = clipboardOrigin;
  if (clip === null || origin === null) return;
  const used = new Set<string>(ast.nodes.map((nd) => nd.id));
  let next = 1;
  const created: Array<{ readonly id: SceneNodeId; readonly dx: number; readonly dy: number }> = [];
  let text = editor.value();
  for (const c of clip) {
    while (used.has(`n${next}`)) next++;
    const newId = `n${next}`;
    used.add(newId);
    text = addNode(text, brand<string, "NodeId">(newId), c.label, c.shape);
    created.push({ id: brand<string, "SceneNodeId">(newId), dx: c.dx, dy: c.dy });
  }
  if (created.length === 0) return;
  pasteSeq += 1;
  editor.setValue(text);
  await renderFromText(text);
  doc.record();
  const off = 28 * pasteSeq;
  for (const c of created) {
    doc.moveNode(c.id, point(origin.x + off + c.dx, origin.y + off + c.dy));
  }
  doc.persist();
  selection = { nodes: new Set(created.map((c) => c.id)), edges: new Set() };
  selectionOrder = created.map((c) => c.id);
  paintScene();
  updateGroupButtons();
  announce(`pasted ${created.length} node${created.length === 1 ? "" : "s"}`);
};

// Connect: chain the shift-selected nodes in click order — one edge per consecutive pair
// (A→B→C…), in each family's own edge syntax — directed `-->` (flowchart/block), undirected `--`
// (network/cloud), `Rel(a,b,"")` (C4), or a `A->>B: message` (sequence). Two selected makes a single
// edge (the common case); 3+ builds the whole chain in one action.
connectBtn.addEventListener("click", () => {
  if (viewerMode || ast === null || selectionOrder.length < 2) return;
  const before = editor.value();
  let text = editor.value();
  for (let i = 0; i + 1 < selectionOrder.length; i++) {
    const from = selectionOrder[i];
    const to = selectionOrder[i + 1];
    if (from === undefined || to === undefined) continue;
    text = appendEdge(ast.kind, text, from, to);
  }
  if (text === before) {
    announce("connect isn't available for this diagram");
    return;
  }
  editor.setValue(text);
  void renderFromText(text);
  announce(
    `connected ${selectionOrder.length - 1} edge${selectionOrder.length - 1 === 1 ? "" : "s"}`,
  );
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
    case "class":
      return connectClass(
        text,
        brand<string, "ClassEntityId">(first),
        brand<string, "ClassEntityId">(second),
      );
    case "requirement":
      return connectRequirement(
        text,
        brand<string, "ReqEntityId">(first),
        brand<string, "ReqEntityId">(second),
      );
    // The flowchart `A --> B` arrow syntax — valid in the families whose node ids it can name.
    case "flowchart":
    case "block":
    case "state":
      return connect(
        text,
        brand<string, "NodeId">(first),
        brand<string, "NodeId">(second),
        "arrow",
      );
    // No edge to draw: gantt/pie have no edge concept, and gitGraph/timeline/mindmap grammars would
    // reject the flowchart `A --> B` arrow (it would grey the diagram). Connect is a no-op for all of
    // them — `familyAffordances` also disables the button so this branch is defence-in-depth.
    case "gitGraph":
    case "timeline":
    case "mindmap":
    case "pie":
    case "gantt":
      return text;
    default:
      return assertNever(kind);
  }
};

// Remove a node/element/actor in the family's own syntax.
const removeNode = (kind: DiagramAst["kind"], text: string, id: SceneNodeId): string => {
  switch (kind) {
    case "c4":
      return deleteC4(text, brand<string, "C4ElementId">(id));
    case "sequence":
      return deleteActor(text, brand<string, "ActorId">(id));
    // Compartment families have `id { … }` bodies; line-based `deleteNode` would orphan the body +
    // closing brace, so each removes its whole block + incident relationships.
    case "er":
      return deleteErEntity(text, brand<string, "ErEntityId">(id));
    case "class":
      return deleteClassEntity(text, brand<string, "ClassEntityId">(id));
    case "requirement":
      return deleteRequirementEntity(text, brand<string, "ReqEntityId">(id));
    // Composite states own a `{ … }` body that line-based `deleteNode` would orphan.
    case "state":
      return deleteStateEntity(text, brand<string, "StateId">(id));
    // Families whose nodes are single declaration lines: the line-based removal is correct.
    case "flowchart":
    case "block":
    case "network":
    case "cloud":
    case "gitGraph":
    case "timeline":
    case "mindmap":
    case "pie":
      return deleteNode(text, brand<string, "NodeId">(id));
    // gantt: a task has no id in the text when it's auto-numbered, so delete its line by the label
    // span from the source map. Multi-delete is ordered bottom-up by the caller so spans stay valid.
    case "gantt": {
      if (ganttSource === null) return text;
      const span = ganttSource.tasks.get(brand<string, "GanttTaskId">(id));
      return span === undefined ? text : deleteGanttTask(text, span);
    }
    default:
      return assertNever(kind);
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
    case "class":
      return deleteClassRel(
        text,
        brand<string, "ClassEntityId">(from),
        brand<string, "ClassEntityId">(to),
      );
    case "requirement":
      return deleteRequirementRel(
        text,
        brand<string, "ReqEntityId">(from),
        brand<string, "ReqEntityId">(to),
      );
    // Families whose edges are single `from <op> to` lines: the line-based removal is correct.
    case "flowchart":
    case "block":
    case "network":
    case "cloud":
    case "state":
    case "gitGraph":
    case "timeline":
    case "mindmap":
    case "pie":
      return deleteEdge(text, brand<string, "NodeId">(from), brand<string, "NodeId">(to));
    // gantt has no drawn edges to remove.
    case "gantt":
      return text;
    default:
      return assertNever(kind);
  }
};

// The source offset of a Gantt task's label span (−1 if unknown) — orders multi-task deletes bottom-up.
const ganttLineStart = (id: SceneNodeId): number =>
  ganttSource?.tasks.get(brand<string, "GanttTaskId">(id))?.start ?? -1;

// Remove the selected nodes (and their edges) from the source text in the active family's syntax.
// Shared by the Delete key and the selection context toolbar's Delete button.
const deleteSelection = (): void => {
  if (viewerMode || ast === null) return;
  if (selectionOrder.length === 0 && selection.edges.size === 0) return;
  const kind = ast.kind;
  let text = editor.value();
  // gantt deletes by source-line span, so apply them bottom-up: removing a lower line never shifts an
  // earlier line's offset, keeping each remaining span valid against the prior edit.
  const order =
    kind === "gantt" && ganttSource !== null
      ? [...selectionOrder].sort((a, b) => ganttLineStart(b) - ganttLineStart(a))
      : selectionOrder;
  const removedCount = order.length + selection.edges.size;
  for (const id of order) text = removeNode(kind, text, id);
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
  // Announce the outcome so a keyboard/screen-reader user isn't left guessing after the canvas changes.
  setStatusAndAnnounce(
    "ok",
    `deleted ${removedCount} item${removedCount === 1 ? "" : "s"} — undo in the editor`,
  );
};

// Delete key removes the selection. Guarded on the editor / a text field not being focused so it never
// hijacks a Backspace while editing.
window.addEventListener("keydown", (ev) => {
  if (ev.key !== "Delete" && ev.key !== "Backspace") return;
  if (editor.hasFocus()) return;
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
  if (viewerMode || ast === null) return;
  if (selectionOrder.length === 0 && selection.edges.size === 0) return;
  ev.preventDefault();
  deleteSelection();
});

// Undo/redo for canvas (overlay) actions — drag, group/ungroup/lock, group label, regenerate. Only
// when the editor isn't focused, so CodeMirror keeps ⌘Z for the source text; the two histories don't
// fight (text in CodeMirror, layout/groups here).
window.addEventListener("keydown", (ev) => {
  if (editor.hasFocus()) return;
  if (!ev.metaKey && !ev.ctrlKey) return;
  const key = ev.key.toLowerCase();
  if ((key === "z" || key === "y") && viewerMode) return; // a viewer has no overlay edits to undo/redo
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
  } else if (key === "d") {
    // Duplicate the selected flowchart node(s) (overriding the browser's ⌘D bookmark).
    if (viewerMode || selectionOrder.length === 0) return;
    ev.preventDefault();
    void duplicateSelection();
  } else if (key === "c") {
    // Copy the selected flowchart node(s) to the in-memory clipboard. With nothing selected (or off
    // flowchart) we don't preventDefault, so the browser's own copy still works.
    if (viewerMode || ast === null || ast.kind !== "flowchart" || selectionOrder.length === 0)
      return;
    ev.preventDefault();
    copySelection();
  } else if (key === "v") {
    // Paste the clipboard's node(s) as fresh-id copies; left to the browser when the clipboard is empty.
    if (viewerMode || nodeClipboard === null) return;
    ev.preventDefault();
    void pasteClipboard();
  }
});

// Every leaf node the selection can move: a selected loose node, or all leaves of a selected node's
// group — minus anything under a locked group (which is selectable but not movable, like drag).
const movableSelectionLeaves = (): SceneNodeId[] => {
  const ids = new Set<SceneNodeId>();
  for (const id of selection.nodes) {
    if (pathLocked(doc.groups(), id)) continue;
    const top = topGroupOfNode(doc.groups(), id);
    if (top === null) ids.add(id);
    else for (const leaf of leafNodes(doc.groups(), top)) ids.add(leaf);
  }
  return [...ids];
};

// Arrow-key nudge: fine positioning to complement coarse drag (Shift = a bigger step). A run of
// nudges shares one undo entry. Escape clears the selection.
const nudgeSelection = (dx: number, dy: number): void => {
  if (scene === null || viewerMode) return;
  const ids = movableSelectionLeaves();
  if (ids.length === 0) return;
  const shown = shownScene(scene);
  const origin = new Map(shown.nodes.map((n) => [n.id, n.bounds.origin]));
  if (!nudging) {
    doc.record();
    nudging = true;
  }
  for (const id of ids) {
    const at = origin.get(id);
    if (at !== undefined) doc.moveNode(id, point(at.x + dx, at.y + dy));
  }
  doc.persist();
  paintScene();
};

// Cycle the selected flowchart node(s) through the shapes (rect → round → stadium → circle → diamond),
// rewriting each declaration's brackets via `reshapeNode`. Edits are applied back-to-front (by source
// position) so an earlier rewrite can't shift the offsets of a later one within the same pass.
const SHAPE_CYCLE: readonly NodeShape[] = ["rect", "round", "stadium", "circle", "diamond"];
const cycleShape = async (): Promise<void> => {
  if (viewerMode || ast === null || ast.kind !== "flowchart" || source === null) return;
  const src = source;
  const nodeById = new Map(ast.nodes.map((nd) => [nd.id, nd]));
  const targets = selectionOrder
    .flatMap((id) => {
      const nid = brand<string, "NodeId">(id);
      const node = nodeById.get(nid);
      const spans = src.nodes.get(nid);
      return node === undefined || spans === undefined
        ? []
        : [{ nid, node, start: spans.decl.start }];
    })
    .sort((a, b) => b.start - a.start);
  if (targets.length === 0) return;
  let text = editor.value();
  for (const t of targets) {
    const idx = SHAPE_CYCLE.indexOf(t.node.shape);
    const next = SHAPE_CYCLE[(idx + 1) % SHAPE_CYCLE.length] ?? "rect";
    const out = reshapeNode(text, src, t.nid, t.node.label, next);
    if (isOk(out)) text = out.value;
  }
  const keep = selectionOrder.map((id) => brand<string, "SceneNodeId">(id));
  editor.setValue(text);
  await renderFromText(text);
  selection = { nodes: new Set(keep), edges: new Set() };
  selectionOrder = keep;
  paintScene();
  updateGroupButtons();
  canvas.focus({ preventScroll: true });
};

// The selection context toolbar is a thin view over the existing handlers — each button delegates to
// the same code path as its keyboard shortcut / workbench control, so there's a single source of truth.
ctxRelabelBtn.addEventListener("click", () => {
  if (scene === null) return;
  const edgeId = [...selection.edges][0];
  const nodeId = selectionOrder[0];
  const hit: HitTarget | null =
    selection.edges.size > 0 && selectionOrder.length === 0 && edgeId !== undefined
      ? { kind: "edge", id: edgeId }
      : nodeId !== undefined
        ? { kind: "node", id: nodeId }
        : null;
  if (hit !== null) beginRelabel(shownScene(scene), hit, null);
});
ctxShapeBtn.addEventListener("click", () => void cycleShape());
ctxDuplicateBtn.addEventListener("click", () => void duplicateSelection());
ctxConnectBtn.addEventListener("click", () => connectBtn.click());
ctxGroupBtn.addEventListener("click", () => groupBtn.click());
ctxUngroupBtn.addEventListener("click", () => ungroupBtn.click());
ctxLockBtn.addEventListener("click", () => lockBtn.click());
ctxArrangeBtn.addEventListener("click", () => arrangeBtn.click());
ctxDeleteBtn.addEventListener("click", deleteSelection);

window.addEventListener("keydown", (ev) => {
  if (editor.hasFocus()) return;
  if (ev.key === "Escape") {
    // Escape first disarms a non-default tool (back to Select); a second Escape clears the selection.
    if (activeTool !== "select") {
      ev.preventDefault();
      setTool("select");
      return;
    }
    if (selection.nodes.size === 0 && selection.edges.size === 0) return;
    selection = emptySelection;
    selectionOrder = [];
    nudging = false;
    paintScene();
    updateGroupButtons();
    return;
  }
  if (ev.metaKey || ev.ctrlKey) return; // leave ⌘-combos to the other handlers / the browser
  // A focused text field (icon-filter, inline rename, the family <select>) keeps its own keys — never
  // hijack a letter/arrow/Space.
  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  ) {
    return;
  }
  // The keyboard diagram navigator owns arrow keys (and its own two-step `c` connect) when focused, so
  // don't also run the global nudge / tool switch on every navigation step.
  if (active === diagramNav) return;
  // Hold Space to temporarily pan (whiteboard-style), released on keyup/blur.
  if (ev.key === " ") {
    ev.preventDefault();
    if (!spaceHeld) {
      spaceHeld = true;
      refreshCursor();
    }
    return;
  }
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
    case "v":
    case "V":
      ev.preventDefault();
      setTool("select");
      break;
    case "h":
    case "H":
      ev.preventDefault();
      setTool("hand");
      break;
    case "c":
    case "C":
      ev.preventDefault();
      setTool("connect");
      break;
    case "p":
    case "P":
      ev.preventDefault();
      setTool("place");
      break;
    case "s":
    case "S":
      if (viewerMode || ast === null || ast.kind !== "flowchart" || selectionOrder.length === 0) {
        return;
      }
      ev.preventDefault();
      void cycleShape();
      break;
  }
});

// Release the transient Space-pan on keyup, and on window blur (so a focus loss mid-hold can't strand it).
window.addEventListener("keyup", (ev) => {
  if (ev.key === " " && spaceHeld) {
    spaceHeld = false;
    refreshCursor();
  }
});
window.addEventListener("blur", () => {
  if (spaceHeld) {
    spaceHeld = false;
    refreshCursor();
  }
});

relaxBtn.addEventListener("click", () => {
  if (viewerMode) return;
  void relax();
});
// Regenerate: preserve pinned manual positions and lay out everything else cleanly from the text.
// Undoable — so the previous overlay can be restored (the groups are kept either way).
const pinnedOverrides = (overrides: LayoutOverrides): LayoutOverrides =>
  new Map([...overrides].filter(([, override]) => override.pinned));

regenBtn.addEventListener("click", () => {
  if (viewerMode) return;
  if (doc.overrides().size > 0) doc.record();
  doc.replaceOverrides(pinnedOverrides(doc.overrides()));
  doc.persist();
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
  announce(`${theme === darkTheme ? "dark" : "light"} theme`);
});
forcedColorsQuery?.addEventListener("change", () => {
  void renderFromText(editor.value());
});
syncThemeLabel();

// Examples menu: drop in a known-good starter for any family so the syntax is discoverable, then
// reset the select back to its placeholder.
exampleEl.addEventListener("change", () => {
  if (viewerMode) {
    exampleEl.value = "";
    return;
  }
  const text = EXAMPLES.get(exampleEl.value);
  exampleEl.value = "";
  if (text === undefined) return;
  // Loading an example replaces the whole source and clears the manual layout/groups (a different
  // diagram — the old positions no longer apply). Guard the destructive swap only when there's real
  // authored work to lose: a pristine sample or another unmodified example is fair game to switch away
  // from without a prompt. The source text itself stays recoverable via the editor's own undo.
  const current = editor.value();
  const isPristine =
    current.trim() === "" || current === SAMPLE || [...EXAMPLES.values()].includes(current);
  if (
    !isPristine &&
    current !== text &&
    !window.confirm(
      "Replace your current diagram? Manual layout and groups will be cleared (your text can be restored with Undo in the editor).",
    )
  ) {
    return;
  }
  doc.clearOverrides();
  doc.clearHistory(); // a different diagram — the old positions/history no longer apply
  doc.persist();
  editor.setValue(text);
  void renderFromText(text);
  announce("loaded example — undo in the editor to restore your text");
});

// Sketch toggle: hand-drawn (wobbly outlines + handwriting font) vs. crisp. Re-lays out, because the
// handwriting font is wider than the base — nodes must resize to keep labels inside their boxes.
sketchBtn.addEventListener("click", () => {
  sketch = !sketch;
  sketchBtn.textContent = sketch ? "Crisp" : "Sketch";
  void renderFromText(editor.value());
  announce(sketch ? "sketch mode" : "crisp mode");
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
    const detail = messageOf(e);
    console.error("pack parse failed:", detail);
    setStatusAndAnnounce("error", `icon pack is not valid JSON — ${detail}`);
    return;
  }
  const decoded = decodePack(json);
  if (!isOk(decoded)) {
    const detail = decoded.error.issues.join("; ");
    console.error("pack decode failed:", detail);
    setStatusAndAnnounce("error", `icon pack rejected — ${detail}`);
    return;
  }
  registry = registerPack(registry, decoded.value);
  iconImages.clear(); // drop stale glyphs so overridden packs re-rasterise
  setStatusAndAnnounce("ok", `loaded icon pack "${decoded.value.meta.id}"`);
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
  if (viewerMode || ast === null || !familyAffordances(ast.kind).iconOverride) return;
  editor.insertAtCursor(` icon "${packId}/${name}"`);
  doc.clearOverrides();
  doc.persist();
  void renderFromText(editor.value());
  announce(`inserted icon ${packId}/${name}`);
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

const focusableIn = (root: HTMLElement): readonly HTMLElement[] =>
  Array.from(
    root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hidden && !el.hasAttribute("disabled"));

const trapTab = (root: HTMLElement, ev: KeyboardEvent): void => {
  if (ev.key !== "Tab") return;
  const items = focusableIn(root);
  const first = items[0];
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) {
    ev.preventDefault();
    root.focus();
    return;
  }
  const active = document.activeElement;
  if (ev.shiftKey && active === first) {
    ev.preventDefault();
    last.focus();
  } else if (!ev.shiftKey && active === last) {
    ev.preventDefault();
    first.focus();
  }
};

const activeElement = (): HTMLElement | null =>
  document.activeElement instanceof HTMLElement ? document.activeElement : null;

let pickerOpen = false;
let pickerReturnFocus: HTMLElement | null = null;
const setPickerOpen = (open: boolean): void => {
  if (pickerOpen === open) return;
  pickerOpen = open;
  iconBackdrop.hidden = !open;
  iconPicker.hidden = !open;
  iconsToggle.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) {
    pickerReturnFocus = activeElement();
    buildIconGrid(iconFilter.value);
    iconFilter.focus();
  } else {
    const focusBack = pickerReturnFocus;
    pickerReturnFocus = null;
    if (focusBack !== null) focusBack.focus();
  }
};

iconsToggle.addEventListener("click", () => setPickerOpen(!pickerOpen));
iconsClose.addEventListener("click", () => setPickerOpen(false));
iconBackdrop.addEventListener("click", () => setPickerOpen(false));
iconFilter.addEventListener("input", () => buildIconGrid(iconFilter.value));
iconPicker.addEventListener("keydown", (ev) => {
  trapTab(iconPicker, ev);
  if (ev.key === "Escape") {
    ev.preventDefault();
    setPickerOpen(false);
  }
});

// Keyboard & mouse shortcut reference. `?` opens it (unless typing); Escape / the ✕ / a backdrop click
// close it. The Escape handler is capture-phase so closing the panel doesn't also clear the canvas
// selection (the bubble-phase Escape handler).
let helpOpen = false;
let helpReturnFocus: HTMLElement | null = null;
const setHelpOpen = (open: boolean): void => {
  if (helpOpen === open) return;
  helpOpen = open;
  helpOverlay.hidden = !open;
  helpToggle.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) {
    helpReturnFocus = activeElement();
    helpClose.focus();
  } else {
    const focusBack = helpReturnFocus;
    helpReturnFocus = null;
    if (focusBack !== null) focusBack.focus();
  }
};
helpToggle.addEventListener("click", () => setHelpOpen(!helpOpen));
helpClose.addEventListener("click", () => setHelpOpen(false));
helpOverlay.addEventListener("click", (ev) => {
  if (ev.target === helpOverlay) setHelpOpen(false); // a click on the backdrop, not the panel
});
helpOverlay.addEventListener("keydown", (ev) => trapTab(helpOverlay, ev));
window.addEventListener(
  "keydown",
  (ev) => {
    if (ev.key === "Escape" && helpOpen) {
      setHelpOpen(false);
      ev.stopPropagation();
      return;
    }
    const active = document.activeElement;
    const typing =
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      editor.hasFocus();
    if (ev.key === "?" && !typing) {
      ev.preventDefault();
      setHelpOpen(true);
    }
  },
  true,
);

// Swap the modifier-key hints to the platform's native names, and populate the in-app syntax
// reference (both self-contained startup DOM passes).
applyPlatformModifiers();
buildSyntaxReference();

// The themed surface colour lives only in CSS (the canvas pixels are transparent where nothing is
// drawn), so an export composites onto a background-filled offscreen canvas at device resolution —
// otherwise the output would have a transparent ground.
const compositeCanvas = (): HTMLCanvasElement | null => {
  if (scene === null) return null;
  // Re-paint at a fixed device scale (independent of the on-screen zoom) so the exported image is
  // always full-resolution — previously it copied the live canvas, so exporting at 10%/400% zoom
  // produced a tiny/huge image. Editor chrome (selection, handles, marquee) is omitted, matching the
  // SVG export. Mirrors the SVG path's zoom-independence.
  const shown = shownScene(scene);
  const logicalWidth = Math.ceil(shown.extent.size.width) + MARGIN * 2;
  const logicalHeight = Math.ceil(shown.extent.size.height) + MARGIN * 2;
  const dpr = window.devicePixelRatio || 1;
  const out = document.createElement("canvas");
  out.width = Math.round(logicalWidth * dpr);
  out.height = Math.round(logicalHeight * dpr);
  const octx = out.getContext("2d");
  if (octx === null) return null;
  const active = activeTheme();
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.fillStyle = active.background;
  octx.fillRect(0, 0, logicalWidth, logicalHeight);
  octx.translate(MARGIN - shown.extent.origin.x, MARGIN - shown.extent.origin.y);
  paint(octx, toDisplayList(shown), iconImages, active);
  return out;
};

const blockStaleExport = (action: string): boolean => {
  if (currentRenderValid && scene !== null) return false;
  setStatusAndAnnounce("error", `${action} blocked — fix the current source first`);
  return true;
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
  if (blockStaleExport("PNG export")) return;
  const out = compositeCanvas();
  if (out === null) {
    console.error("export failed: 2d context unavailable");
    setStatusAndAnnounce("error", "PNG export failed — no 2D context");
    return;
  }
  out.toBlob((blob) => {
    if (blob === null) {
      console.error("export failed: toBlob returned null");
      setStatusAndAnnounce("error", "PNG export failed");
      return;
    }
    downloadBlob(blob, "mermollusc.png");
    setStatusAndAnnounce("ok", "exported mermollusc.png");
  }, "image/png");
});

// Copy the rendered diagram to the clipboard as a PNG (the same zoom-independent composite the PNG
// export uses), so it can be pasted straight into a doc / chat / issue without a download. The
// clipboard write is best-effort — it needs a secure context + the `clipboard-write` permission — and
// its outcome is always surfaced to the status bar, never silently dropped.
copyBtn.addEventListener("click", () => {
  if (blockStaleExport("Copy")) return;
  const clip = navigator.clipboard;
  const ItemCtor = window.ClipboardItem;
  if (clip === undefined || typeof clip.write !== "function" || ItemCtor === undefined) {
    setStatusAndAnnounce("warning", "copying images isn't supported here — use PNG to download");
    return;
  }
  const out = compositeCanvas();
  if (out === null) {
    console.error("copy failed: 2d context unavailable");
    setStatusAndAnnounce("error", "copy failed — no 2D context");
    return;
  }
  out.toBlob((blob) => {
    if (blob === null) {
      console.error("copy failed: toBlob returned null");
      setStatusAndAnnounce("error", "copy failed");
      return;
    }
    void clip.write([new ItemCtor({ "image/png": blob })]).then(
      () => setStatusAndAnnounce("ok", "diagram image copied to clipboard"),
      (e: unknown) => {
        console.error("copy to clipboard failed:", messageOf(e));
        setStatusAndAnnounce("warning", "clipboard was blocked — use PNG to download instead");
      },
    );
  }, "image/png");
});

exportPdfBtn.addEventListener("click", () => {
  if (blockStaleExport("PDF export")) return;
  const out = compositeCanvas();
  if (out === null) {
    console.error("export failed: 2d context unavailable");
    setStatusAndAnnounce("error", "PDF export failed — no 2D context");
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
  setStatusAndAnnounce("ok", "exported mermollusc.pdf");
});

// SVG export, true vector: serialise the same display list the canvas paints, via the renderer's
// `toSvg` backend. Icon glyphs are embedded as `<image>` hrefs (the icon SVG as a data URL),
// resolved here because the renderer can't depend on `@m/icons`.
exportSvgBtn.addEventListener("click", () => {
  if (blockStaleExport("SVG export")) return;
  if (scene === null) {
    setStatusAndAnnounce("error", "nothing to export yet");
    return;
  }
  const shown = shownScene(scene);
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
    origin: shown.extent.origin,
    margin: MARGIN,
    theme: activeTheme(),
    icons,
  });
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "mermollusc.svg");
  setStatusAndAnnounce("ok", "exported mermollusc.svg");
});

// DOT export: the Scene is the universal graph IR, so any node/edge family exports to Graphviz DOT
// (a pie chart, having no nodes, exports as an empty graph). The reverse of the DOT import path.
exportDotBtn.addEventListener("click", () => {
  if (blockStaleExport("DOT export")) return;
  if (scene === null) {
    setStatusAndAnnounce("error", "nothing to export yet");
    return;
  }
  const dot = toDot(shownScene(scene), lastDirection);
  downloadBlob(new Blob([dot], { type: "text/vnd.graphviz" }), "mermollusc.dot");
  setStatusAndAnnounce("ok", "exported mermollusc.dot");
});

// Share: encode the current source in the URL hash (so the link reproduces the diagram) and copy it
// to the clipboard. The hash is reflected in the address bar either way; clipboard is best-effort
// (it can be denied) and its outcome is surfaced to the status bar, never silently dropped.
// The link carries the source and — when the author has arranged the canvas — the manual overlay
// (positions, resizes, groups), so the recipient sees the same diagram rather than a fresh auto-layout
// (exports already honour the overlay; Share now matches them). In collab mode the shared room owns the
// overlay, so the link stays source-only there.
const shareUrl = (): string => {
  const base = `${location.origin}${location.pathname}#src=${encodeURIComponent(editor.value())}`;
  if (useCollab) return base;
  const overrides = doc.overrides();
  const groups = doc.groups();
  if (overrides.size === 0 && groups.size === 0) return base;
  return `${base}&overlay=${encodeURIComponent(serializeOverlay(overrides, groups))}`;
};

shareBtn.addEventListener("click", () => {
  const url = shareUrl();
  history.replaceState(null, "", url);
  const clip = navigator.clipboard;
  if (clip === undefined) {
    setStatusAndAnnounce("ok", "shareable link is in the address bar");
    return;
  }
  void clip.writeText(url).then(
    () => setStatusAndAnnounce("ok", "shareable link copied to clipboard"),
    () => setStatusAndAnnounce("ok", "shareable link is in the address bar"),
  );
});

// Reset the demo: drop everything the app persists (source, overlay, theme — every "mermollusc-"
// localStorage key) and reload to the clean URL, dropping any share-link hash, so the demo comes back
// fresh on the sample diagram.
resetCacheBtn.addEventListener("click", () => {
  if (
    !window.confirm(
      "Clear the saved diagram, layout, and preferences, and reload a fresh demo? This can't be undone.",
    )
  ) {
    return;
  }
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k !== null && k.startsWith("mermollusc-")) keys.push(k);
  }
  for (const k of keys) localStorage.removeItem(k);
  location.replace(location.pathname);
});

// One decoded value from the `#…` hash (a shared link). `encodeURIComponent` (not `+`-for-space form)
// produced each value, so we decode with `decodeURIComponent` per key rather than `URLSearchParams`
// (which would turn a literal `+` in the source into a space).
const hashValue = (key: string): string | null => {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  for (const part of hash.split("&")) {
    const eq = part.indexOf("=");
    if (eq < 0 || part.slice(0, eq) !== key) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1));
    } catch (e) {
      console.error("ignoring malformed URL hash for key", key, messageOf(e));
      return null;
    }
  }
  return null;
};

// A `#src=…` hash (a shared link) wins over the persisted source, which wins over the sample.
const fromHash = hashValue("src");
const initialSource = fromHash ?? localStorage.getItem(SOURCE_KEY) ?? SAMPLE;
// Restore an overlay before the first render. A shared link carries its own overlay in the hash (the
// author's arrangement of *that* source); otherwise the persisted overlay is restored for the persisted
// source. In collab mode the shared room owns the overlay, so neither is applied. A corrupt/invalid
// overlay is logged loudly and ignored — never a silent default.
const applyOverlayJson = (raw: string, whence: string): void => {
  try {
    const decoded = decodeOverlay(JSON.parse(raw));
    if (isOk(decoded)) doc.replace(decoded.value.overrides, decoded.value.groups);
    else console.error("ignoring invalid overlay from", whence, decoded.error.issues.join("; "));
  } catch (e) {
    console.error("ignoring corrupt overlay from", whence, messageOf(e));
  }
};
if (!useCollab) {
  const linkOverlay = fromHash === null ? null : hashValue("overlay");
  if (linkOverlay !== null) {
    applyOverlayJson(linkOverlay, "share link");
  } else if (fromHash === null) {
    const rawOverlay = localStorage.getItem(OVERLAY_KEY);
    if (rawOverlay !== null) applyOverlayJson(rawOverlay, "localStorage");
  }
}
// Editing the text re-renders. A hand edit no longer wipes the manual layout — `renderFromText` prunes
// only the overrides/groups whose node ids the edit actually removed (after layout), so editing one
// node's label keeps every other node's manual position, and the prune is undoable. `renderSeq` drops a
// stale async layout so a fast typist never sees an out-of-order frame. The editor is created last
// because this closes over `renderFromText`; in collab mode it starts empty and the `Y.Text` binding
// fills it (seeded below).
const onTextChange = (text: string): void => {
  void renderFromText(text);
};
editor =
  collabSession !== null
    ? createEditor(editorMount, "", onTextChange, {
        extra: [collabSession.sourceBinding()],
        textHistory: false,
      })
    : createEditor(editorMount, initialSource, onTextChange);
// Render the resolved initial source now so the canvas isn't blank on load. In collab mode the editor
// itself starts empty and is filled by the seed/sync below; `onTextChange` then re-renders from the
// authoritative shared text (identical when this client seeds; the room's text when it joins one).
void renderFromText(initialSource);

// Collab transport (experimental): connect the session to the dev relay so peers' source-text and
// overlay edits arrive (the source binds to the editor via `sourceBinding`; an overlay change repaints
// here, since the doc stays UI-agnostic). The room and relay URL come from the query (`room`, `ws`);
// the default relay is the dev server on :1234. The scheme follows the page — secure `wss` on an https
// page, plain `ws` only for local/http dev — so a deployed instance never opens an insecure socket.
// `__collabOverrideCount` is an e2e convergence hook.
if (collabSession !== null) {
  const session = collabSession;
  const params = new URLSearchParams(location.search);
  const room = params.get("room") ?? "playground";
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const wsBase = params.get("ws") ?? `${scheme}://${location.hostname || "localhost"}:1234`;
  session.onOverlayChange(() => {
    requestPaint();
    updateGroupButtons();
  });
  // A remote overlay edit that fails to decode is dropped and surfaced (the session also logs it loudly)
  // rather than throwing inside the Yjs observer.
  session.onStatusChange((status) => {
    if (status === "overlay-rejected") {
      setStatus("warning", "⚠ a remote change was rejected (incompatible overlay) — ignoring it");
    }
  });
  // Label this client for presence — remote cursors show this name/colour. A random pick is fine for
  // the experimental flag; real identity arrives with auth (Phase 2).
  const PRESENCE_COLORS = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#008080"];
  const color = PRESENCE_COLORS[Math.floor(Math.random() * PRESENCE_COLORS.length)] ?? "#4363d8";
  session.setLocalUser({ name: `User ${1 + Math.floor(Math.random() * 99)}`, color });
  // The relay sends this client's granted role (a control frame). A viewer's editor + canvas go
  // read-only, with a badge — the server already drops a viewer's edits, so this is the matching UX.
  const roleBadge = document.querySelector<HTMLElement>("#role-badge");
  const applyRole = (role: string): void => {
    viewerMode = role === "viewer";
    editor.setReadOnly(viewerMode);
    document.body.setAttribute("data-role", role);
    if (roleBadge !== null) {
      roleBadge.textContent = viewerMode ? "view only" : role;
      roleBadge.setAttribute("data-role", role);
      roleBadge.hidden = false;
    }
    updateGroupButtons();
  };
  // A `?token=` (an Auth0 access token, once login is wired) is forwarded to the relay, which verifies
  // it when auth is enabled. Absent in local dev → the relay's default allow-all accepts.
  const token = params.get("token");
  const query = token === null ? "" : `?token=${encodeURIComponent(token)}`;
  // A self-healing transport: a dropped socket reconnects (exponential backoff) and re-exchanges state,
  // so a brief blip no longer permanently desyncs the room. Transient drops surface a "reconnecting"
  // banner; only a give-up (backoff exhausted) reaches `onClose`, where we fall back to local editing.
  const onReconnectStatus = (status: ReconnectStatus): void => {
    if (status === "reconnecting") {
      setStatus("warning", "⚠ reconnecting to the collaboration relay…");
    } else if (status === "reconnected") {
      setStatus("ok", "reconnected to the collaboration relay");
    }
  };
  const socket = reconnectingWebSocketTransport(`${wsBase}/${encodeURIComponent(room)}${query}`, {
    onStatus: onReconnectStatus,
  });
  connectTransport(session, socket, {
    onControl: applyRole,
    // Surface a permanent drop loudly rather than silently desyncing — local edits keep working, but
    // the user must know they're no longer shared.
    onClose: () => {
      console.error("collab: disconnected from the relay");
      setStatus("ok", "⚠ disconnected from the collaboration relay — editing locally");
    },
  });
  // Seed the room's source once the initial sync has settled: the first client into an empty room
  // fills it from the resolved initial source; a later joiner finds it non-empty (synced from the
  // relay) and adopts that instead, so the text isn't duplicated.
  window.setTimeout(() => {
    session.seedSourceIfEmpty(initialSource);
  }, 300);
  window.__collabOverrideCount = () => doc.overrides().size;
  window.__collabSetRole = applyRole; // e2e hook: drive the role without a real RBAC server
} else if (collabRequested && backendFreeDemo) {
  console.error("collab: disabled in the backend-free demo build");
  window.setTimeout(() => {
    setStatusAndAnnounce("ok", "collaboration is disabled in this backend-free demo");
  }, 0);
}
