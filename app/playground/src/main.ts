import {
  addNode,
  applyOverrides,
  connect,
  connectC4,
  connectClass,
  connectEr,
  connectMessage,
  connectMindmap,
  connectGitMerge,
  moveTimelineEvent,
  deleteTimelineEvent,
  deleteTimelinePeriod,
  deleteMindmapNode,
  connectRequirement,
  connectUndirected,
  decodeOverlay,
  deleteActor,
  deleteBlockGroup,
  deleteFlowSubgraph,
  deleteGroupBlock,
  renameBlockId,
  wrapCloudGroup,
  deleteC4,
  deleteC4Rel,
  deleteClassEntity,
  deleteClassRel,
  deleteEdge,
  deleteErEntity,
  deleteErRel,
  deleteLineAt,
  deleteMessage,
  deleteNode,
  deleteRequirementEntity,
  deleteRequirementRel,
  deleteStateEntity,
  descendantsOf,
  emptySelection,
  hitTest,
  leafNodes,
  addEdgeLabel,
  restyleEdge,
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
  EdgeKind,
  FlowDirection,
  GitGraphSource,
  TimelineSource,
  MindmapSource,
  PieSource,
  GanttSource,
  GroupId,
  GroupMember,
  LayoutOverrides,
  NetworkSource,
  NodeId,
  NodeShape,
  OverlayDoc,
  Scene,
  SceneNode,
  SceneNodeId,
  SequenceSource,
  SourceMap,
  StateSource,
  TextSpan,
} from "@m/contracts";
import { decodePack, defaultRegistry, findIcon, registerPack } from "@m/icons";
import { layout, layoutDiagram, retidyRoutes } from "@m/layout";
import { parseDiagramWithSource } from "@m/parser";
import { edgeLabelAnchor, paint, toDisplayList } from "@m/renderer";
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
import { installImageExport } from "./image-export.js";
import { createMinimap } from "./minimap.js";
import { createNavigator } from "./navigator.js";
import {
  clearPersisted,
  hashValue,
  loadOverlay,
  loadSource,
  loadSourceCollapsed,
  saveOverlay,
  saveSource,
  saveSourceCollapsed,
} from "./persistence.js";
import { createThemeController } from "./theme.js";
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
    // e2e hook: the displayed edges' routed waypoints, so a spec can assert connector geometry.
    __shownEdges?: () => readonly { id: string; waypoints: readonly { x: number; y: number }[] }[];
    // e2e hook: the viewport px of a labelled edge's label anchor (where the label is drawn), so a spec
    // can click the label and assert it selects the edge.
    __edgeLabelPos?: (edgeId: string) => { x: number; y: number } | null;
    // API + e2e hook: clear all manual positions, returning the diagram to its from-text default layout.
    __resetPositions?: () => void;
    // e2e hook: how many manual position/resize overrides are currently in the overlay.
    __overrideCount?: () => number;
    // e2e hook: the text currently highlighted in the editor (echoing the canvas selection).
    __editorHighlight?: () => string;
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
let editorReady = false;
const ctx = canvas.getContext("2d");
if (ctx === null) throw new Error("playground: 2d context unavailable");
const relaxBtn = document.querySelector<HTMLButtonElement>("#relax");
const regenBtn = document.querySelector<HTMLButtonElement>("#regenerate");
const resetPosBtn = document.querySelector<HTMLButtonElement>("#reset-positions");
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
const workbench = document.querySelector<HTMLElement>(".workbench");
const sourceCollapseBtn = document.querySelector<HTMLButtonElement>("#source-collapse");
const moreToggle = document.querySelector<HTMLButtonElement>("#more-toggle");
const moreMenu = document.querySelector<HTMLDivElement>("#more-menu");
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
  workbench === null ||
  sourceCollapseBtn === null ||
  moreToggle === null ||
  moreMenu === null ||
  zoomInBtn === null ||
  zoomOutBtn === null ||
  zoomResetBtn === null ||
  zoomFitBtn === null ||
  minimap === null ||
  relaxBtn === null ||
  regenBtn === null ||
  resetPosBtn === null ||
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
let pieSource: PieSource | null = null;
let ganttSource: GanttSource | null = null;
// A DOT import parses into a flowchart AST but has no editable source spans (no `parseDotWithSource`), so
// canvas edits can't patch it. Track it to gate those affordances off rather than let them fail post-click.
let isDotImport = false;
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
window.__shownEdges = () =>
  scene === null
    ? []
    : shownScene(scene).edges.map((e) => ({
        id: e.id,
        waypoints: e.waypoints.map((p) => ({ x: p.x, y: p.y })),
      }));
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

// Light/dark + sketch state and the active-theme resolution live in `./theme.ts`. Forced-colors stays
// here (the minimap and painter read it too). `activeTheme` is aliased so its many call sites are
// unchanged.
const forcedColorsQuery = window.matchMedia?.("(forced-colors: active)") ?? null;
const forcedColors = (): boolean => forcedColorsQuery?.matches ?? false;
const themeCtl = createThemeController({ forcedColors });
const activeTheme = themeCtl.activeTheme;

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
      // Bake the active theme foreground into `currentColor` line-art (bpmn/arch/sketch) so glyphs stay
      // legible in dark mode; the cache is cleared on a theme toggle so they re-rasterise.
      iconImages.set(key, await rasterizeIcon(resolved.value, activeTheme().text));
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
// Families whose connectors are right-angle paths, so a boundary-crossing edge that a manual move blended
// into a diagonal should snap back to clean orthogonal routing. Excludes sequence (messages must keep
// their stacked rows, not collapse to box-centre routes); a no-op for the curved/edgeless families.
const TIDY_FAMILIES: ReadonlySet<DiagramAst["kind"]> = new Set([
  "flowchart",
  "block",
  "network",
  "cloud",
  "c4",
  "er",
  "class",
  "state",
  "requirement",
]);

const shownScene = (base: Scene): Scene => {
  const ov = doc.overrides();
  if (shownCacheResult !== null && shownCacheScene === base && shownCacheOverrides === ov) {
    return shownCacheResult;
  }
  const moved = applyOverrides(base, ov);
  // After a move, re-route the connectors a move left diagonal back to clean right angles (display only —
  // `base` and the overrides are untouched, so undo/persist are unaffected). A no-op when nothing moved.
  const shown =
    ov.size > 0 && ast !== null && TIDY_FAMILIES.has(ast.kind) ? retidyRoutes(moved) : moved;
  shownCacheScene = base;
  shownCacheOverrides = ov;
  shownCacheResult = shown;
  return shown;
};

// A moved node plus, if it's a container (subgraph / boundary / composite), everything nested inside it —
// so dragging or nudging a container carries its contents. Used by both the pointer-drag and keyboard
// paths to keep them consistent.
const withContents = (shown: Scene, id: SceneNodeId): readonly SceneNodeId[] => {
  const node = shown.nodes.find((n) => n.id === id);
  return node !== undefined && node.shape === "container"
    ? [id, ...descendantsOf(shown, id)]
    : [id];
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
  if (!isInteracting()) minimapView.rebuildCache();
  minimapView.draw();
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
  const dark = themeCtl.isDark();
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
  if (ast === null || !familyAffordances(ast.kind).resizable) return null; // not a free-geometry box family
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
  // Whether `Add node` / `Duplicate` can append a node in the family's own one-line declaration syntax.
  // (Off for mindmap/gitGraph/timeline/pie/gantt, whose "node" has no standalone one-line declaration —
  // a mindmap node's identity is its indentation, a commit needs a branch context, etc.)
  readonly addNode: boolean;
  // Whether a node is a free-geometry box a size override can meaningfully resize. Off for families laid
  // out by their own rules (sequence lifelines, gantt bars, pie/timeline/git markers, content-sized
  // entities) where a corner-drag would leave an inert or distorting override.
  readonly resizable: boolean;
}
const familyAffordances = (kind: DiagramAst["kind"]): FamilyAffordances => {
  switch (kind) {
    case "flowchart":
    case "network":
    case "cloud":
    case "block":
      return { connect: true, iconOverride: true, addNode: true, resizable: true };
    case "sequence":
    case "state":
    case "c4":
    case "er":
    case "class":
      return { connect: true, iconOverride: false, addNode: true, resizable: false };
    case "requirement":
      return { connect: true, iconOverride: false, addNode: true, resizable: false };
    case "mindmap":
      // Connect re-parents a node (drag one node onto another to nest it); no Add (a node's place is its
      // indentation, set by where you connect it).
      return { connect: true, iconOverride: false, addNode: false, resizable: false };
    case "gitGraph":
      // Connect two branch lanes to merge one into the other (git's only edge).
      return { connect: true, iconOverride: false, addNode: false, resizable: false };
    case "timeline":
      // Connect re-parents an event under a different period (drag an event onto a period).
      return { connect: true, iconOverride: false, addNode: false, resizable: false };
    case "pie":
    case "gantt":
      return { connect: false, iconOverride: false, addNode: false, resizable: false };
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
    const resizable = ast !== null && familyAffordances(ast.kind).resizable;
    setTask(resizable ? "drag, rename, or resize with corner handles" : "drag or rename", "action");
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
  readonly canStyleEdge: boolean;
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
    place: !viewerMode && !isDotImport && ast !== null && familyAffordances(ast.kind).addNode,
  };
  if (!available[activeTool]) {
    activeTool = "select";
    stageWrap.setAttribute("data-tool", "select");
  }
  // A disabled tool explains *why* on hover — the same reason `setTool` announces to the keyboard path —
  // so the palette never reads as inertly broken; an available tool shows its hotkey label.
  const label: Record<Tool, string> = {
    select: "Select (V)",
    hand: "Hand / pan (H)",
    connect: "Connect (C)",
    place: "Place node (P)",
  };
  const reason: Record<Tool, string> = {
    select: label.select,
    hand: label.hand,
    connect: `the connect tool isn't available for ${ast === null ? "this diagram" : ast.kind}`,
    place: `placing nodes isn't available for ${ast === null ? "this diagram" : ast.kind}`,
  };
  for (const t of TOOL_ORDER) {
    const btn = TOOL_BUTTONS[t];
    const checked = activeTool === t;
    btn.setAttribute("aria-checked", checked ? "true" : "false");
    btn.tabIndex = checked ? 0 : -1;
    btn.disabled = !available[t];
    btn.title = available[t] ? label[t] : reason[t];
  }
};

