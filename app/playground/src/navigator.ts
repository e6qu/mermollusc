import type { HitTarget, Selection } from "@m/builder";
import type { DiagramAst, GroupId, Scene, SceneEdgeId, SceneNodeId } from "@m/contracts";
import { edgeLabelAnchor } from "@m/renderer";
import type { Editor } from "./editor.js";

// The keyboard diagram navigator: a focusable listbox mirrors the scene's nodes and edges so the
// diagram is operable without a mouse. Arrow keys move the active option, which drives the canvas
// selection and centres it in view; a live region announces it. It dispatches the same commands the
// canvas does (select, relabel, nudge, connect), so it takes them — plus the live scene/render — as a
// deps port rather than reaching into module state.
export interface NavigatorDeps {
  readonly diagramNav: HTMLUListElement;
  readonly stageWrap: HTMLElement;
  readonly margin: number;
  readonly getScene: () => Scene | null;
  // The scene that was last painted (used for centring); usually identical to getScene().
  readonly getRenderedScene: () => Scene | null;
  readonly getAst: () => DiagramAst | null;
  // Whether the family's grammar can accept a new edge — so keyboard Connect (`c`) doesn't arm a source
  // and walk the user into a two-step gesture that can't commit. Mirrors the palette/button gating.
  readonly canConnect: (kind: DiagramAst["kind"]) => boolean;
  // A trailing hint for the connect announcement (e.g. "added a placeholder label, …"); "" when none.
  readonly connectHint: (kind: DiagramAst["kind"]) => string;
  readonly isViewerMode: () => boolean;
  readonly editor: Editor;
  readonly scrollToLogical: (logicalX: number, logicalY: number) => void;
  readonly announce: (message: string) => void;
  readonly paintScene: () => void;
  readonly updateGroupButtons: () => void;
  readonly setSelection: (selection: Selection, order: readonly SceneNodeId[]) => void;
  readonly nudgeSelection: (dx: number, dy: number) => void;
  // Group / ungroup the current selection (the app announces a no-op below two units / no group).
  readonly groupSelection: () => void;
  readonly ungroupSelection: () => void;
  readonly beginRelabel: (shown: Scene, hit: HitTarget | null, group: GroupId | null) => boolean;
  readonly shownScene: (base: Scene) => Scene;
  readonly appendEdge: (
    kind: DiagramAst["kind"],
    text: string,
    first: SceneNodeId,
    second: SceneNodeId,
  ) => string;
  readonly renderFromText: (text: string) => Promise<void>;
}

export interface NavigatorController {
  // Rebuild the listbox to mirror the current scene (resets the active item). Call after each render.
  readonly rebuild: () => void;
}

