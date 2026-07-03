import type { Scene } from "@m/contracts";
import type { Theme } from "@m/renderer";

// The last laid-out scene + logical sheet size the minimap renders from — a *simplified* view (node
// blocks + faint edges), not the full display list, since shrunk labels/icons would just be noise.
export interface MinimapRender {
  readonly scene: Scene;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
}

// The minimap only reads the current render + theme and drives the stage scroll; it owns the rest
// (offscreen cache, viewport scrim, pointer/keyboard nav) behind this deps port.
export interface MinimapDeps {
  readonly minimap: HTMLCanvasElement;
  // The collapse toggle: the map is an always-available overview now (not just an overflow aid), so
  // the user decides whether it takes corner space. The choice persists via `persistCollapsed`.
  readonly toggle: HTMLButtonElement;
  readonly initiallyCollapsed: boolean;
  readonly persistCollapsed: (collapsed: boolean) => void;
  readonly miniCtx: CanvasRenderingContext2D;
  readonly stageWrap: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  // The diagram's MARGIN inset (sheet origin) and the thumbnail's max box (px).
  readonly margin: number;
  readonly maxSize: number;
  readonly getRender: () => MinimapRender | null;
  readonly getViewScale: () => number;
  readonly activeTheme: () => Theme;
  readonly isDark: () => boolean;
  readonly forcedColors: () => boolean;
  // Centre the stage viewport on a point in the diagram's logical px (shared with the keyboard nav).
  readonly scrollToLogical: (logicalX: number, logicalY: number) => void;
  readonly announce: (message: string) => void;
}

const syncToggle = (toggle: HTMLButtonElement, collapsed: boolean): void => {
  toggle.setAttribute("aria-pressed", collapsed ? "false" : "true");
  toggle.textContent = collapsed ? "Map" : "Hide map";
};

export interface MinimapController {
  // Re-render the (cached) static content; call only when the scene/theme changes.
  readonly rebuildCache: () => void;
  // Blit the cache + redraw the viewport scrim; cheap, call on every scroll/pan.
  readonly draw: () => void;
}

const ACCENT_LIGHT = "#d2602c";
const ACCENT_DARK = "#f0894e";