// Which verbs the selection context toolbar offers, driven by the same CapabilityState the workbench
// controls use (so they can't disagree). Geometry/visibility of the bar itself is `positionContextBar`.
const renderContextBar = (caps: CapabilityState): void => {
  ctxRelabelBtn.hidden = !caps.canRelabel;
  // The Shape button doubles as the edge "Style" control (it cycles a node's shape or an edge's arrow).
  ctxShapeBtn.hidden = !(caps.canShape || caps.canStyleEdge);
  ctxShapeBtn.textContent = caps.canStyleEdge ? "Style" : "Shape";
  ctxConnectBtn.hidden = !caps.canConnect;
  ctxDuplicateBtn.hidden = !caps.canDuplicate;
  ctxGroupBtn.hidden = !caps.canGroup;
  ctxUngroupBtn.hidden = !caps.hasGroup;
  ctxLockBtn.hidden = !caps.hasGroup;
  ctxLockBtn.textContent = caps.isLocked ? "Unlock" : "Lock";
  ctxArrangeBtn.hidden = !caps.canArrange;
  ctxDeleteBtn.hidden = !caps.canDelete;
  // Roving tabindex (the ARIA toolbar pattern): exactly one button is a tab stop, arrows move within —
  // so Tab doesn't have to step through all nine. The first visible/enabled button holds the stop.
  setCtxRoving(null);
};

// Make `focused` (or the first visible+enabled button) the lone tab stop; the rest are -1.
const setCtxRoving = (focused: HTMLButtonElement | null): void => {
  const btns = Array.from(contextBar.querySelectorAll<HTMLButtonElement>("button")).filter(
    (b) => !b.hidden && !b.disabled,
  );
  const stop = focused !== null && btns.includes(focused) ? focused : (btns[0] ?? null);
  for (const b of btns) b.tabIndex = b === stop ? 0 : -1;
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
      canStyleEdge: false,
      canDuplicate: false,
      canRelabel: false,
      canDelete: false,
      isEdgeOnly: false,
    };
  }
  const kindLabel = isDotImport ? "DOT import" : ast === null ? "this diagram" : ast.kind;
  // A DOT import has no editable source spans, so every text-patching action is off for it.
  const editable = !isDotImport;
  const connectable = editable && ast !== null && familyAffordances(ast.kind).connect;
  const iconCapable = editable && ast !== null && familyAffordances(ast.kind).iconOverride;
  const isFlowchart = editable && ast !== null && ast.kind === "flowchart";
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
    // Restyle the arrow of a single selected flowchart/block edge (presentational kinds only).
    canStyleEdge:
      editable &&
      ast !== null &&
      (ast.kind === "flowchart" || ast.kind === "block") &&
      selectionOrder.length === 0 &&
      selection.edges.size === 1,
    canDuplicate:
      editable && ast !== null && familyAffordances(ast.kind).addNode && selectionOrder.length >= 1,
    canRelabel: editable && totalSelected === 1,
    canDelete: selectionOrder.length > 0 || selection.edges.size > 0,
    isEdgeOnly: selectionOrder.length === 0 && selection.edges.size > 0,
  };
};

// The source span of a selected node/edge, so a canvas selection can be echoed as a text highlight.
// Read-only — mirrors the per-family source maps the inline editor patches. Null for items with no
// source span (sidecar groups, DOT imports, a merge/marker without a declaration).
const highlightSpanOf = (hit: {
  readonly kind: "node" | "edge";
  readonly id: string;
}): TextSpan | null => {
  if (ast === null) return null;
  const id = hit.id;
  const isNode = hit.kind === "node";
  const E = brand<string, "EdgeId">(id);
  const N = brand<string, "NodeId">(id);
  switch (ast.kind) {
    case "flowchart":
      return isNode
        ? (source?.nodes.get(N)?.decl ?? null)
        : (source?.edges.get(E) ?? source?.arrows.get(E) ?? null);
    case "sequence":
      return isNode
        ? (seqSource?.actors.get(brand<string, "ActorId">(id)) ??
            seqSource?.notes.get(brand<string, "SequenceNoteId">(id)) ??
            null)
        : (seqSource?.messages.get(brand<string, "MessageId">(id)) ?? null);
    case "c4":
      return isNode
        ? (c4Source?.elements.get(brand<string, "C4ElementId">(id)) ?? null)
        : (c4Source?.rels.get(brand<string, "C4RelId">(id)) ?? null);
    case "block":
      return isNode
        ? (blockSource?.blocks.get(N) ??
            blockSource?.bareNodes.get(N) ??
            blockSource?.groups.get(N) ??
            null)
        : (blockSource?.edges.get(E) ?? blockSource?.arrows.get(E) ?? null);
    case "network":
      return isNode
        ? (netSource?.nodes.get(N) ??
            netSource?.bareNodes.get(N) ??
            netSource?.groups.get(N) ??
            null)
        : (netSource?.links.get(E) ?? null);
    case "cloud":
      return isNode
        ? (cloudSource?.nodes.get(N) ??
            cloudSource?.bareNodes.get(N) ??
            cloudSource?.groups.get(N) ??
            null)
        : (cloudSource?.links.get(E) ?? null);
    case "state":
      return isNode
        ? (stateSource?.states.get(brand<string, "StateId">(id)) ?? null)
        : (stateSource?.transitions.get(brand<string, "StateTransitionId">(id)) ?? null);
    case "er":
      return isNode
        ? (erSource?.entities.get(brand<string, "ErEntityId">(id)) ?? null)
        : (erSource?.relationships.get(brand<string, "ErRelId">(id)) ?? null);
    case "class":
      return isNode
        ? (classSource?.entities.get(brand<string, "ClassEntityId">(id)) ?? null)
        : (classSource?.relationships.get(brand<string, "ClassRelId">(id)) ?? null);
    case "requirement":
      return isNode ? (reqSource?.entities.get(brand<string, "ReqEntityId">(id)) ?? null) : null;
    case "gitGraph":
      return isNode ? (gitSource?.commits.get(brand<string, "GitCommitId">(id)) ?? null) : null;
    case "timeline":
      return isNode
        ? (timelineSource?.events.get(brand<string, "TimelineEventId">(id)) ??
            timelineSource?.periods.get(brand<string, "TimelinePeriodId">(id)) ??
            null)
        : null;
    case "mindmap":
      return isNode ? (mindmapSource?.nodes.get(brand<string, "MindmapNodeId">(id)) ?? null) : null;
    case "pie":
      return isNode ? (pieSource?.slices.get(brand<string, "PieSliceId">(id)) ?? null) : null;
    case "gantt":
      return isNode ? (ganttSource?.tasks.get(brand<string, "GanttTaskId">(id)) ?? null) : null;
    default:
      return assertNever(ast);
  }
};

// Echo a single-item canvas selection as a text-editor highlight (`editor.select` selects + scrolls but
// doesn't steal focus). Guarded against fighting the typist (editor focused) and churning mid-gesture;
// memoised so a re-render with an unchanged selection doesn't re-scroll the editor.
// Echo the whole canvas selection into the source as background highlights — every selected node and
// edge (a selected group selects its member nodes, so it lights up too), across all families. Uses a
// decoration (not the text selection), so it's visible while the editor is unfocused, covers many
// ranges at once, and never moves the user's cursor. Memoised so an unchanged selection is a no-op.
let lastHighlightKey = "";
const highlightSelection = (): void => {
  if (!editorReady) return; // `updateGroupButtons` fires during init before the editor mounts
  const spans: { from: number; to: number }[] = [];
  for (const id of selection.nodes) {
    const s = highlightSpanOf({ kind: "node", id });
    if (s !== null) spans.push({ from: s.start, to: s.end });
  }
  for (const id of selection.edges) {
    const s = highlightSpanOf({ kind: "edge", id });
    if (s !== null) spans.push({ from: s.start, to: s.end });
  }
  const key = spans
    .map((s) => `${s.from}:${s.to}`)
    .sort()
    .join(",");
  if (key === lastHighlightKey) return;
  lastHighlightKey = key;
  editor.setHighlights(spans);
};

