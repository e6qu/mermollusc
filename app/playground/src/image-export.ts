import type { FlowDirection, Scene } from "@m/contracts";
import { findIcon, type IconRegistry } from "@m/icons";
import { paint, toDisplayList, toDot, toSvg, type Theme } from "@m/renderer";
import { isOk, messageOf } from "@m/std";
import { buildImagePdf, bytesOf } from "./pdf.js";
import { svgDataUrl } from "./raster.js";

// The image/file exporters (PNG, Copy-to-clipboard, PDF, SVG, DOT). They only *read* the current
// diagram — never mutate the interaction state — so they live behind a thin deps port: the app passes
// getters for the live scene + theme + registry and a status sink, and this module owns the rest.
export interface ImageExportDeps {
  readonly buttons: {
    readonly png: HTMLButtonElement;
    readonly copy: HTMLButtonElement;
    readonly pdf: HTMLButtonElement;
    readonly svg: HTMLButtonElement;
    readonly dot: HTMLButtonElement;
  };
  readonly margin: number;
  readonly getScene: () => Scene | null;
  // The scene with the manual overlay applied (the same one painted on screen).
  readonly shownScene: (base: Scene) => Scene;
  readonly isRenderValid: () => boolean;
  readonly activeTheme: () => Theme;
  readonly getDirection: () => FlowDirection | null;
  readonly iconImages: ReadonlyMap<string, CanvasImageSource>;
  readonly getRegistry: () => IconRegistry;
  readonly setStatus: (level: "ok" | "warning" | "error", message: string) => void;
}

export const installImageExport = (deps: ImageExportDeps): void => {
  const { buttons, margin, setStatus } = deps;

  // The themed surface colour lives only in CSS (the canvas pixels are transparent where nothing is
  // drawn), so an export composites onto a background-filled offscreen canvas at device resolution —
  // otherwise the output would have a transparent ground. Re-painted at a fixed device scale
  // (independent of the on-screen zoom) so the image is always full-resolution; editor chrome
  // (selection, handles, marquee) is omitted, matching the SVG export.
  const compositeCanvas = (): HTMLCanvasElement | null => {
    const scene = deps.getScene();
    if (scene === null) return null;
    const shown = deps.shownScene(scene);
    const logicalWidth = Math.ceil(shown.extent.size.width) + margin * 2;
    const logicalHeight = Math.ceil(shown.extent.size.height) + margin * 2;
    const dpr = window.devicePixelRatio || 1;
    const out = document.createElement("canvas");
    out.width = Math.round(logicalWidth * dpr);
    out.height = Math.round(logicalHeight * dpr);
    const octx = out.getContext("2d");
    if (octx === null) return null;
    const active = deps.activeTheme();
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.fillStyle = active.background;
    octx.fillRect(0, 0, logicalWidth, logicalHeight);
    octx.translate(margin - shown.extent.origin.x, margin - shown.extent.origin.y);
    paint(octx, toDisplayList(shown), deps.iconImages, active);
    return out;
  };

  const blockStaleExport = (action: string): boolean => {
    if (deps.isRenderValid() && deps.getScene() !== null) return false;
    setStatus("error", `${action} blocked — fix the current source first`);
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

  buttons.png.addEventListener("click", () => {
    if (blockStaleExport("PNG export")) return;
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

  // Copy the rendered diagram to the clipboard as a PNG (the same zoom-independent composite the PNG
  // export uses). Best-effort — needs a secure context + `clipboard-write`; the outcome is always
  // surfaced, never silently dropped.
  buttons.copy.addEventListener("click", () => {
    if (blockStaleExport("Copy")) return;
    const clip = navigator.clipboard;
    const ItemCtor = window.ClipboardItem;
    if (clip === undefined || typeof clip.write !== "function" || ItemCtor === undefined) {
      setStatus("warning", "copying images isn't supported here — use PNG to download");
      return;
    }
    const out = compositeCanvas();
    if (out === null) {
      console.error("copy failed: 2d context unavailable");
      setStatus("error", "copy failed — no 2D context");
      return;
    }
    out.toBlob((blob) => {
      if (blob === null) {
        console.error("copy failed: toBlob returned null");
        setStatus("error", "copy failed");
        return;
      }
      void clip.write([new ItemCtor({ "image/png": blob })]).then(
        () => setStatus("ok", "diagram image copied to clipboard"),
        (e: unknown) => {
          console.error("copy to clipboard failed:", messageOf(e));
          setStatus("warning", "clipboard was blocked — use PNG to download instead");
        },
      );
    }, "image/png");
  });

  buttons.pdf.addEventListener("click", () => {
    if (blockStaleExport("PDF export")) return;
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

  // SVG export, true vector: serialise the same display list the canvas paints via the renderer's
  // `toSvg`. Icon glyphs are embedded as `<image>` data-URL hrefs, resolved here (the renderer can't
  // depend on `@m/icons`).
  buttons.svg.addEventListener("click", () => {
    if (blockStaleExport("SVG export")) return;
    const scene = deps.getScene();
    if (scene === null) {
      setStatus("error", "nothing to export yet");
      return;
    }
    const shown = deps.shownScene(scene);
    const icons = new Map<string, string>();
    for (const node of shown.nodes) {
      if (node.icon === null) continue;
      const key = `${node.icon.pack}/${node.icon.name}`;
      if (icons.has(key)) continue;
      const resolved = findIcon(deps.getRegistry(), node.icon.pack, node.icon.name);
      if (isOk(resolved)) icons.set(key, svgDataUrl(resolved.value, deps.activeTheme().text));
      else console.error("icon resolve failed:", resolved.error.message);
    }
    const svg = toSvg(toDisplayList(shown), {
      width: Math.ceil(shown.extent.size.width) + margin * 2,
      height: Math.ceil(shown.extent.size.height) + margin * 2,
      origin: shown.extent.origin,
      margin,
      theme: deps.activeTheme(),
      icons,
    });
    downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "mermollusc.svg");
    setStatus("ok", "exported mermollusc.svg");
  });

  // DOT export: the Scene is the universal graph IR, so any family exports to Graphviz DOT (a pie,
  // having no nodes, exports as an empty graph). The reverse of the DOT import path.
  buttons.dot.addEventListener("click", () => {
    if (blockStaleExport("DOT export")) return;
    const scene = deps.getScene();
    if (scene === null) {
      setStatus("error", "nothing to export yet");
      return;
    }
    const dot = toDot(deps.shownScene(scene), deps.getDirection());
    downloadBlob(new Blob([dot], { type: "text/vnd.graphviz" }), "mermollusc.dot");
    setStatus("ok", "exported mermollusc.dot");
  });
};