export const createMinimap = (deps: MinimapDeps): MinimapController => {
  const { minimap, miniCtx, stageWrap, canvas, margin, maxSize } = deps;
  let collapsed = deps.initiallyCollapsed;

  // The static content (background + faint edges + node blocks) is cached to an offscreen canvas,
  // rebuilt only when the scene/theme changes. A scroll then just blits the cache and redraws the
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

  const rebuildCache = (): void => {
    miniLayout = null;
    const render = deps.getRender();
    if (render === null || miniCacheCtx === null) return;
    const { scene, logicalWidth, logicalHeight } = render;

    const scale = Math.min(maxSize / logicalWidth, maxSize / logicalHeight);
    const dpr = window.devicePixelRatio || 1;
    miniCache.width = Math.round(logicalWidth * scale * dpr);
    miniCache.height = Math.round(logicalHeight * scale * dpr);

    const active = deps.activeTheme();
    // Work in logical coordinates (origin at the sheet's content, matching the canvas's margin inset).
    miniCacheCtx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    miniCacheCtx.clearRect(0, 0, logicalWidth, logicalHeight);
    miniCacheCtx.fillStyle = active.background;
    miniCacheCtx.fillRect(0, 0, logicalWidth, logicalHeight);
    miniCacheCtx.save();
    miniCacheCtx.translate(margin - scene.extent.origin.x, margin - scene.extent.origin.y);
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

  const draw = (): void => {
    const render = deps.getRender();
    if (miniLayout === null || render === null || collapsed) {
      minimap.hidden = true;
      deps.toggle.hidden = miniLayout === null || render === null; // no diagram → no toggle either
      return;
    }
    minimap.hidden = false;
    deps.toggle.hidden = false;
    const { logicalWidth, logicalHeight } = render;
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
    const viewScale = deps.getViewScale();
    const canvasRect = canvas.getBoundingClientRect();
    const wrapRect = stageWrap.getBoundingClientRect();
    const left = Math.max(0, (wrapRect.left - canvasRect.left) / viewScale);
    const top = Math.max(0, (wrapRect.top - canvasRect.top) / viewScale);
    const right = Math.min(logicalWidth, left + stageWrap.clientWidth / viewScale);
    const bottom = Math.min(logicalHeight, top + stageWrap.clientHeight / viewScale);

    // Dim everything *outside* the viewport with a scrim (four bands), leaving the visible region
    // bright — the strongest "you are here" cue at this size.
    const highContrast = deps.forcedColors();
    const dark = deps.isDark();
    miniCtx.fillStyle = highContrast
      ? "Canvas"
      : dark
        ? "rgba(7,16,15,0.5)"
        : "rgba(24,37,41,0.34)";
    miniCtx.fillRect(0, 0, logicalWidth, top);
    miniCtx.fillRect(0, bottom, logicalWidth, logicalHeight - bottom);
    miniCtx.fillRect(0, top, left, bottom - top);
    miniCtx.fillRect(right, top, logicalWidth - right, bottom - top);

    // A faint accent tint inside the viewport so the "here" region reads as a lit lens, not just an
    // un-dimmed gap — the scrim outside and the tint inside push the contrast from both sides.
    const accent = highContrast ? "Highlight" : dark ? ACCENT_DARK : ACCENT_LIGHT;
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

  // Click or drag in the minimap to centre the stage viewport on that point (minimap px → logical px).
  let dragging = false;
  const navigate = (ev: PointerEvent): void => {
    const render = deps.getRender();
    if (render === null || minimap.hidden) return;
    const rect = minimap.getBoundingClientRect();
    const miniScale = rect.width / render.logicalWidth;
    deps.scrollToLogical((ev.clientX - rect.left) / miniScale, (ev.clientY - rect.top) / miniScale);
  };
  minimap.addEventListener("pointerdown", (ev) => {
    dragging = true;
    minimap.setPointerCapture(ev.pointerId);
    navigate(ev);
  });
  minimap.addEventListener("pointermove", (ev) => {
    if (dragging) navigate(ev);
  });
  minimap.addEventListener("pointerup", (ev) => {
    dragging = false;
    minimap.releasePointerCapture(ev.pointerId);
  });
  minimap.addEventListener("keydown", (ev) => {
    if (deps.getRender() === null || minimap.hidden) return;
    const step = ev.shiftKey ? 120 : 40;
    let message: string | null = null;
    if (ev.key === "ArrowLeft") {
      ev.preventDefault();
      stageWrap.scrollLeft -= step;
      message = "panned diagram left";
    } else if (ev.key === "ArrowRight") {
      ev.preventDefault();
      stageWrap.scrollLeft += step;
      message = "panned diagram right";
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      stageWrap.scrollTop -= step;
      message = "panned diagram up";
    } else if (ev.key === "ArrowDown") {
      ev.preventDefault();
      stageWrap.scrollTop += step;
      message = "panned diagram down";
    } else if (ev.key === "Home") {
      ev.preventDefault();
      stageWrap.scrollLeft = 0;
      stageWrap.scrollTop = 0;
      message = "panned diagram to the top left";
    } else if (ev.key === "End") {
      ev.preventDefault();
      stageWrap.scrollLeft = stageWrap.scrollWidth;
      stageWrap.scrollTop = stageWrap.scrollHeight;
      message = "panned diagram to the bottom right";
    }
    if (message !== null) deps.announce(message);
  });
  // The viewport rectangle scales with the window; rebuild + redraw on resize.
  window.addEventListener("resize", () => {
    rebuildCache();
    draw();
  });

  syncToggle(deps.toggle, collapsed);
  deps.toggle.addEventListener("click", () => {
    collapsed = !collapsed;
    syncToggle(deps.toggle, collapsed);
    deps.persistCollapsed(collapsed);
    draw();
    deps.announce(collapsed ? "overview map hidden" : "overview map shown");
  });

  return { rebuildCache, draw };
};
