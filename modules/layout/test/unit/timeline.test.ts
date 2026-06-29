import { brand } from "@m/std";
import type { TimelineAst } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { heuristicMeasure } from "../../src/core/graph.js";
import { layoutTimeline, timelinePeriodsAdvanceLeftToRight } from "../../src/core/timeline.js";
import { rect } from "@m/std";

const pid = (s: string) => brand<string, "TimelinePeriodId">(s);
const evid = (s: string) => brand<string, "TimelineEventId">(s);

const ast: TimelineAst = {
  kind: "timeline",
  title: "History",
  periods: [
    {
      id: pid("p0"),
      label: "2002",
      section: null,
      events: [{ id: evid("e0"), text: "LinkedIn" }],
    },
    {
      id: pid("p1"),
      label: "2004",
      section: "Social",
      events: [
        { id: evid("e1"), text: "Facebook" },
        { id: evid("e2"), text: "Google" },
      ],
    },
    {
      id: pid("p2"),
      label: "2006",
      section: "Social",
      events: [{ id: evid("e3"), text: "Twitter" }],
    },
  ],
};

describe("layoutTimeline", () => {
  const result = layoutTimeline(ast, heuristicMeasure);
  if (!result.ok) throw new Error(result.error.message);
  const scene = result.value;
  const node = (id: string) => scene.nodes.find((n) => n.id === id);
  const ox = (id: string): number => node(id)?.bounds.origin.x ?? 0;

  it("places periods left to right as rounded header nodes", () => {
    expect(node("p0")?.shape).toBe("round");
    expect(ox("p1")).toBeGreaterThan(ox("p0"));
    expect(ox("p2")).toBeGreaterThan(ox("p1"));
  });

  it("draws event connectors as real edges so dragged timeline nodes carry their links", () => {
    const eventEdges = scene.edges.filter((e) => e.id.startsWith("event:"));
    expect(eventEdges).toHaveLength(4);
    for (const edge of eventEdges) {
      expect(edge.waypoints).toHaveLength(2);
      const from = edge.waypoints[0];
      const to = edge.waypoints[1];
      expect(from?.x).toBe(to?.x);
      expect((to?.y ?? 0) > (from?.y ?? 0)).toBe(true);
    }
  });

  it("stacks a period's events below it in the same column", () => {
    const p1x = ox("p1");
    // both events of p1 share its column x and sit below the period row
    expect(ox("e1")).toBe(p1x);
    expect(ox("e2")).toBe(p1x);
    const py = node("p1")?.bounds.origin.y ?? 0;
    const e1y = node("e1")?.bounds.origin.y ?? 0;
    const e2y = node("e2")?.bounds.origin.y ?? 0;
    expect(e1y).toBeGreaterThan(py);
    expect(e2y).toBeGreaterThan(e1y);
    expect(node("e1")?.shape).toBe("rect");
  });

  it("draws a labelled section band spanning its run of periods", () => {
    const band = scene.nodes.find((n) => n.shape === "container");
    expect(band?.label).toBe("Social");
    // the Social band spans p1..p2: starts at p1's x, ends past p2's right edge
    const left = band?.bounds.origin.x ?? -1;
    const width = band?.bounds.size.width ?? 0;
    expect(left).toBe(ox("p1"));
    expect(left + width).toBeGreaterThan(ox("p2"));
  });

  it("connects the periods with a single spine polyline", () => {
    const spine = scene.edges.find((e) => e.id === "spine");
    expect(spine).toBeDefined();
    expect(spine?.waypoints).toHaveLength(3);
    // monotonically increasing x through the period centres
    const xs = (spine?.waypoints ?? []).map((p) => p.x);
    expect(xs[1] ?? 0).toBeGreaterThan(xs[0] ?? 0);
    expect(xs[2] ?? 0).toBeGreaterThan(xs[1] ?? 0);
  });

  it("grows a multi-line (`<br>`) cell taller than a single-line one", () => {
    const multi = layoutTimeline(
      {
        kind: "timeline",
        title: null,
        periods: [
          {
            id: pid("p0"),
            label: "2002",
            section: null,
            events: [{ id: evid("e0"), text: "line one\nline two" }],
          },
        ],
      },
      heuristicMeasure,
    );
    if (!multi.ok) throw new Error(multi.error.message);
    const ev = multi.value.nodes.find((n) => n.id === "e0");
    // a two-line event box is taller than the single-line base (32)
    expect((ev?.bounds.size.height ?? 0) > 32).toBe(true);
  });

  it("emits no section band when no period has a section", () => {
    const flat = layoutTimeline(
      {
        kind: "timeline",
        title: null,
        periods: [{ id: pid("p0"), label: "2002", section: null, events: [] }],
      },
      heuristicMeasure,
    );
    if (!flat.ok) throw new Error(flat.error.message);
    expect(flat.value.nodes.some((n) => n.shape === "container")).toBe(false);
  });

  it("timelinePeriodsAdvanceLeftToRight holds, and fails if two periods share a column", () => {
    expect(timelinePeriodsAdvanceLeftToRight(scene, ast)).toBe(true);
    // Slam the second period back onto the first period's x → no longer strictly increasing.
    const p0x = scene.nodes.find((n) => n.id === "p0")?.bounds.origin.x ?? 0;
    const collapsed = {
      ...scene,
      nodes: scene.nodes.map((n) =>
        n.id === "p1"
          ? { ...n, bounds: rect(p0x, n.bounds.origin.y, n.bounds.size.width, n.bounds.size.height) }
          : n,
      ),
    };
    expect(timelinePeriodsAdvanceLeftToRight(collapsed, ast)).toBe(false);
  });
});