// Reflect the current selection in the workbench controls (enabled state + Lock/Unlock label).
const updateGroupButtons = (): void => {
  highlightSelection();
  const caps = computeCapabilities();
  groupBtn.disabled = !caps.canGroup;
  // The verb means different things per family — only cloud wraps the selection in a labelled group in
  // the source text; every other family (network included) makes a sidecar visual group — so the title
  // says which, instead of a generic "Group".
  const groupKind = ast === null ? null : ast.kind;
  groupBtn.title = !caps.canGroup
    ? "select two or more nodes to group"
    : groupKind === "cloud"
      ? "wrap the selection in a labelled group in the source text"
      : "bundle the selection into a movable visual group";
  ctxGroupBtn.title = groupBtn.title;
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
  ctxArrangeBtn.setAttribute("aria-expanded", "false");
  // Drop any fixed placement so the next editor-toolbar open uses the CSS-default anchored position.
  arrangeMenu.style.cssText = "";
};
// Open the align/distribute menu near the control that invoked it. The editor-toolbar button uses the
// CSS-default anchored placement (anchor=null); the on-canvas context-bar button positions it next to
// itself with fixed coords, instead of opening it across the workbench at the editor pane.
const openArrangeMenu = (anchor: HTMLButtonElement | null, expander: HTMLButtonElement): void => {
  arrangeMenu.hidden = false;
  if (anchor !== null) {
    const r = anchor.getBoundingClientRect();
    const mh = arrangeMenu.offsetHeight;
    const mw = arrangeMenu.offsetWidth;
    arrangeMenu.style.position = "fixed";
    arrangeMenu.style.bottom = "auto";
    arrangeMenu.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - mw - 4))}px`;
    const above = r.top - mh - 6;
    arrangeMenu.style.top = `${above > 4 ? above : r.bottom + 6}px`;
  }
  expander.setAttribute("aria-expanded", "true");
};
const toggleArrange = (anchor: HTMLButtonElement | null, expander: HTMLButtonElement): void => {
  if (arrangeMenu.hidden) openArrangeMenu(anchor, expander);
  else closeArrange();
};
arrangeBtn.addEventListener("click", (ev) => {
  ev.stopPropagation();
  toggleArrange(null, arrangeBtn);
});
document.addEventListener("pointerdown", (ev) => {
  if (arrangeMenu.hidden) return;
  const t = ev.target;
  if (t instanceof Node && (arrangeMenu.contains(t) || t === arrangeBtn || t === ctxArrangeBtn))
    return;
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
// Sidecar group create/ungroup/relabel changes the navigator's group category without re-rendering the
// diagram, so these handlers (defined before the navigator) refresh it through this hook, set once the
// navigator exists. (Cloud's text groups go through renderFromText, which rebuilds the list anyway.)
let refreshNavigatorGroups: () => void = () => {};

const groupSelection = (): void => {
  if (viewerMode) return;
  // Cloud has native text groups: gather the selected *top-level leaves* into a `group "Group" { … }`
  // the user can rename, rather than a sidecar overlay group. Skip containers + already-nested leaves —
  // each captured line must be a single self-contained statement, or wrapCloudGroup would pull a line
  // out of its existing group and unbalance the braces.
  if (ast !== null && ast.kind === "cloud" && cloudSource !== null && scene !== null) {
    const cs = cloudSource;
    const byId = new Map(scene.nodes.map((n) => [n.id, n]));
    const lineOf = (id: SceneNodeId): number | null => {
      const node = byId.get(id);
      if (node === undefined || node.shape === "container" || node.parent !== null) return null;
      const nid = brand<string, "NodeId">(id);
      const span = cs.nodes.get(nid) ?? cs.bareNodes.get(nid);
      return span === undefined ? null : editor.value().slice(0, span.start).split("\n").length - 1;
    };
    const lineIdxs = selectionOrder.map(lineOf).filter((n): n is number => n !== null);
    if (lineIdxs.length < 2) {
      setStatusAndAnnounce("ok", "select two or more top-level services to group");
      return;
    }
    const next = wrapCloudGroup(editor.value(), lineIdxs, "Group");
    if (next === editor.value()) return;
    editor.setValue(next);
    void renderFromText(next);
    announce(`grouped ${lineIdxs.length} services — double-click the group title to rename`);
    return;
  }
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
  refreshNavigatorGroups();
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
  refreshNavigatorGroups();
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
  minimapView.draw();
  positionContextBar(); // the bar tracks the selection as the sheet scrolls inside the stage
});

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

// Centre a sidecar group in view (the keyboard navigator lands on one) — same framing math as a node,
// using the group's outline box in the last rendered scene.
const scrollToGroup = (id: GroupId): void => {
  const rendered = lastRender?.scene ?? null;
  if (rendered === null) return;
  const box = groupBoxes(rendered).find((b) => b.id === id);
  if (box === undefined) return;
  scrollToLogical(
    MARGIN - rendered.extent.origin.x + box.x + box.w / 2,
    MARGIN - rendered.extent.origin.y + box.y + box.h / 2,
  );
};

// The minimap (offscreen cache + viewport scrim + its own pointer/keyboard nav) lives in `./minimap.ts`;
// it reads the live render/theme and drives the stage scroll through `scrollToLogical`.
const minimapView = createMinimap({
  minimap,
  miniCtx,
  stageWrap,
  canvas,
  margin: MARGIN,
  maxSize: MINIMAP_MAX,
  getRender: () => lastRender,
  getViewScale: () => viewScale,
  activeTheme,
  isDark: themeCtl.isDark,
  forcedColors,
  scrollToLogical,
});

// Push a message to the diagram's live region (screen-reader announcement). Shared by the keyboard
// navigator, the status bar (`setStatusAndAnnounce`), and the on-canvas group/lock commands.
const announce = (message: string): void => {
  // Re-fire even when the text is identical to the last message (two "moved Alpha" in a row): most
  // screen readers ignore a live-region write that doesn't change the text, so clear then set.
  if (diagramLive.textContent === message) diagramLive.textContent = "";
  diagramLive.textContent = message;
};

// Collapse / expand the source editor so the canvas can use the freed space. The head stays as the
// always-visible expand handle. `persist` is false for the auto-expand on a parse error (so a forced
// reveal doesn't overwrite the user's saved preference).
const setSourceCollapsed = (collapsed: boolean, persist = true): void => {
  if (collapsed && editor.hasFocus()) sourceCollapseBtn.focus(); // don't trap focus in the hidden body
  if (collapsed) workbench.setAttribute("data-source-collapsed", "");
  else workbench.removeAttribute("data-source-collapsed");
  sourceCollapseBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
  sourceCollapseBtn.textContent = collapsed ? "›" : "‹";
  sourceCollapseBtn.title = collapsed ? "Show the source panel" : "Collapse the source panel";
  if (persist) saveSourceCollapsed(collapsed);
  if (!collapsed) editor.refresh(); // CodeMirror renders zero-height until it re-measures
  // The stage column resized — repaint against the new geometry and re-anchor the context bar.
  paintScene();
  positionContextBar();
};
sourceCollapseBtn.addEventListener("click", () => {
  const collapsed = workbench.hasAttribute("data-source-collapsed");
  setSourceCollapsed(!collapsed);
  announce(collapsed ? "source panel expanded" : "source panel collapsed");
});

// The overflow ("Export ▾") menu holds the export/share/load/reset actions moved off the topbar. A
// non-modal popover (the Arrange pattern) so it doesn't inert the topbar it lives in; the moved
// buttons keep their ids, so their existing handlers and capability gating are unchanged.
const moreItems = (): HTMLElement[] =>
  [...moreMenu.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter(
    (el) => !(el instanceof HTMLButtonElement && el.disabled),
  );
const closeMore = (): void => {
  if (moreMenu.hidden) return;
  // If focus is inside the menu (keyboard activation / Escape), return it to the trigger so it doesn't
  // fall to <body> when the menu hides. An outside pointer-dismiss leaves focus where the user clicked.
  const restore = moreMenu.contains(document.activeElement);
  moreMenu.hidden = true;
  moreMenu.style.cssText = ""; // drop the fixed placement so the next open recomputes it
  moreToggle.setAttribute("aria-expanded", "false");
  if (restore) moreToggle.focus();
};
const openMore = (): void => {
  moreMenu.hidden = false;
  // Position with fixed coords anchored under the trigger so the popover escapes the topbar's clipping
  // and stacking (an absolutely-positioned descendant was painted behind the topbar buttons).
  const r = moreToggle.getBoundingClientRect();
  const mw = moreMenu.offsetWidth;
  moreMenu.style.position = "fixed";
  moreMenu.style.top = `${r.bottom + 6}px`;
  moreMenu.style.left = `${Math.max(8, Math.min(r.right - mw, window.innerWidth - mw - 8))}px`;
  moreMenu.style.right = "auto";
  moreToggle.setAttribute("aria-expanded", "true");
  moreItems()[0]?.focus();
};
moreToggle.addEventListener("click", (ev) => {
  ev.stopPropagation();
  if (moreMenu.hidden) openMore();
  else closeMore();
});
moreMenu.addEventListener("keydown", (ev) => {
  const items = moreItems();
  const i = items.findIndex((el) => el === document.activeElement);
  if (ev.key === "Escape") {
    ev.preventDefault();
    closeMore();
    moreToggle.focus();
  } else if (ev.key === "ArrowDown" && items.length > 0) {
    ev.preventDefault();
    items[(i + 1) % items.length]?.focus();
  } else if (ev.key === "ArrowUp" && items.length > 0) {
    ev.preventDefault();
    items[(i - 1 + items.length) % items.length]?.focus();
  } else if (
    (ev.key === "Enter" || ev.key === " ") &&
    document.activeElement instanceof HTMLLabelElement
  ) {
    // The "Load icons" item is a <label> (not a button) — Enter/Space don't natively activate it, so
    // open its file input explicitly. (Real <button> items activate natively and bubble to the closer.)
    ev.preventDefault();
    document.activeElement.click();
  }
});
// Activating any item dismisses the menu (export runs, Reset reloads, Load-icons opens a file dialog).
moreMenu.addEventListener("click", () => closeMore());
document.addEventListener("pointerdown", (ev) => {
  if (moreMenu.hidden) return;
  const t = ev.target;
  if (t instanceof Node && (moreMenu.contains(t) || t === moreToggle)) return;
  closeMore();
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

// Disable the export/copy controls while the current text doesn't render — they'd otherwise fail only
// after the click. Re-evaluated on every render outcome, since setStatus runs on success and failure alike.
const syncExportButtons = (): void => {
  for (const b of [exportBtn, copyBtn, exportPdfBtn, exportSvgBtn, exportDotBtn]) {
    b.disabled = !currentRenderValid;
    b.title = currentRenderValid ? "" : "fix the source first";
  }
};

const setStatus = (
  level: "ok" | "warning" | "error",
  message: string,
  range: { readonly offset: number; readonly length: number } | null = null,
): void => {
  statusEl.textContent = message;
  statusEl.setAttribute("data-level", level);
  statusEl.setAttribute("data-locatable", range === null ? "false" : "true");
  // When the status points at a source location, expose it as a real button so keyboard/AT users get the
  // same "jump to error" the mouse affordance offers; otherwise it's a plain (non-focusable) status line.
  if (range === null) {
    statusEl.removeAttribute("role");
    statusEl.removeAttribute("tabindex");
  } else {
    statusEl.setAttribute("role", "button");
    statusEl.setAttribute("tabindex", "0");
  }
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
  syncExportButtons();
};

const setStatusAndAnnounce = (
  level: "ok" | "warning" | "error",
  message: string,
  range: { readonly offset: number; readonly length: number } | null = null,
): void => {
  setStatus(level, message, range);
  announce(message);
};

// A transient action confirmation (added/duplicated/connected/…): show it in the status bar and
// announce it, but — unlike setStatus — don't touch the canvas's screen-reader description or the
// parse-status level/stale flag, which describe the *diagram*, not the last command.
const flashStatus = (message: string): void => {
  statusEl.textContent = message;
  announce(message);
};

const jumpToError = (): void => {
  if (errorRange === null) return;
  editor.focus();
  editor.select(errorRange.offset, errorRange.offset + errorRange.length);
};
statusEl.addEventListener("click", jumpToError);
statusEl.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" || ev.key === " ") {
    ev.preventDefault();
    jumpToError();
  }
});

// Relax seeds ELK (flowchart specifically). Add-node now works for every family with a one-line node
// decl (flowchart/block/network/sequence); off those it's disabled with a reason rather than a silent
// dead click. Connect and Delete already work for every family.
const applyKind = (kind: DiagramAst["kind"]): void => {
  kindEl.textContent = kind;
  // A collaborative viewer is read-only: these mutate the diagram, so they must be truly `disabled`
  // (not just CSS-dimmed) or a keyboard / screen-reader user can still reach and "press" them.
  const isFlowchart = currentRenderValid && kind === "flowchart";
  relaxBtn.disabled = !isFlowchart || viewerMode;
  relaxBtn.title = isFlowchart ? "" : currentRenderValid ? "flowchart only" : "fix source first";
  // Regenerate re-lays-out any family (clearing unpinned overrides), so it's enabled whenever the
  // source is valid — but disabled on a broken parse, matching Relax/Add (was the lone exception).
  regenBtn.disabled = !currentRenderValid || viewerMode;
  regenBtn.title = currentRenderValid ? "" : "fix source first";
  resetPosBtn.disabled = !currentRenderValid || viewerMode;
  const canAdd =
    currentRenderValid && familyAffordances(kind).addNode && !isDotImport && !viewerMode;
  addBtn.disabled = !canAdd;
  addBtn.title = canAdd
    ? ""
    : isDotImport
      ? "DOT import is read-only — edit the source text"
      : currentRenderValid
        ? `adding nodes isn't available for ${kind}`
        : "fix source first";
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
// tag is no longer current) is dropped instead of painting over a newer diagram — checked after *each*
// await (the worker layout and the icon raster), so a render overtaken at either point never assigns
// state or paints.
let renderSeq = 0;