const ARROW_DELTA: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export const createNavigator = (deps: NavigatorDeps): NavigatorController => {
  const { diagramNav, stageWrap, margin, announce } = deps;

  // The navigator's options are the scene's nodes then its edges, each a focus target. `HitTarget` is
  // the node/edge shape the selection and relabel paths already speak, so an item feeds them directly.
  let navItems: HitTarget[] = [];
  let navIndex = -1; // the active option's index into `navItems`, or -1 when nothing is active yet
  // The accumulated multi-node selection (Shift+Arrow extends it) — so a keyboard user can select two
  // nodes to Connect or several to Group, mirroring Shift-click on the canvas. Order is insertion order.
  let navSelectedOrder: SceneNodeId[] = [];
  // The chosen source while a keyboard Connect is in progress (press `c` to pick it, navigate, `c`
  // again to connect to the target). Cleared on connect, cancel, or any re-render.
  let navConnectSource: SceneNodeId | null = null;
  const navActive = (): HitTarget | null => (navIndex >= 0 ? (navItems[navIndex] ?? null) : null);

  const navLabel = (id: SceneNodeId): string => {
    const node = deps.getScene()?.nodes.find((n) => n.id === id);
    return node !== undefined && node.label.length > 0 ? node.label : "node";
  };

  // An edge spoken as "Alpha to Beta" plus its own label, if any, readable without the visual arrow.
  const edgeLabel = (id: SceneEdgeId): string => {
    const edge = deps.getScene()?.edges.find((e) => e.id === id);
    if (edge === undefined) return "edge";
    const ends = `${navLabel(edge.from)} to ${navLabel(edge.to)}`;
    return edge.label !== null && edge.label.length > 0 ? `${ends}, ${edge.label}` : ends;
  };

  // A spoken summary of a node's edges, so a screen-reader user grasps the topology, not just the node
  // list: "to Gamma; from Alpha" (capped so a hub node stays concise), or "no connections".
  const describeConnections = (id: SceneNodeId): string => {
    const scene = deps.getScene();
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

  const centerOnNode = (id: SceneNodeId): void => {
    const scene = deps.getRenderedScene();
    if (scene === null) return;
    const node = scene.nodes.find((n) => n.id === id);
    if (node === undefined) return;
    const cx = node.bounds.origin.x + node.bounds.size.width / 2;
    const cy = node.bounds.origin.y + node.bounds.size.height / 2;
    deps.scrollToLogical(margin - scene.extent.origin.x + cx, margin - scene.extent.origin.y + cy);
  };

  const centerOnEdge = (id: SceneEdgeId): void => {
    const scene = deps.getRenderedScene();
    if (scene === null) return;
    const edge = scene.edges.find((e) => e.id === id);
    if (edge === undefined) return;
    const anchor = edgeLabelAnchor(edge.waypoints);
    const origin = scene.extent.origin;
    deps.scrollToLogical(margin - origin.x + anchor.x, margin - origin.y + anchor.y);
  };

  const rebuild = (): void => {
    // Remember where the keyboard user was so an edit/re-render doesn't dump them back at the top.
    const prevActive = navActive();
    const prevSelected = navSelectedOrder;
    diagramNav.replaceChildren();
    diagramNav.removeAttribute("aria-activedescendant");
    navIndex = -1;
    navSelectedOrder = [];
    navConnectSource = null;
    const scene = deps.getScene();
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
        item.kind === "node"
          ? navLabel(item.id) || `node ${i + 1}`
          : `${edgeLabel(item.id)} (edge)`;
      diagramNav.appendChild(option);
    });
    // Restore the active item + multi-selection by id (silently — re-announcing on every render would
    // spam a screen reader while editing source text). The next arrow press continues from here.
    navSelectedOrder = prevSelected.filter((id) => scene.nodes.some((n) => n.id === id));
    if (prevActive !== null) {
      const idx = navItems.findIndex(
        (it) => it.kind === prevActive.kind && it.id === prevActive.id,
      );
      if (idx >= 0) {
        navIndex = idx;
        const option = diagramNav.children[idx];
        if (option !== undefined) diagramNav.setAttribute("aria-activedescendant", option.id);
      }
    }
    Array.from(diagramNav.children).forEach((child, i) => {
      const it = navItems[i];
      const selected = it !== undefined && it.kind === "node" && navSelectedOrder.includes(it.id);
      child.setAttribute("aria-selected", selected ? "true" : "false");
    });
  };

  // `additive` (Shift+Arrow) extends the multi-node selection instead of replacing it.
  const setNavActive = (index: number, additive = false): void => {
    if (navItems.length === 0) return;
    const clamped = Math.max(0, Math.min(index, navItems.length - 1));
    const item = navItems[clamped];
    const option = diagramNav.children[clamped];
    if (item === undefined || option === undefined) return;
    diagramNav.setAttribute("aria-activedescendant", option.id);
    navIndex = clamped;
    const position = `${clamped + 1} of ${navItems.length}`;
    // Drive the canvas selection so the item highlights and the existing Delete handler can remove it.
    if (item.kind === "node") {
      if (additive) {
        if (!navSelectedOrder.includes(item.id)) navSelectedOrder = [...navSelectedOrder, item.id];
      } else {
        navSelectedOrder = [item.id];
      }
      deps.setSelection({ nodes: new Set(navSelectedOrder), edges: new Set() }, navSelectedOrder);
      deps.paintScene();
      deps.updateGroupButtons();
      centerOnNode(item.id);
      const count = navSelectedOrder.length > 1 ? ` — ${navSelectedOrder.length} selected` : "";
      announce(`${navLabel(item.id)}, ${position}${count}. ${describeConnections(item.id)}`);
    } else {
      navSelectedOrder = [];
      deps.setSelection({ nodes: new Set(), edges: new Set([item.id]) }, []);
      deps.paintScene();
      deps.updateGroupButtons();
      centerOnEdge(item.id);
      announce(`${edgeLabel(item.id)}, edge, ${position}`);
    }
    // Keep the listbox's aria-selected in sync with the (possibly multi-) node selection.
    Array.from(diagramNav.children).forEach((child, i) => {
      const it = navItems[i];
      const selected =
        it !== undefined && it.kind === "node" ? navSelectedOrder.includes(it.id) : i === clamped;
      child.setAttribute("aria-selected", selected ? "true" : "false");
    });
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

  diagramNav.addEventListener("keydown", (ev) => {
    const scene = deps.getScene();
    if (scene === null || navItems.length === 0) return;
    const item = navActive();
    const viewerMode = deps.isViewerMode();
    // Alt+Arrow nudges the active node (keyboard parity with drag; Shift = a bigger step); the move
    // drives the same override path as dragging, so it shares one undo entry per run. Edges aren't
    // positioned.
    const delta = ARROW_DELTA[ev.key];
    if (ev.altKey && delta !== undefined && item?.kind === "node" && !viewerMode) {
      ev.preventDefault();
      const step = ev.shiftKey ? 10 : 1;
      deps.nudgeSelection(delta[0] * step, delta[1] * step);
      announce(`moved ${navLabel(item.id)}`);
      return;
    }
    if (ev.key === "ArrowDown" || ev.key === "ArrowRight") {
      ev.preventDefault();
      setNavActive(navIndex + 1, ev.shiftKey); // Shift extends the multi-selection
    } else if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") {
      ev.preventDefault();
      setNavActive(navIndex <= 0 ? 0 : navIndex - 1, ev.shiftKey);
    } else if ((ev.key === "g" || ev.key === "G") && !viewerMode) {
      // Group the multi-selection (parity with the Group button); a no-op below two units, which the
      // app's groupSelection announces.
      ev.preventDefault();
      deps.groupSelection();
    } else if ((ev.key === "u" || ev.key === "U") && !viewerMode) {
      ev.preventDefault();
      deps.ungroupSelection();
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
      deps.beginRelabel(deps.shownScene(scene), item, null);
    } else if (
      (ev.key === "c" || ev.key === "C") &&
      item?.kind === "node" &&
      deps.getAst() !== null &&
      !viewerMode
    ) {
      // Two-step keyboard Connect: `c` picks the active node as the source, navigate to a target, `c`
      // again draws the edge in the family's own syntax (parity with an Alt-drag between nodes).
      ev.preventDefault();
      const ast = deps.getAst();
      if (ast === null) return;
      // Gate up front so the user isn't armed into a gesture the grammar can't accept.
      if (!deps.canConnect(ast.kind)) {
        announce(`connect isn't available for ${ast.kind}`);
        return;
      }
      if (navConnectSource === null) {
        navConnectSource = item.id;
        announce(`connecting from ${navLabel(item.id)} — move to a target and press c`);
      } else if (navConnectSource === item.id) {
        announce("connect cancelled");
        navConnectSource = null;
      } else {
        const from = navLabel(navConnectSource);
        const to = navLabel(item.id);
        const text = deps.appendEdge(ast.kind, deps.editor.value(), navConnectSource, item.id);
        navConnectSource = null;
        if (text === deps.editor.value()) {
          announce("connect isn't available for this diagram");
        } else {
          deps.editor.setValue(text);
          void deps.renderFromText(text);
          announce(`connected ${from} to ${to}${deps.connectHint(ast.kind)}`);
        }
      }
    } else if (ev.key === "Escape" && navConnectSource !== null) {
      ev.preventDefault();
      navConnectSource = null;
      announce("connect cancelled");
    }
  });

  return { rebuild };
};
