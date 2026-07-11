import { assertNever, point, rect, twoOrMore, type Point } from "@m/std";
import type { Decoration, Scene, SceneEdge, SceneNode, SceneWedge } from "@m/contracts";

// Vertical room reserved above the chart for a diagram `title` (Mermaid draws the title centred over
// the diagram). The scene's own content shifts down by this band so the title never overlaps it.
export const TITLE_BAND = 34;

const shiftPoint = (p: Point, dy: number): Point => point(p.x, p.y + dy);

const shiftDecoration = (d: Decoration, dy: number): Decoration => {
  switch (d.kind) {
    case "band":
      return {
        ...d,
        bounds: rect(
          d.bounds.origin.x,
          d.bounds.origin.y + dy,
          d.bounds.size.width,
          d.bounds.size.height,
        ),
      };
    case "rule":
      return { ...d, from: shiftPoint(d.from, dy), to: shiftPoint(d.to, dy) };
    case "caption":
      return { ...d, at: shiftPoint(d.at, dy) };
    default:
      return assertNever(d);
  }
};

// Add a diagram title the way Mermaid renders one: a centred caption above the chart. The whole scene
// shifts down one title band (nodes, edges, wedges, decorations), the extent grows by the same amount,
// and the title caption sits centred in the freed band. A null title returns the scene untouched.
export const withTitle = (scene: Scene, title: string | null): Scene => {
  if (title === null) return scene;
  const dy = TITLE_BAND;
  const nodes = scene.nodes.map(
    (n): SceneNode => ({
      ...n,
      bounds: rect(
        n.bounds.origin.x,
        n.bounds.origin.y + dy,
        n.bounds.size.width,
        n.bounds.size.height,
      ),
    }),
  );
  const edges = scene.edges.map((e): SceneEdge => {
    const [w0, w1, ...wr] = e.waypoints.map((p) => shiftPoint(p, dy));
    if (w0 === undefined || w1 === undefined) return e;
    return {
      ...e,
      waypoints: twoOrMore(w0, w1, ...wr),
      labelPos: e.labelPos === null ? null : shiftPoint(e.labelPos, dy),
    };
  });
  const wedges = scene.wedges.map((w): SceneWedge => ({ ...w, center: shiftPoint(w.center, dy) }));
  const titleCaption: Decoration = {
    kind: "caption",
    at: point(scene.extent.origin.x + scene.extent.size.width / 2, scene.extent.origin.y + dy / 2),
    text: title,
    align: "center",
  };
  return {
    nodes,
    edges,
    wedges,
    decorations: [...scene.decorations.map((d) => shiftDecoration(d, dy)), titleCaption],
    extent: rect(
      scene.extent.origin.x,
      scene.extent.origin.y,
      scene.extent.size.width,
      scene.extent.size.height + dy,
    ),
  };
};