// Typing coalesces: the *first* edit in a burst renders immediately (so a single discrete edit — and the
// e2e harness — stays responsive), then a quiet "cooldown" window opens. Edits during the cooldown are
// queued, not rendered; when it ends, one trailing render lays out the *latest* editor text. So a fast
// typist triggers at most one render per cooldown (~`RENDER_DEBOUNCE_MS`), not one per keystroke, yet the
// canvas never lags more than that behind the text. `renderFromText` (including programmatic canvas
// edits) opens the cooldown itself, so every render rate-limits the next.
const RENDER_DEBOUNCE_MS = 90;
let renderCooldown: number | null = null; // non-null during the quiet window after a typed render
let renderQueued = false; // a coalesced edit is waiting for the cooldown to end
const armRenderCooldown = (): void => {
  renderCooldown = window.setTimeout(() => {
    renderCooldown = null;
    if (renderQueued) {
      renderQueued = false;
      void renderFromText(editor.value()); // trailing: lay out the latest text
      armRenderCooldown(); // keep rate-limiting through a continuous burst
    }
  }, RENDER_DEBOUNCE_MS);
};

// Cloud groups the user has collapsed (contents hidden). Keyed by the group's synthetic id and
// persisted across reloads; stale ids (after a structural edit reindexes groups) are filtered out at
// layout time so a collapse never lands on the wrong group.
const COLLAPSE_KEY = "mermollusc-cloud-collapsed";
const loadCollapsed = (): string[] => {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    const v: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch (e) {
    console.error("collapse state load failed", e);
    return [];
  }
};
const cloudCollapsed = new Set<string>(loadCollapsed());
const persistCollapsed = (): void => {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...cloudCollapsed]));
  } catch (e) {
    console.error("collapse state persist failed", e);
  }
};
const collapsedBranded = (): ReadonlySet<NodeId> =>
  new Set([...cloudCollapsed].map((id) => brand<string, "NodeId">(id)));

// Toggle the collapse of the single selected cloud group (E). Collapsing hides its contents + re-routes
// its links to the container; the state persists across reloads.
const toggleCloudCollapse = (): void => {
  if (viewerMode || ast === null || scene === null) return;
  if (ast.kind !== "cloud") {
    announce("collapse is only available for cloud groups");
    return;
  }
  const id = selectionOrder.length === 1 ? selectionOrder[0] : null;
  const node = id === null || id === undefined ? undefined : scene.nodes.find((n) => n.id === id);
  if (id === null || id === undefined || node === undefined || node.shape !== "container") {
    announce("select a single cloud group to collapse");
    return;
  }
  if (cloudCollapsed.has(id)) cloudCollapsed.delete(id);
  else cloudCollapsed.add(id);
  persistCollapsed();
  void renderFromText(editor.value());
  announce(cloudCollapsed.has(id) ? "collapsed group" : "expanded group");
};

const renderFromText = async (text: string): Promise<void> => {
  const mySeq = ++renderSeq;
  currentRenderValid = false;
  updateGroupButtons();
  saveSource(text);
  // One parse yields both the AST (to lay out) and the family's source map (the spans the inline editor
  // patches) — previously every family was parsed twice per render. `parsed.value.family` is the closed
  // discriminator: it separates flowchart from DOT-import (both have ast kind `flowchart`).
  const parsed = parseDiagramWithSource(text);
  if (!isOk(parsed)) {
    // The source is the only place to fix a parse error, so never leave it hidden — reveal it (without
    // overwriting the saved preference) so the lint marker + click-to-locate are reachable.
    if (workbench.hasAttribute("data-source-collapsed")) setSourceCollapsed(false, false);
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
  // A DOT import parses to a flowchart AST but has no editable spans — set this before applyKind, which
  // gates the Add button on it.
  isDotImport = result.family === "dot";
  lastDirection = "direction" in diagram ? diagram.direction : null;
  const laid = await layoutDiagram(diagram, measureLabel, collapsedBranded());
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
  navController.rebuild();
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
  pieSource = null;
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
      pieSource = result.source;
      break;
    case "gantt":
      ganttSource = result.source;
      break;
    default:
      assertNever(result);
  }
  const failedIcons = await ensureIcons(scene);
  // Second drop-stale check: a newer render may have started while we awaited the icon raster. Bail
  // before painting so a stale frame never lands on top of a newer diagram.
  if (mySeq !== renderSeq) return;
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
    setStatusAndAnnounce("error", `relax failed — ${laid.error.message}`);
    return;
  }
  scene = laid.value;
  const hadPins = doc.overrides().size > 0;
  doc.clearOverrides();
  doc.persist();
  paintScene();
  // Relax discards manual positions — say so, since the user can't otherwise tell a re-layout cleared them.
  flashStatus(hadPins ? "relaxed layout — manual positions cleared" : "relaxed layout");
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

// Hit-testing that also catches an edge's *label*: the label is drawn offset from the edge line (beyond
// the line's hit tolerance), so a click on the visible label text would otherwise miss the edge (the
// "edge rename seems bugged" report). A NODE still owns its own pixels — only an empty/edge-line region
// falls through to the label boxes — so clicking/dragging a node (or dropping a connect on it) is never
// stolen by a label that happens to overlap it.
const EDGE_LABEL_HIT_PAD = 7;
const EDGE_LABEL_LINE_H = 16;
const hitScene = (shown: Scene, at: Point): HitTarget | null => {
  const base = hitTest(shown, at);
  if (base !== null && base.kind === "node") return base;
  for (const edge of shown.edges) {
    if (edge.label === null) continue;
    const anchor = edge.labelPos ?? edgeLabelAnchor(edge.waypoints);
    // Mirror the painter's multi-line box: widest line for width, line count for height.
    const lines = edge.label.split("\n");
    const halfW = lines.reduce((w, l) => Math.max(w, measureLabel(l)), 0) / 2 + EDGE_LABEL_HIT_PAD;
    const halfH = (lines.length * EDGE_LABEL_LINE_H) / 2 + EDGE_LABEL_HIT_PAD;
    if (Math.abs(at.x - anchor.x) <= halfW && Math.abs(at.y - anchor.y) <= halfH) {
      return { kind: "edge", id: edge.id };
    }
  }
  return base; // an edge-line hit, or null
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

window.__edgeLabelPos = (edgeId) => {
  if (scene === null) return null;
  const edge = shownScene(scene).edges.find((e) => e.id === edgeId);
  if (edge === undefined || edge.label === null) return null;
  const anchor = edge.labelPos ?? edgeLabelAnchor(edge.waypoints);
  const s = sceneToScreen(point(anchor.x, anchor.y));
  return { x: s.x, y: s.y };
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
  const hit = hitScene(shown, at);
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
  // `flashStatus`, not `setStatusAndAnnounce`: a tool rejection is transient feedback, so it must not
  // overwrite the canvas's diagram aria-label — same reasoning the success path below cites.
  if (t === "connect" && !(ast !== null && familyAffordances(ast.kind).connect)) {
    flashStatus(`the connect tool isn't available for ${ast === null ? "this diagram" : ast.kind}`);
    return;
  }
  if (t === "place" && !(!isDotImport && ast !== null && familyAffordances(ast.kind).addNode)) {
    flashStatus(`placing nodes isn't available for ${ast === null ? "this diagram" : ast.kind}`);
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
  if (viewerMode || ast === null || scene === null || !familyAffordances(ast.kind).addNode) return;
  const used = new Set<string>(scene.nodes.map((n) => n.id));
  const { id, label } = newNodeIdLabel(ast.kind, used);
  const next = appendNode(ast.kind, editor.value(), id, label, "rect");
  if (next === editor.value()) return;
  editor.setValue(next);
  await renderFromText(next);
  if (scene === null) return;
  const sid = brand<string, "SceneNodeId">(id);
  // Pin the new node where it was dropped (the override moves it for any family, deterministic or not).
  doc.record();
  doc.moveNode(sid, at);
  doc.persist();
  selection = { nodes: new Set([sid]), edges: new Set() };
  selectionOrder = [sid];
  paintScene();
  updateGroupButtons();
  setTool("select");
  flashStatus(`placed ${label}`);
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
  const hit = hitScene(shown, at);
  const groupHit = hit === null ? groupHitAt(shown, at) : null;
  const tool = effectiveTool();
  // Place tool: a click drops a new node at the pointer (flowchart only), then snaps back to select.
  if (tool === "place" && ast !== null && familyAffordances(ast.kind).addNode && !viewerMode) {
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
  // to the cursor, an edge on release over another node — before the resize/move paths. Viewers can't,
  // and neither can families whose grammar can't accept the edit (else the rubber-band arms a dead
  // gesture that, on release, triggers a full no-op re-layout).
  const connectArmed =
    (ev.altKey || tool === "connect") && ast !== null && familyAffordances(ast.kind).connect;
  if (connectArmed && !viewerMode && hit !== null && hit.kind === "node") {
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
    // Dragging a node moves it; a grouped node moves its whole group's leaves; a *container* (a
    // subgraph / boundary / composite) moves itself plus everything nested inside it, so the box and
    // its contents travel as one. applyOverrides then re-routes connectors — interior edges (both ends
    // moved by the same delta) translate rigidly, boundary-crossing edges blend to stay attached.
    for (const id of selection.nodes) {
      const top = topGroupOfNode(doc.groups(), id);
      const seeds = top === null ? [id] : leafNodes(doc.groups(), top);
      for (const seed of seeds) for (const m of withContents(shown, seed)) moveIds.add(m);
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
    const target = scene === null ? null : hitScene(shownScene(scene), scenePoint(ev));
    if (ast !== null && target !== null && target.kind === "node" && target.id !== cd.from) {
      // Only commit when the family's `appendEdge` actually changes the text — otherwise a full re-layout
      // (and a nav reset) would run for nothing. The arming guard already blocks non-connectable families;
      // this also covers a family whose builder declines a specific pair.
      const next = appendEdge(ast.kind, editor.value(), cd.from, target.id);
      if (next !== editor.value()) {
        const label = (id: SceneNodeId): string =>
          scene?.nodes.find((n) => n.id === id)?.label ?? "node";
        editor.setValue(next);
        void renderFromText(next);
        announce(describeConnect(ast.kind, label(cd.from), label(target.id)));
      } else {
        paintScene();
        announce("connect made no change");
      }
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
    const w = Math.max(64, anchor.w * viewScale);
    const h = Math.max(24, anchor.h * viewScale);
    inlineEl.style.width = `${w}px`;
    inlineEl.style.height = `${h}px`;
    // Clamp into the viewport so the editor for a node near the right/bottom edge (or on a narrow phone)
    // stays fully visible instead of spilling off-screen.
    const s = sceneToScreen(point(anchor.x, anchor.y));
    const M = 4;
    positionOverlay(
      inlineEl,
      screenPoint(
        Math.min(Math.max(M, s.x), Math.max(M, window.innerWidth - w - M)),
        Math.min(Math.max(M, s.y), Math.max(M, window.innerHeight - h - M)),
      ),
    );
  };
  place();
  // Where focus was before the editor grabbed it (the navigator/canvas), to return it on close so a
  // keyboard user's editing loop continues instead of dropping to <body>.
  const returnFocus = activeElement();
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
      // A rejected label sets an error status synchronously (a successful commit only re-renders, which
      // is async) — so don't also announce "relabel committed" over the "can't rename" the user just got.
      const rejected = statusEl.getAttribute("data-level") === "error";
      if (!rejected && inlineEl.value !== value) announceCommit(inlineEl.value);
    }
    // Restore focus only if it would otherwise be lost (Enter/Escape) — not if the user clicked away.
    const active = document.activeElement;
    if (
      returnFocus !== null &&
      document.body.contains(returnFocus) &&
      (active === document.body || active === inlineEl || active === null)
    ) {
      returnFocus.focus();
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
    // Timeline period/event and gantt task labels are colon-delimited free text — a `:` in the new
    // label would silently split it into a second event / meta field, corrupting the diagram.
    if (ast !== null && (ast.kind === "timeline" || ast.kind === "gantt")) return "colon";
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
  // A bare (label-less) node: open an empty editor and, on commit, wrap its id into a label in the
  // family's syntax. The label always lands inside quotes, so the "quoted" rules apply.
  const wrapBareLabel = (
    idSpan: TextSpan,
    wrap: (id: string, label: string) => string,
  ): { readonly text: string; readonly commit: (n: string) => void } => ({
    text: "",
    commit: (next) => {
      if (next.length === 0) return;
      const checked = validateLabel(next, "quoted");
      if (!isOk(checked)) {
        console.error("relabel rejected:", checked.error.message);
        setStatusAndAnnounce("error", `can't rename — ${checked.error.message}`);
        return;
      }
      const id = editor.value().slice(idSpan.start, idSpan.end);
      editor.setValue(patchSpan(editor.value(), idSpan, wrap(id, next)));
      void renderFromText(editor.value());
    },
  });
  // A bare (label-less) flowchart/block edge: open an empty editor and, on commit, splice a `|label|`
  // after its arrow token so the previously-unlabelled connector gets a name.
  const wrapBareEdge = (
    arrowSpan: TextSpan,
  ): { readonly text: string; readonly commit: (n: string) => void } => ({
    text: "",
    commit: (next) => {
      if (next.length === 0) return;
      const out = addEdgeLabel(editor.value(), arrowSpan, next);
      if (!isOk(out)) {
        console.error("edge label rejected:", out.error.message);
        setStatusAndAnnounce("error", `can't label edge — ${out.error.message}`);
        return;
      }
      editor.setValue(out.value);
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
          refreshNavigatorGroups(); // the group's navigator label changed
        },
      };
    }
  } else if (hit !== null && ast.kind === "flowchart" && source !== null) {
    const src = source;
    if (hit.kind === "edge") {
      const edgeId = brand<string, "EdgeId">(hit.id);
      const span = src.edges.get(edgeId);
      const arrow = src.arrows.get(edgeId);
      // A labelled edge renames its `|label|`; a bare edge gets a new label spliced after its arrow.
      if (span !== undefined) pending = patchAt(span);
      else if (arrow !== undefined) pending = wrapBareEdge(arrow);
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
    if (hit.kind === "edge") {
      const edgeId = brand<string, "EdgeId">(hit.id);
      const span = blockSource.edges.get(edgeId);
      const arrow = blockSource.arrows.get(edgeId);
      if (span !== undefined) pending = patchAt(span);
      else if (arrow !== undefined) pending = wrapBareEdge(arrow);
    } else {
      const id = brand<string, "NodeId">(hit.id);
      const labelSpan = blockSource.blocks.get(id);
      const groupSpan = blockSource.groups.get(id);
      const bare = blockSource.bareNodes.get(id);
      if (labelSpan !== undefined)
        pending = patchAt(labelSpan); // a leaf's label
      else if (groupSpan !== undefined) {
        // A composite's id *is* its name and is referenced by edges, so renaming it rewrites every
        // occurrence (the `block:id` opener + edge endpoints). The new value must stay a valid id.
        const current = editor.value().slice(groupSpan.start, groupSpan.end);
        pending = {
          text: current,
          commit: (next) => {
            if (next === current) return;
            if (!/^[A-Za-z0-9_]+$/.test(next)) {
              setStatusAndAnnounce("error", "a block id must be letters, digits, or underscores");
              return;
            }
            const renamed = renameBlockId(editor.value(), current, next);
            editor.setValue(renamed);
            void renderFromText(renamed);
          },
        };
      } else if (bare !== undefined) pending = wrapBareLabel(bare, (i, l) => `${i}["${l}"]`);
    }
  } else if (hit !== null && ast.kind === "network" && netSource !== null) {
    if (hit.kind === "edge") {
      const span = netSource.links.get(brand<string, "EdgeId">(hit.id));
      if (span !== undefined) pending = patchAt(span);
    } else {
      const id = brand<string, "NodeId">(hit.id);
      const span = netSource.nodes.get(id) ?? netSource.groups.get(id);
      const bare = netSource.bareNodes.get(id);
      if (span !== undefined) pending = patchAt(span);
      else if (bare !== undefined) pending = wrapBareLabel(bare, (i, l) => `${i} "${l}"`);
    }
  } else if (hit !== null && ast.kind === "cloud" && cloudSource !== null) {
    if (hit.kind === "edge") {
      const span = cloudSource.links.get(brand<string, "EdgeId">(hit.id));
      if (span !== undefined) pending = patchAt(span);
    } else {
      const id = brand<string, "NodeId">(hit.id);
      const span = cloudSource.nodes.get(id) ?? cloudSource.groups.get(id);
      const bare = cloudSource.bareNodes.get(id);
      if (span !== undefined) pending = patchAt(span);
      else if (bare !== undefined) pending = wrapBareLabel(bare, (i, l) => `${i} "${l}"`);
    }
  } else if (hit !== null && ast.kind === "sequence" && seqSource !== null) {
    // A node hit is either an actor box or a note box (notes carry their own text span).
    const span =
      hit.kind === "node"
        ? (seqSource.actors.get(brand<string, "ActorId">(hit.id)) ??
          seqSource.notes.get(brand<string, "SequenceNoteId">(hit.id)))
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
  } else if (hit !== null && ast.kind === "pie" && pieSource !== null && hit.kind === "node") {
    // A slice's invisible marker node carries its id; relabel through its quoted-label span.
    const span = pieSource.slices.get(brand<string, "PieSliceId">(hit.id));
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
  const hit = hitScene(shown, at);
  const groupHit = hit === null ? groupHitAt(shown, at) : null;
  // If something was hit but it has no editable label (e.g. a gitGraph merge edge, a mindmap spoke, an
  // auto-id commit), say so instead of letting the double-click do nothing.
  if (!beginRelabel(shown, hit, groupHit) && (hit !== null || groupHit !== null)) {
    setStatusAndAnnounce("warning", "this item has no editable label");
  }
});

// Add node: append a fresh rect node to the flowchart text (flowchart only for now).
// Append a new node in the active family's own one-line declaration syntax (the node-creation analogue of
// `appendEdge`). `id` is a fresh unique identifier; `label` its display text; `shape` only applies to
// flowchart. Families gated off in `familyAffordances` (mindmap/gitGraph/timeline/pie/gantt — no
// standalone node declaration) return the text unchanged.
const appendNode = (
  kind: DiagramAst["kind"],
  text: string,
  id: string,
  label: string,
  shape: NodeShape,
): string => {
  const body = text === "" || text.endsWith("\n") ? text : `${text}\n`;
  switch (kind) {
    case "flowchart":
      return addNode(text, brand<string, "NodeId">(id), label, shape);
    case "block":
      return `${body}  ${id}["${label}"]\n`;
    case "network":
      return `${body}  server ${id} "${label}"\n`;
    case "sequence":
      return `${body}  participant ${id} as ${label}\n`;
    case "c4":
      // A generic software element (the family's Person/System/Container set); the user can retype it.
      return `${body}  Container(${id}, "${label}")\n`;
    case "cloud":
      // A loose top-level compute service (the user can move it into a group in the text).
      return `${body}  compute ${id} "${label}"\n`;
    // Name-as-id families: the node *is* its identifier (`id` already carries the display name); `label`
    // is unused.
    case "er":
      return `${body}  ${id} {\n  }\n`;
    case "class":
      return `${body}  class ${id}\n`;
    case "state":
      return `${body}  state ${id}\n`;
    // A requirement entity, named by its id (the user can retype `requirement` → `element` or add a body).
    case "requirement":
      return `${body}  requirement ${id} {\n  }\n`;
    default:
      return text;
  }
};

// Families whose node declaration uses the node's name *as* its id; a new node's id is therefore a
// unique, identifier-safe version of its label rather than a generic `n1`.
const NAME_AS_ID = new Set<DiagramAst["kind"]>(["er", "class", "state", "requirement"]);
const sanitizeId = (s: string): string => s.replace(/[^A-Za-z0-9_]/g, "") || "Node";
const uniqueId = (used: ReadonlySet<string>, base: string): string => {
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}${i}`)) i++;
  return `${base}${i}`;
};
const ADD_BASE: Partial<Record<DiagramAst["kind"], string>> = {
  er: "Entity",
  class: "Class",
  state: "State",
  requirement: "Requirement",
};

// A fresh `{ id, label }` for a new node in `kind`: for name-as-id families both are one unique name;
// otherwise a `n<N>` id with a separate display label.
const freshNode = (
  kind: DiagramAst["kind"],
  used: ReadonlySet<string>,
  labelHint: string,
): { readonly id: string; readonly label: string } => {
  if (NAME_AS_ID.has(kind)) {
    const id = uniqueId(used, sanitizeId(labelHint));
    return { id, label: id };
  }
  let n = 1;
  while (used.has(`n${n}`)) n++;
  return { id: `n${n}`, label: labelHint };
};

// The id/label for a *brand new* node (Add / Place): name-as-id families get a unique family-base name
// (Entity/Class/State…); the rest get `n<N>` + a `node <N>` label tracking the id number.
const newNodeIdLabel = (
  kind: DiagramAst["kind"],
  used: ReadonlySet<string>,
): { readonly id: string; readonly label: string } => {
  if (NAME_AS_ID.has(kind)) {
    const id = uniqueId(used, ADD_BASE[kind] ?? "Node");
    return { id, label: id };
  }
  let n = 1;
  while (used.has(`n${n}`)) n++;
  return { id: `n${n}`, label: `node ${n}` };
};

addBtn.addEventListener("click", () => {
  if (viewerMode || ast === null || scene === null || !familyAffordances(ast.kind).addNode) return;
  const used = new Set<string>(scene.nodes.map((n) => n.id));
  const { id, label } = newNodeIdLabel(ast.kind, used);
  const next = appendNode(ast.kind, editor.value(), id, label, "rect");
  if (next === editor.value()) return;
  editor.setValue(next);
  void renderFromText(next);
  flashStatus(`added ${label}`);
});

// Duplicate the selected node(s) (⌘D): append a fresh-id copy of each (same label + shape) in the
// family's own syntax, then — after the re-layout — pin each copy just off its original via an override
// and select the copies. (Edges aren't copied; the duplicates are loose, like Add node.) Works for every
// family whose grammar can append a one-line node decl (`familyAffordances.addNode`).
const duplicateSelection = async (): Promise<void> => {
  if (viewerMode || ast === null || scene === null) return;
  if (!familyAffordances(ast.kind).addNode || selectionOrder.length === 0) return;
  // Read label + shape from the laid scene (family-agnostic) rather than the per-family AST node types.
  const sceneById = new Map(shownScene(scene).nodes.map((nd) => [nd.id, nd]));
  const used = new Set<string>(scene.nodes.map((nd) => nd.id));
  const pairs: Array<{ readonly from: SceneNodeId; readonly to: SceneNodeId }> = [];
  let text = editor.value();
  for (const id of selectionOrder) {
    const orig = sceneById.get(brand<string, "SceneNodeId">(id));
    if (orig === undefined) continue;
    const { id: newId, label } = freshNode(ast.kind, used, orig.label);
    used.add(newId);
    text = appendNode(ast.kind, text, newId, label, orig.shape);
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
  flashStatus(`duplicated ${pairs.length} node${pairs.length === 1 ? "" : "s"}`);
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
    // The button is only enabled when the family supports connect, so an unchanged result means this
    // particular pairing was a no-op (e.g. a mindmap re-parent onto an existing parent or a cycle).
    flashStatus("connect made no change");
    return;
  }
  editor.setValue(text);
  void renderFromText(text);
  flashStatus(connectedMessage(ast.kind, selectionOrder.length - 1));
});

// Families whose connect writes a *placeholder* label the user will usually want to rename right away;
// the connect handlers append this to their announcement so the inserted stub is signposted.
const CONNECT_PLACEHOLDER: Partial<Record<DiagramAst["kind"], string>> = {
  sequence: "message",
  c4: "relationship",
  er: "relationship",
  requirement: "link",
};
const connectHint = (kind: DiagramAst["kind"]): string => {
  const placeholder = CONNECT_PLACEHOLDER[kind];
  return placeholder === undefined
    ? ""
    : ` — added a placeholder ${placeholder} label, double-click to rename`;
};

// A family-accurate confirmation for a completed connect — "connect" means a merge in gitGraph and a
// re-parent in timeline/mindmap, so an "N edges" message would misdescribe what just happened. The
// count form is for the chain-connect button; the labelled form names the two endpoints.
const connectedMessage = (kind: DiagramAst["kind"], count: number): string => {
  switch (kind) {
    case "gitGraph":
      return "merged branch";
    case "timeline":
      return "moved event to period";
    case "mindmap":
      return "re-parented node";
    default:
      return `connected ${count} edge${count === 1 ? "" : "s"}${connectHint(kind)}`;
  }
};
const describeConnect = (kind: DiagramAst["kind"], from: string, to: string): string => {
  switch (kind) {
    case "gitGraph":
      return `merged ${to} into ${from}`;
    case "timeline":
      return "moved event to period"; // role (event vs period) depends on the selection, so don't name
    case "mindmap":
      return `nested ${to} under ${from}`;
    default:
      return `connected ${from} to ${to}${connectHint(kind)}`;
  }
};

// A gitGraph branch lane's scene id is `branch:<name>`; commit nodes carry their commit id instead.
// Returns the branch name, or null when the id isn't a branch lane (so connect ignores commit picks).
const branchName = (id: SceneNodeId): string | null =>
  id.startsWith("branch:") ? id.slice("branch:".length) : null;

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
    // Mindmap connect re-parents `first`→`second` (makes the target a child of the source) by editing the
    // indentation tree; it needs the AST levels + line spans, available from module state here.
    case "mindmap":
      return ast !== null && ast.kind === "mindmap" && mindmapSource !== null
        ? connectMindmap(
            text,
            mindmapSource,
            ast,
            brand<string, "MindmapNodeId">(first),
            brand<string, "MindmapNodeId">(second),
          )
        : text;
    // gitGraph connect = merge two branch lanes. The scene ids are `branch:<name>`; if either selected
    // node isn't a branch (e.g. a commit), there's nothing to merge, so it's a no-op.
    case "gitGraph": {
      const a = branchName(first);
      const b = branchName(second);
      return a !== null && b !== null
        ? connectGitMerge(
            text,
            brand<string, "GitBranchName">(a),
            brand<string, "GitBranchName">(b),
          )
        : text;
    }
    // timeline connect = re-parent an event under a period (drag an event onto a period). Resolve which
    // selected node is the event and which is the period from the AST; any other pairing is a no-op.
    case "timeline": {
      if (ast === null || ast.kind !== "timeline" || timelineSource === null) return text;
      const tAst = ast; // capture the narrowed AST/source so the closures keep the timeline types
      const tSource = timelineSource;
      const isPeriod = (id: SceneNodeId): boolean =>
        tAst.periods.some((p) => p.id === brand<string, "TimelinePeriodId">(id));
      const isEvent = (id: SceneNodeId): boolean =>
        tAst.periods.some((p) =>
          p.events.some((e) => e.id === brand<string, "TimelineEventId">(id)),
        );
      const move = (ev: SceneNodeId, pd: SceneNodeId): string =>
        moveTimelineEvent(
          text,
          tSource,
          tAst,
          brand<string, "TimelineEventId">(ev),
          brand<string, "TimelinePeriodId">(pd),
        );
      if (isEvent(first) && isPeriod(second)) return move(first, second);
      if (isPeriod(first) && isEvent(second)) return move(second, first);
      return text;
    }
    // No edge to draw: gantt/pie have no edge concept.
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
    case "sequence": {
      // A note has no leading id in the text, so it deletes by its captured line span; an actor box
      // deletes by id (which also strips the messages + notes anchored to it).
      const noteSpan = seqSource?.notes.get(brand<string, "SequenceNoteId">(id));
      if (noteSpan !== undefined) return deleteLineAt(text, noteSpan);
      return deleteActor(text, brand<string, "ActorId">(id));
    }
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
    // A block composite (`block:id … end`) deletes as a whole block; a leaf block deletes its line.
    case "block": {
      const blockId = brand<string, "NodeId">(id);
      return ast !== null && ast.kind === "block" && ast.groups.some((g) => g.id === blockId)
        ? deleteBlockGroup(text, blockId)
        : deleteNode(text, blockId);
    }
    // A network subnet/zone group deletes its whole `group "…" { … }` block; a node deletes its line.
    case "network": {
      const netId = brand<string, "NodeId">(id);
      if (ast !== null && ast.kind === "network" && ast.groups.some((g) => g.id === netId)) {
        const span = netSource?.groups.get(netId);
        return span === undefined ? text : deleteGroupBlock(text, span);
      }
      return deleteNode(text, netId);
    }
    // A cloud subnet/group deletes its whole `group "…" { … }` block; a leaf deletes its line.
    case "cloud": {
      const cloudId = brand<string, "NodeId">(id);
      if (ast !== null && ast.kind === "cloud" && ast.groups.some((g) => g.id === cloudId)) {
        const span = cloudSource?.groups.get(cloudId);
        return span === undefined ? text : deleteGroupBlock(text, span);
      }
      return deleteNode(text, cloudId);
    }
    // A flowchart subgraph deletes its whole `subgraph … end` block; a node deletes its line.
    case "flowchart": {
      const flowId = brand<string, "NodeId">(id);
      if (ast !== null && ast.kind === "flowchart" && ast.subgraphs.some((s) => s.id === flowId)) {
        return deleteFlowSubgraph(text, flowId);
      }
      return deleteNode(text, flowId);
    }
    // gitGraph commits are single declaration lines; branch lanes / synthetic ids aren't removable here
    // (deleteSelection reports that honestly).
    case "gitGraph":
      return deleteNode(text, brand<string, "NodeId">(id));
    // A timeline period/event has a synthetic id, so dispatch by the source spans: an event drops its
    // `: <event>` segment, a period drops its line + its `:`-continuation lines (and its events).
    case "timeline": {
      if (timelineSource === null) return text;
      const eventId = brand<string, "TimelineEventId">(id);
      if (timelineSource.events.has(eventId)) {
        return deleteTimelineEvent(text, timelineSource, eventId);
      }
      const periodId = brand<string, "TimelinePeriodId">(id);
      return timelineSource.periods.has(periodId)
        ? deleteTimelinePeriod(text, timelineSource, periodId)
        : text;
    }
    // A mindmap node has no in-text id (synthetic, like a pie slice), so line-based `deleteNode` can't
    // find it; remove the node and its whole subtree by the source-map span + the AST levels.
    case "mindmap":
      return ast !== null && ast.kind === "mindmap" && mindmapSource !== null
        ? deleteMindmapNode(text, mindmapSource, ast, brand<string, "MindmapNodeId">(id))
        : text;
    // gantt/pie: the item has no in-text id (auto-numbered task / synthetic slice id), so delete its
    // line by the label span from the source map. Multi-delete is ordered bottom-up so spans stay valid.
    case "gantt": {
      if (ganttSource === null) return text;
      const span = ganttSource.tasks.get(brand<string, "GanttTaskId">(id));
      return span === undefined ? text : deleteLineAt(text, span);
    }
    case "pie": {
      if (pieSource === null) return text;
      const span = pieSource.slices.get(brand<string, "PieSliceId">(id));
      return span === undefined ? text : deleteLineAt(text, span);
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
// The source-text offset of a span-keyed item's declaration (gantt task / pie slice / timeline
// event-or-period / mindmap node), or -1 if it has no span. These families delete by span, so a
// multi-delete must run bottom-up (highest offset first) — see `deleteSelection`.
const sourceOffset = (id: SceneNodeId): number => {
  const gantt = ganttSource?.tasks.get(brand<string, "GanttTaskId">(id))?.start;
  if (gantt !== undefined) return gantt;
  const pie = pieSource?.slices.get(brand<string, "PieSliceId">(id))?.start;
  if (pie !== undefined) return pie;
  const event = timelineSource?.events.get(brand<string, "TimelineEventId">(id))?.start;
  if (event !== undefined) return event;
  const period = timelineSource?.periods.get(brand<string, "TimelinePeriodId">(id))?.start;
  if (period !== undefined) return period;
  const mindmap = mindmapSource?.nodes.get(brand<string, "MindmapNodeId">(id))?.start;
  if (mindmap !== undefined) return mindmap;
  return -1;
};

// Remove the selected nodes (and their edges) from the source text in the active family's syntax.
// Shared by the Delete key and the selection context toolbar's Delete button.
const deleteSelection = async (): Promise<void> => {
  if (viewerMode || ast === null || scene === null) return;
  if (selectionOrder.length === 0 && selection.edges.size === 0) return;
  const kind = ast.kind;
  // The leaf nodes that should survive (everything not being deleted). In families where nodes are
  // referenced inline on edge lines (`A --> B`), a line-based delete of one node takes the whole line —
  // and with it the *other* endpoint's only reference — so we re-declare any survivor that vanished.
  // Containers are layout artifacts, not source declarations.
  const deleted = new Set<string>(selectionOrder);
  const shown = shownScene(scene);
  const shownById = new Map(shown.nodes.map((n) => [n.id, n]));
  // A node counts as deleted if it *or any ancestor* is being deleted — deleting a container (a c4
  // boundary, a composite state) intentionally removes its nested children, so they aren't "survivors".
  const isDeleted = (node: SceneNode): boolean => {
    let cur: SceneNode | undefined = node;
    const seen = new Set<string>();
    while (cur !== undefined && !seen.has(cur.id)) {
      if (deleted.has(cur.id)) return true;
      seen.add(cur.id);
      cur = cur.parent === null ? undefined : shownById.get(cur.parent);
    }
    return false;
  };
  const survivors = shown.nodes
    .filter((n) => n.shape !== "container" && !isDeleted(n))
    .map((n) => ({ id: n.id, label: n.label, shape: n.shape }));
  let text = editor.value();
  const before = text;
  // The span-keyed families (gantt/pie/timeline/mindmap) delete by source span, so apply them bottom-up:
  // removing a lower line never shifts an earlier span's offset, keeping each remaining span valid
  // against the prior edit. (Was gantt-only — pie/timeline/mindmap multi-delete corrupted the source.)
  const spanKeyed = kind === "gantt" || kind === "pie" || kind === "timeline" || kind === "mindmap";
  const order = spanKeyed
    ? [...selectionOrder].sort((a, b) => sourceOffset(b) - sourceOffset(a))
    : selectionOrder;
  // Count every node that actually disappears (a deleted container takes its descendants), not just the
  // top-level selection — so deleting a subnet of 6 doesn't announce "deleted 1 item".
  const removedCount = shown.nodes.filter(isDeleted).length + selection.edges.size;
  // Deleting a container takes all its descendants. When that cascade removes more than what was
  // directly selected, confirm first — like example-load and Reset — so a stray Delete on a boundary/
  // subgraph doesn't silently wipe its contents.
  const nestedRemoved = removedCount - (selectionOrder.length + selection.edges.size);
  if (
    nestedRemoved > 0 &&
    !window.confirm(
      `Delete this container and its ${nestedRemoved} nested item${nestedRemoved === 1 ? "" : "s"}?`,
    )
  ) {
    return;
  }
  for (const id of order) text = removeNode(kind, text, id);
  for (const edgeId of selection.edges) {
    const edge = scene.edges.find((e) => e.id === edgeId);
    if (edge !== undefined) text = removeEdge(kind, text, edge.from, edge.to);
  }
  if (text === before) {
    // The source didn't change: this item has no removable declaration line — a gitGraph branch lane or
    // a timeline period/event (synthetic ids absent from the text), or a structural edge. Say so loudly
    // instead of claiming a delete that didn't happen.
    setStatusAndAnnounce("warning", "can't delete this from the canvas — remove it in the source");
    return;
  }
  selection = emptySelection;
  selectionOrder = [];
  editor.setValue(text);
  await renderFromText(text);
  // Restore any survivor the delete collaterally dropped (only the inline-edge families can hit this;
  // for the rest every survivor is still present, so this is a no-op). One extra render, only when needed.
  if (scene !== null && familyAffordances(kind).addNode) {
    const present = new Set<string>(scene.nodes.map((n) => n.id));
    let restored = editor.value();
    let changed = false;
    for (const s of survivors) {
      if (present.has(s.id)) continue;
      const next = appendNode(kind, restored, s.id, s.label, s.shape);
      if (next !== restored) {
        restored = next;
        changed = true;
      }
    }
    if (changed) {
      editor.setValue(restored);
      await renderFromText(restored);
    }
  }
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
  void deleteSelection();
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
    // Duplicate the selected node(s), overriding the browser's ⌘D bookmark — but only for families that
    // can add a node, else we'd swallow the keystroke and silently do nothing.
    if (viewerMode || selectionOrder.length === 0) return;
    if (ast === null || isDotImport || !familyAffordances(ast.kind).addNode) return;
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
  const shown = scene === null ? null : shownScene(scene);
  for (const id of selection.nodes) {
    if (pathLocked(doc.groups(), id)) continue;
    const top = topGroupOfNode(doc.groups(), id);
    const seeds = top === null ? [id] : leafNodes(doc.groups(), top);
    for (const seed of seeds)
      for (const m of shown === null ? [seed] : withContents(shown, seed)) ids.add(m);
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
  let lastShape: NodeShape = "rect";
  for (const t of targets) {
    const idx = SHAPE_CYCLE.indexOf(t.node.shape);
    const next = SHAPE_CYCLE[(idx + 1) % SHAPE_CYCLE.length] ?? "rect";
    lastShape = next;
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
  // Announce the outcome — every other mutating action does, so a screen-reader user gets parity.
  flashStatus(
    targets.length === 1 ? `shape: ${lastShape}` : `cycled shape of ${targets.length} nodes`,
  );
  canvas.focus({ preventScroll: true });
};

// Cycle the single selected flowchart/block edge's presentational style by rewriting its arrow token.
const EDGE_STYLE_CYCLE: readonly EdgeKind[] = ["arrow", "open", "dotted", "thick"];
const cycleEdgeStyle = async (): Promise<void> => {
  if (viewerMode || ast === null || selection.edges.size !== 1) return;
  const edgeId = [...selection.edges][0];
  if (edgeId === undefined) return;
  const eid = brand<string, "EdgeId">(edgeId);
  let arrowSpan: TextSpan | undefined;
  let currentKind: EdgeKind | undefined;
  if (ast.kind === "flowchart" && source !== null) {
    arrowSpan = source.arrows.get(eid);
    currentKind = ast.edges.find((e) => e.id === eid)?.kind;
  } else if (ast.kind === "block" && blockSource !== null) {
    arrowSpan = blockSource.arrows.get(eid);
    currentKind = ast.edges.find((e) => e.id === eid)?.kind;
  }
  if (arrowSpan === undefined || currentKind === undefined) return;
  const idx = EDGE_STYLE_CYCLE.indexOf(currentKind);
  const next = EDGE_STYLE_CYCLE[(idx + 1) % EDGE_STYLE_CYCLE.length] ?? "arrow";
  const text = restyleEdge(editor.value(), arrowSpan, next);
  editor.setValue(text);
  await renderFromText(text);
  // Keep the edge selected so a repeated press keeps cycling it.
  selection = { nodes: new Set(), edges: new Set([brand<string, "SceneEdgeId">(edgeId)]) };
  selectionOrder = [];
  paintScene();
  updateGroupButtons();
  flashStatus(`edge style: ${next}`);
  canvas.focus({ preventScroll: true });
};

const ctxButtons = (): HTMLButtonElement[] =>
  Array.from(contextBar.querySelectorAll<HTMLButtonElement>("button")).filter(
    (b) => !b.hidden && !b.disabled,
  );

// Move keyboard focus into the floating action bar (F2 from the navigator), so a keyboard user reaches
// rename/shape/connect/duplicate/group/lock/arrange/delete without a mouse. No-op when nothing's shown.
const focusContextBar = (): void => {
  if (contextBar.hidden) return;
  ctxButtons()[0]?.focus();
};

// The bar is a `role="toolbar"`: arrows rove between its buttons, Escape hands focus back to the
// diagram navigator (the keyboard user's home), matching the ARIA toolbar pattern.
contextBar.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    ev.preventDefault();
    diagramNav.focus();
    return;
  }
  const btns = ctxButtons();
  if (btns.length === 0) return;
  const active = document.activeElement;
  const here = active instanceof HTMLButtonElement ? btns.indexOf(active) : -1;
  if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
    ev.preventDefault();
    const next = btns[(here + 1) % btns.length] ?? null;
    setCtxRoving(next);
    next?.focus();
  } else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
    ev.preventDefault();
    const prev = btns[(here - 1 + btns.length) % btns.length] ?? null;
    setCtxRoving(prev);
    prev?.focus();
  }
});

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
  if (hit !== null && !beginRelabel(shownScene(scene), hit, null)) {
    setStatusAndAnnounce("warning", "this item has no editable label");
  }
});
ctxShapeBtn.addEventListener(
  "click",
  () =>
    void (selection.edges.size === 1 && selectionOrder.length === 0
      ? cycleEdgeStyle()
      : cycleShape()),
);
ctxDuplicateBtn.addEventListener("click", () => void duplicateSelection());
ctxConnectBtn.addEventListener("click", () => connectBtn.click());
ctxGroupBtn.addEventListener("click", () => groupBtn.click());
ctxUngroupBtn.addEventListener("click", () => ungroupBtn.click());
ctxLockBtn.addEventListener("click", () => lockBtn.click());
ctxArrangeBtn.addEventListener("click", (ev) => {
  ev.stopPropagation();
  toggleArrange(ctxArrangeBtn, ctxArrangeBtn); // anchor the menu to the on-canvas button, not the editor pane
});
ctxDeleteBtn.addEventListener("click", () => void deleteSelection());

window.addEventListener("keydown", (ev) => {
  // Suppress canvas shortcuts while either text editor has focus — otherwise a bare letter like `s`
  // typed into the inline label editor would also fire its canvas action (e.g. cycle the node shape).
  if (editor.hasFocus() || (inlineEl !== null && document.activeElement === inlineEl)) return;
  if (ev.key === "Escape") {
    // An open Arrange menu closes first (parity with the Help/Icons drawers, which honour Escape).
    if (!arrangeMenu.hidden) {
      ev.preventDefault();
      closeArrange();
      arrangeBtn.focus();
      return;
    }
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
      if (viewerMode || ast === null) return;
      // A single selected edge cycles its arrow style (flowchart/block); a node cycles its shape.
      if (selection.edges.size === 1 && selectionOrder.length === 0) {
        ev.preventDefault();
        void cycleEdgeStyle();
        break;
      }
      if (selectionOrder.length === 0) return;
      // With a node selection, explain why nothing happens off-flowchart instead of a silent no-op
      // (parity with the navigator). `isDotImport` parses to flowchart but with an empty source map.
      if (ast.kind !== "flowchart" || isDotImport) {
        ev.preventDefault();
        flashStatus(
          isDotImport
            ? "DOT import is read-only — edit the source text"
            : "shape change is only available for flowchart",
        );
        return;
      }
      ev.preventDefault();
      void cycleShape();
      break;
    case "e":
    case "E":
      // Collapse / expand the selected cloud group.
      if (ast !== null && ast.kind === "cloud") {
        ev.preventDefault();
        toggleCloudCollapse();
      }
      break;
    case "F2":
      // Jump to the floating action bar for the current selection.
      if (!contextBar.hidden) {
        ev.preventDefault();
        focusContextBar();
      }
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
  setStatusAndAnnounce("ok", "regenerated layout — pinned nodes kept");
});

// Reset positions: clear EVERY manual position/resize (pinned included) so the diagram returns to its
// from-text default layout. Groups are kept (they're structural, not positional). Undoable.
const resetPositions = async (): Promise<void> => {
  if (viewerMode || isInteracting()) return; // the `window.__resetPositions` hook can fire mid-gesture
  if (doc.overrides().size === 0) {
    flashStatus("already at the default layout");
    return;
  }
  doc.record();
  doc.clearOverrides();
  doc.persist();
  // Await the re-render before announcing — `renderFromText` writes the diagram summary to the status
  // bar, so setting our message after it (not before) is what the user actually sees.
  await renderFromText(editor.value());
  setStatusAndAnnounce("ok", "reset to default positions");
};
resetPosBtn.addEventListener("click", () => void resetPositions());
// API hook: clear the overlay's manual positions from script/console.
window.__resetPositions = () => void resetPositions();
window.__overrideCount = () => doc.overrides().size;
// e2e hook: the text currently highlighted in the source editor (the canvas-selection echo).
window.__editorHighlight = () => {
  const src = editor.value();
  return editor
    .highlightedRanges()
    .map((r) => src.slice(r.from, r.to))
    .join("|");
};

// Theme toggle: switch the palette, persist the explicit choice, and repaint (colours only). The
// `data-theme` attribute drives the page chrome so it stays cohesive with the canvas surface.
const syncThemeLabel = (): void => {
  themeBtn.textContent = themeCtl.toggleLabel();
  document.documentElement.setAttribute("data-theme", themeCtl.isDark() ? "dark" : "light");
};
themeBtn.addEventListener("click", () => {
  themeCtl.toggleTheme();
  syncThemeLabel();
  // Authored line-art glyphs bake in the theme foreground, so drop them and re-rasterise for the new
  // theme before repainting (re-ensure is a no-op when nothing's cached / the diagram has no icons).
  iconImages.clear();
  if (scene !== null) void ensureIcons(scene).then(() => paintScene());
  else paintScene();
  announce(`${themeCtl.isDark() ? "dark" : "light"} theme`);
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
  themeCtl.toggleSketch();
  sketchBtn.textContent = themeCtl.isSketch() ? "Crisp" : "Sketch";
  // Line-art glyphs bake the active foreground (the glyph-cache key is theme-agnostic), so drop the cache
  // here too — otherwise crisp-baked glyphs persist into sketch mode (matches the theme toggle above).
  iconImages.clear();
  void renderFromText(editor.value());
  announce(themeCtl.isSketch() ? "sketch mode" : "crisp mode");
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

// Mark the page chrome inert while a modal dialog is open: `aria-modal` alone is advisory, so without
// this a screen-reader virtual cursor can still browse the toolbar/canvas behind the dialog. The modals
// are siblings of these regions, so they stay interactive.
const setChromeInert = (inert: boolean): void => {
  for (const sel of [".topbar", ".workbench", ".statusbar"]) {
    const el = document.querySelector(sel);
    if (el instanceof HTMLElement) el.inert = inert;
  }
};

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
    setChromeInert(true);
  } else {
    // Clear inert before restoring focus — the trigger lives in the (until now) inert chrome.
    setChromeInert(false);
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
    setChromeInert(true);
  } else {
    setChromeInert(false);
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

// The image/file exporters (PNG / Copy / PDF / SVG / DOT) live in `./image-export.ts`; they only read
// the current diagram, so they take getters for the live scene/theme/registry and a status sink.
installImageExport({
  buttons: {
    png: exportBtn,
    copy: copyBtn,
    pdf: exportPdfBtn,
    svg: exportSvgBtn,
    dot: exportDotBtn,
  },
  margin: MARGIN,
  getScene: () => scene,
  shownScene,
  isRenderValid: () => currentRenderValid,
  activeTheme,
  getDirection: () => lastDirection,
  iconImages,
  getRegistry: () => registry,
  setStatus: setStatusAndAnnounce,
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

// Past this the URL risks silent truncation when pasted into chat/email clients (the `#src=` hash isn't
// sent to servers, but messengers clip long links). Warn loudly rather than report a confident "copied"
// on a link the recipient can't open.
const SHARE_URL_MAX = 8000;

shareBtn.addEventListener("click", () => {
  const url = shareUrl();
  history.replaceState(null, "", url);
  if (url.length > SHARE_URL_MAX) {
    setStatusAndAnnounce(
      "warning",
      `diagram is large — share link is ${url.length} chars and may be truncated when pasted (it's in the address bar)`,
    );
    return;
  }
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
  clearPersisted();
  location.replace(location.pathname);
});

// A `#src=…` hash (a shared link) wins over the persisted source, which wins over the sample.
const fromHash = hashValue("src");
const initialSource = fromHash ?? loadSource() ?? SAMPLE;
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
    const rawOverlay = loadOverlay();
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
  // Persist immediately so a reload (or a crash) right after the last keystroke never loses it. Then
  // either render now (leading edge of a burst) or queue a trailing render for when the cooldown ends.
  saveSource(text);
  if (renderCooldown === null) {
    void renderFromText(text); // leading edge of a burst: render now
    armRenderCooldown();
  } else {
    renderQueued = true; // within the cooldown: coalesce into the trailing render
  }
};
editor =
  collabSession !== null
    ? createEditor(editorMount, "", onTextChange, {
        extra: [collabSession.sourceBinding()],
        textHistory: false,
      })
    : createEditor(editorMount, initialSource, onTextChange);
editorReady = true;

// The keyboard diagram navigator (a focusable listbox over the scene's nodes/edges) lives in
// `./navigator.ts`; it drives the canvas selection and the relabel/connect/nudge commands through this
// port. Created here — after the editor and every command it calls exist — and its `rebuild` runs from
// the render path.
const setSelection = (sel: Selection, order: readonly SceneNodeId[]): void => {
  selection = sel;
  selectionOrder = [...order];
};
const navController = createNavigator({
  diagramNav,
  stageWrap,
  margin: MARGIN,
  getScene: () => scene,
  getRenderedScene: () => lastRender?.scene ?? null,
  getAst: () => ast,
  canConnect: (kind) => familyAffordances(kind).connect && !isDotImport,
  describeConnect,
  isViewerMode: () => viewerMode,
  editor,
  scrollToLogical,
  announce,
  paintScene,
  updateGroupButtons,
  setSelection,
  nudgeSelection,
  groupSelection,
  ungroupSelection,
  toggleCloudCollapse,
  cycleShape,
  focusContextBar,
  getGroups: () => [...doc.groups().values()].map((g) => ({ id: g.id, label: g.label })),
  selectGroup,
  scrollToGroup,
  beginRelabel,
  shownScene,
  appendEdge,
  renderFromText,
});
// Now that the navigator exists, let the (earlier-defined) group handlers refresh its group list.
refreshNavigatorGroups = () => navController.rebuild();

// Restore the saved source-panel collapse preference before the first render so the canvas is sized
// right from the start (no flash of the expanded layout).
setSourceCollapsed(loadSourceCollapsed(), false);

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
  // A `?ws=` override lets a shared `?collab` link point a victim's session (source + edits, and any
  // forwarded token) at an arbitrary relay. A scheme check alone doesn't stop that — require the host to
  // match this page's origin (a different relay port on the same host is fine), so a crafted link can't
  // exfiltrate the document/token to `wss://evil.example`. Reject loudly and fall back to the default.
  const wsOverride = params.get("ws");
  const sameOriginWs = (raw: string): boolean => {
    if (!URL.canParse(raw)) return false;
    const u = new URL(raw);
    return (u.protocol === "ws:" || u.protocol === "wss:") && u.hostname === location.hostname;
  };
  const wsAllowed = wsOverride !== null && sameOriginWs(wsOverride);
  if (wsOverride !== null && !wsAllowed) {
    console.error(`collab: rejected ?ws= relay override (not same-origin): ${wsOverride}`);
  }
  const wsBase = wsAllowed ? wsOverride : `${scheme}://${location.hostname || "localhost"}:1234`;
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
    // The relax/regenerate/reset/add buttons gate on `viewerMode`, but they're set in `applyKind`
    // (render-time), so re-apply the current kind here — a role flip alone doesn't re-render.
    if (ast !== null) applyKind(ast.kind);
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
      setStatus("warning", "disconnected from the collaboration relay — editing locally");
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
