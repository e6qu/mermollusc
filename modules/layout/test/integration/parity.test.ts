import { brand, isOk, positiveInt } from "@m/std";
import type {
  BlockAst,
  C4Ast,
  CloudAst,
  FlowchartAst,
  NetworkAst,
  Scene,
  SceneEdge,
  SceneNode,
  StateAst,
} from "@m/contracts";
import { describe, expect, it } from "vitest";
import { heuristicMeasure } from "../../src/core/graph.js";
import { layoutDiagram } from "../../src/shell/elk.js";

// These fixtures mirror the public demo starters that a visual review flagged: edge labels bleeding
// into node boxes / clipping the sheet, group members poking over their group border, and connectors
// tunnelling into a group through a non-facing side. The assertions here are the geometric invariants
// those findings violate.

const nid = (s: string) => brand<string, "NodeId">(s);
const eid = (s: string) => brand<string, "EdgeId">(s);
const c4id = (s: string) => brand<string, "C4ElementId">(s);
const c4rid = (s: string) => brand<string, "C4RelId">(s);
const sid = (s: string) => brand<string, "StateId">(s);
const stid = (s: string) => brand<string, "StateTransitionId">(s);

interface Box {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}
const boxOf = (n: SceneNode): Box => ({
  x1: n.bounds.origin.x,
  y1: n.bounds.origin.y,
  x2: n.bounds.origin.x + n.bounds.size.width,
  y2: n.bounds.origin.y + n.bounds.size.height,
});
const labelBoxOf = (e: SceneEdge): Box | null => {
  if (e.label === null || e.labelPos === null) return null;
  const halfW = (heuristicMeasure(e.label) + 8) / 2;
  return {
    x1: e.labelPos.x - halfW,
    y1: e.labelPos.y - 8,
    x2: e.labelPos.x + halfW,
    y2: e.labelPos.y + 8,
  };
};
const intersects = (a: Box, b: Box): boolean =>
  a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;

// How many times the polyline crosses the rectangle's border (axis-aligned segments only — what the
// orthogonal routers emit). One crossing = the route enters the box exactly once.
const borderCrossings = (wp: readonly { x: number; y: number }[], b: Box): number => {
  let n = 0;
  for (let i = 1; i < wp.length; i++) {
    const a = wp[i - 1];
    const c = wp[i];
    if (a === undefined || c === undefined) continue;
    if (Math.abs(a.x - c.x) < 0.5) {
      if (a.x > b.x1 && a.x < b.x2) {
        const lo = Math.min(a.y, c.y);
        const hi = Math.max(a.y, c.y);
        if (lo < b.y1 && hi > b.y1) n++;
        if (lo < b.y2 && hi > b.y2) n++;
      }
    } else if (Math.abs(a.y - c.y) < 0.5) {
      if (a.y > b.y1 && a.y < b.y2) {
        const lo = Math.min(a.x, c.x);
        const hi = Math.max(a.x, c.x);
        if (lo < b.x1 && hi > b.x1) n++;
        if (lo < b.x2 && hi > b.x2) n++;
      }
    }
  }
  return n;
};

const leafBoxes = (scene: Scene): Box[] =>
  scene.nodes.filter((n) => n.shape !== "container" && n.role !== "marker").map(boxOf);

const expectLabelsOnSheetAndOffLeaves = (scene: Scene): void => {
  const leaves = leafBoxes(scene);
  for (const e of scene.edges) {
    const lb = labelBoxOf(e);
    if (lb === null) continue;
    expect(lb.x1).toBeGreaterThanOrEqual(scene.extent.origin.x);
    expect(lb.y1).toBeGreaterThanOrEqual(scene.extent.origin.y);
    expect(lb.x2).toBeLessThanOrEqual(scene.extent.origin.x + scene.extent.size.width);
    expect(lb.y2).toBeLessThanOrEqual(scene.extent.origin.y + scene.extent.size.height);
    for (const leaf of leaves) {
      expect(intersects(lb, leaf)).toBe(false);
    }
  }
};

const NETWORK_DEMO: NetworkAst = {
  kind: "network",
  styles: [],
  groups: [
    { id: nid("edge"), label: "Edge", parent: null },
    { id: nid("core"), label: "Core", parent: null },
    { id: nid("appTier"), label: "App tier", parent: nid("core") },
    { id: nid("dataTier"), label: "Data tier", parent: nid("core") },
    { id: nid("ops"), label: "Ops", parent: null },
  ],
  nodes: [
    { id: nid("net"), label: "Internet", kind: "cloud", icon: null, parent: nid("edge") },
    { id: nid("fw"), label: "Edge firewall", kind: "firewall", icon: null, parent: nid("edge") },
    { id: nid("rtr"), label: "Border router", kind: "router", icon: null, parent: nid("edge") },
    { id: nid("lb"), label: "Load balancer", kind: "server", icon: null, parent: nid("edge") },
    { id: nid("sw"), label: "App switch", kind: "switch", icon: null, parent: nid("appTier") },
    { id: nid("web"), label: "web service", kind: "server", icon: null, parent: nid("appTier") },
    { id: nid("api"), label: "api service", kind: "server", icon: null, parent: nid("appTier") },
    { id: nid("jobs"), label: "jobs", kind: "server", icon: null, parent: nid("appTier") },
    { id: nid("db"), label: "Postgres", kind: "database", icon: null, parent: nid("dataTier") },
    { id: nid("cache"), label: "Redis", kind: "server", icon: null, parent: nid("dataTier") },
    { id: nid("queue"), label: "Kafka", kind: "server", icon: null, parent: nid("dataTier") },
    { id: nid("admin"), label: "Admin jumpbox", kind: "host", icon: null, parent: nid("ops") },
    { id: nid("mon"), label: "Monitoring", kind: "server", icon: null, parent: nid("ops") },
    { id: nid("dash"), label: "Dashboards", kind: "server", icon: null, parent: nid("ops") },
  ],
  links: [
    { id: eid("l0"), from: nid("net"), to: nid("fw"), label: "WAN" },
    { id: eid("l1"), from: nid("fw"), to: nid("rtr"), label: "filtered" },
    { id: eid("l2"), from: nid("rtr"), to: nid("lb"), label: "443/tcp" },
    { id: eid("l3"), from: nid("lb"), to: nid("web"), label: "HTTPS" },
    { id: eid("l4"), from: nid("lb"), to: nid("api"), label: "API" },
    { id: eid("l5"), from: nid("web"), to: nid("sw"), label: "east-west" },
    { id: eid("l6"), from: nid("sw"), to: nid("api"), label: "RPC" },
    { id: eid("l7"), from: nid("api"), to: nid("db"), label: "SQL" },
    { id: eid("l8"), from: nid("api"), to: nid("cache"), label: "cache" },
    { id: eid("l9"), from: nid("api"), to: nid("queue"), label: "events" },
    { id: eid("l10"), from: nid("queue"), to: nid("jobs"), label: "consume" },
    { id: eid("l11"), from: nid("admin"), to: nid("sw"), label: "SSH" },
    { id: eid("l12"), from: nid("mon"), to: nid("api"), label: "metrics" },
    { id: eid("l13"), from: nid("mon"), to: nid("dash"), label: "panels" },
  ],
};

const C4_DEMO: C4Ast = {
  kind: "c4",
  styles: [],
  elements: [
    { id: c4id("customer"), label: "Customer", description: "A registered shopper", kind: "person", parent: null },
    { id: c4id("operator"), label: "Support agent", description: null, kind: "person", parent: null },
    { id: c4id("shop"), label: "Online Shop", description: null, kind: "boundary", parent: null },
    { id: c4id("web"), label: "Web app", description: "React SPA", kind: "container", parent: c4id("shop") },
    { id: c4id("api"), label: "API", description: "Spring Boot", kind: "container", parent: c4id("shop") },
    { id: c4id("worker"), label: "Worker", description: "Async jobs", kind: "container", parent: c4id("shop") },
    { id: c4id("db"), label: "Order DB", description: "PostgreSQL", kind: "container", parent: c4id("shop") },
    { id: c4id("cache"), label: "Cache", description: "Redis", kind: "container", parent: c4id("shop") },
  ],
  rels: [
    { id: c4rid("r0"), from: c4id("customer"), to: c4id("web"), label: "uses" },
    { id: c4rid("r1"), from: c4id("operator"), to: c4id("web"), label: "assists" },
    { id: c4rid("r2"), from: c4id("web"), to: c4id("api"), label: "calls" },
    { id: c4rid("r3"), from: c4id("api"), to: c4id("cache"), label: "reads" },
    { id: c4rid("r4"), from: c4id("api"), to: c4id("db"), label: "writes" },
    { id: c4rid("r5"), from: c4id("api"), to: c4id("worker"), label: "queues" },
    { id: c4rid("r6"), from: c4id("worker"), to: c4id("db"), label: "updates" },
  ],
};

const CLOUD_DEMO: CloudAst = {
  kind: "cloud",
  styles: [],
  groups: [
    { id: nid("gEdge"), label: "Edge", parent: null },
    { id: nid("gRouting"), label: "Routing", parent: null },
    { id: nid("gServices"), label: "Services", parent: null },
    { id: nid("gAsync"), label: "Async", parent: null },
    { id: nid("gData"), label: "Data", parent: null },
    { id: nid("gSecurity"), label: "Security", parent: null },
    { id: nid("gOps"), label: "Operations", parent: null },
  ],
  nodes: [
    { id: nid("cf"), label: "CloudFront", kind: "cdn", parent: nid("gEdge"), icon: null },
    { id: nid("waf"), label: "AWS WAF", kind: "compute", parent: nid("gEdge"), icon: null },
    { id: nid("shield"), label: "Shield", kind: "compute", parent: nid("gEdge"), icon: null },
    { id: nid("alb"), label: "App Load Balancer", kind: "compute", parent: nid("gRouting"), icon: null },
    { id: nid("api"), label: "API Gateway", kind: "compute", parent: nid("gRouting"), icon: null },
    { id: nid("web"), label: "web service", kind: "compute", parent: nid("gServices"), icon: null },
    { id: nid("apiSvc"), label: "api service", kind: "compute", parent: nid("gServices"), icon: null },
    { id: nid("orders"), label: "orders service", kind: "compute", parent: nid("gServices"), icon: null },
    { id: nid("events"), label: "event bus", kind: "queue", parent: nid("gAsync"), icon: null },
    { id: nid("jobs"), label: "job queue", kind: "queue", parent: nid("gAsync"), icon: null },
    { id: nid("worker"), label: "worker", kind: "compute", parent: nid("gAsync"), icon: null },
    { id: nid("rds"), label: "Aurora", kind: "database", parent: nid("gData"), icon: null },
    { id: nid("s3"), label: "Assets", kind: "storage", parent: nid("gData"), icon: null },
    { id: nid("redis"), label: "Redis", kind: "database", parent: nid("gData"), icon: null },
    { id: nid("cognito"), label: "Cognito", kind: "compute", parent: nid("gSecurity"), icon: null },
    { id: nid("secrets"), label: "Secrets", kind: "compute", parent: nid("gSecurity"), icon: null },
    { id: nid("cw"), label: "CloudWatch", kind: "compute", parent: nid("gOps"), icon: null },
    { id: nid("grafana"), label: "Dashboards", kind: "compute", parent: nid("gOps"), icon: null },
    { id: nid("dlq"), label: "DLQ", kind: "queue", parent: nid("gOps"), icon: null },
  ],
  links: [
    { id: eid("k0"), from: nid("cf"), to: nid("waf"), label: "public", directed: true },
    { id: eid("k1"), from: nid("waf"), to: nid("shield"), label: "inspect", directed: true },
    { id: eid("k2"), from: nid("shield"), to: nid("alb"), label: "web", directed: true },
    { id: eid("k3"), from: nid("alb"), to: nid("api"), label: "route", directed: true },
    { id: eid("k4"), from: nid("alb"), to: nid("web"), label: "HTTP", directed: true },
    { id: eid("k5"), from: nid("api"), to: nid("apiSvc"), label: null, directed: true },
    { id: eid("k6"), from: nid("web"), to: nid("orders"), label: null, directed: true },
    { id: eid("k7"), from: nid("apiSvc"), to: nid("orders"), label: null, directed: true },
    { id: eid("k8"), from: nid("orders"), to: nid("cognito"), label: null, directed: true },
    { id: eid("k9"), from: nid("orders"), to: nid("rds"), label: "SQL", directed: true },
    { id: eid("k10"), from: nid("orders"), to: nid("redis"), label: "cache", directed: true },
    { id: eid("k11"), from: nid("web"), to: nid("s3"), label: null, directed: true },
    { id: eid("k12"), from: nid("orders"), to: nid("events"), label: null, directed: true },
    { id: eid("k13"), from: nid("events"), to: nid("jobs"), label: "fan out", directed: true },
    { id: eid("k14"), from: nid("jobs"), to: nid("worker"), label: "async", directed: true },
    { id: eid("k15"), from: nid("worker"), to: nid("cw"), label: "logs", directed: true },
    { id: eid("k16"), from: nid("cw"), to: nid("grafana"), label: "metrics", directed: true },
    { id: eid("k17"), from: nid("worker"), to: nid("dlq"), label: "failed jobs", directed: true },
    { id: eid("k18"), from: nid("secrets"), to: nid("apiSvc"), label: null, directed: true },
  ],
};

const BLOCK_DEMO: BlockAst = {
  kind: "block",
  styles: [],
  columns: positiveInt(4),
  blocks: [
    { id: nid("dns"), label: "DNS", shape: "rect", icon: null, span: positiveInt(2) },
    { id: nid("cdn"), label: "CDN", shape: "rect", icon: null, span: positiveInt(2) },
    { id: nid("lb"), label: "Load balancer", shape: "rect", icon: null, span: positiveInt(4) },
    { id: nid("web1"), label: "web-1", shape: "rect", icon: null, span: positiveInt(1) },
    { id: nid("web2"), label: "web-2", shape: "rect", icon: null, span: positiveInt(1) },
    { id: nid("api1"), label: "api-1", shape: "rect", icon: null, span: positiveInt(1) },
    { id: nid("api2"), label: "api-2", shape: "rect", icon: null, span: positiveInt(1) },
    { id: nid("queue"), label: "Jobs", shape: "rect", icon: null, span: positiveInt(2) },
    { id: nid("worker"), label: "Worker", shape: "rect", icon: null, span: positiveInt(2) },
    { id: nid("cache"), label: "Redis cache", shape: "rect", icon: null, span: positiveInt(1) },
    { id: nid("db"), label: "Postgres", shape: "rect", icon: null, span: positiveInt(1) },
    { id: nid("store"), label: "Object store", shape: "rect", icon: null, span: positiveInt(1) },
    { id: nid("logs"), label: "Logs", shape: "rect", icon: null, span: positiveInt(1) },
  ],
  groups: [
    {
      id: nid("app"),
      label: "app",
      columns: positiveInt(4),
      children: [nid("web1"), nid("web2"), nid("api1"), nid("api2")],
      span: positiveInt(4),
    },
  ],
  roots: [
    nid("dns"),
    nid("cdn"),
    nid("lb"),
    nid("app"),
    nid("queue"),
    nid("worker"),
    nid("cache"),
    nid("db"),
    nid("store"),
    nid("logs"),
  ],
  edges: [
    { id: eid("b0"), from: nid("dns"), to: nid("cdn"), kind: "arrow", label: null },
    { id: eid("b1"), from: nid("cdn"), to: nid("lb"), kind: "arrow", label: null },
    { id: eid("b2"), from: nid("lb"), to: nid("web1"), kind: "arrow", label: null },
    { id: eid("b3"), from: nid("lb"), to: nid("web2"), kind: "arrow", label: null },
    { id: eid("b4"), from: nid("web1"), to: nid("api1"), kind: "arrow", label: null },
    { id: eid("b5"), from: nid("web2"), to: nid("api2"), kind: "arrow", label: null },
    { id: eid("b6"), from: nid("api1"), to: nid("cache"), kind: "arrow", label: null },
    { id: eid("b7"), from: nid("api1"), to: nid("db"), kind: "arrow", label: null },
    { id: eid("b8"), from: nid("api2"), to: nid("queue"), kind: "arrow", label: null },
    { id: eid("b9"), from: nid("queue"), to: nid("worker"), kind: "arrow", label: null },
    { id: eid("b10"), from: nid("worker"), to: nid("store"), kind: "arrow", label: null },
    { id: eid("b11"), from: nid("worker"), to: nid("logs"), kind: "arrow", label: null },
  ],
};

const STATE_DEMO: StateAst = {
  kind: "state",
  direction: "LR",
  states: [
    { id: sid("start1"), label: "", kind: "start" },
    { id: sid("end1"), label: "", kind: "end" },
    { id: sid("fstart"), label: "", kind: "start" },
    { id: sid("fend"), label: "", kind: "end" },
    { id: sid("fork"), label: "fork", kind: "fork" },
    { id: sid("join"), label: "join", kind: "join" },
    { id: sid("choice"), label: "choice", kind: "choice" },
    { id: sid("Pick"), label: "Pick", kind: "state" },
    { id: sid("Pack"), label: "Pack", kind: "state" },
    { id: sid("HandOff"), label: "HandOff", kind: "state" },
    { id: sid("Idle"), label: "Idle", kind: "state" },
    { id: sid("Error"), label: "Error", kind: "state" },
    { id: sid("ReserveInventory"), label: "ReserveInventory", kind: "state" },
    { id: sid("NotifyCustomer"), label: "NotifyCustomer", kind: "state" },
    { id: sid("Ready"), label: "Ready", kind: "state" },
  ],
  transitions: [
    { id: stid("t0"), from: sid("fstart"), to: sid("Pick"), label: null },
    { id: stid("t1"), from: sid("Pick"), to: sid("Pack"), label: null },
    { id: stid("t2"), from: sid("Pack"), to: sid("HandOff"), label: null },
    { id: stid("t3"), from: sid("HandOff"), to: sid("fend"), label: null },
    { id: stid("t4"), from: sid("start1"), to: sid("Idle"), label: null },
    { id: stid("t5"), from: sid("Idle"), to: sid("choice"), label: "submit" },
    { id: stid("t6"), from: sid("choice"), to: sid("fork"), label: "accepted" },
    { id: stid("t7"), from: sid("choice"), to: sid("Error"), label: "rejected" },
    { id: stid("t8"), from: sid("fork"), to: sid("ReserveInventory"), label: null },
    { id: stid("t9"), from: sid("fork"), to: sid("NotifyCustomer"), label: null },
    { id: stid("t10"), from: sid("ReserveInventory"), to: sid("join"), label: null },
    { id: stid("t11"), from: sid("NotifyCustomer"), to: sid("join"), label: null },
    { id: stid("t12"), from: sid("join"), to: sid("Fulfilment"), label: null },
    { id: stid("t13"), from: sid("Fulfilment"), to: sid("Ready"), label: null },
    { id: stid("t14"), from: sid("Ready"), to: sid("end1"), label: null },
    { id: stid("t15"), from: sid("Error"), to: sid("Idle"), label: "correct" },
  ],
  composites: [
    {
      id: sid("Fulfilment"),
      label: "Fulfilment",
      parent: null,
      states: [sid("fstart"), sid("fend"), sid("Pick"), sid("Pack"), sid("HandOff")],
    },
  ],
  notes: [
    {
      id: sid("note_Error"),
      target: sid("Error"),
      side: "right",
      text: "retry with corrected input",
    },
  ],
  styles: [],
};

// The DOT demo import, as the FlowchartAst the DOT parser produces: a `cluster_core` subgraph
// containing layout/route/render, everything else at the top level.
const DOT_DEMO_FLOW: FlowchartAst = {
  kind: "flowchart",
  direction: "LR",
  nodes: [
    { id: nid("intake"), label: "intake", shape: "rect", icon: null },
    { id: nid("parse"), label: "parse", shape: "round", icon: null },
    { id: nid("validate"), label: "validate", shape: "round", icon: null },
    { id: nid("layout"), label: "layout", shape: "round", icon: null },
    { id: nid("route"), label: "route", shape: "round", icon: null },
    { id: nid("render"), label: "render", shape: "round", icon: null },
    { id: nid("export"), label: "export", shape: "diamond", icon: null },
    { id: nid("inspect"), label: "inspect", shape: "round", icon: null },
    { id: nid("edit"), label: "edit", shape: "round", icon: null },
  ],
  edges: [
    { id: eid("d0"), from: nid("intake"), to: nid("parse"), kind: "arrow", label: null },
    { id: eid("d1"), from: nid("parse"), to: nid("validate"), kind: "arrow", label: null },
    { id: eid("d2"), from: nid("validate"), to: nid("layout"), kind: "arrow", label: null },
    { id: eid("d3"), from: nid("layout"), to: nid("route"), kind: "arrow", label: null },
    { id: eid("d4"), from: nid("route"), to: nid("render"), kind: "arrow", label: null },
    { id: eid("d5"), from: nid("route"), to: nid("layout"), kind: "arrow", label: "relax" },
    { id: eid("d6"), from: nid("render"), to: nid("export"), kind: "arrow", label: "canvas/svg" },
    { id: eid("d7"), from: nid("render"), to: nid("inspect"), kind: "arrow", label: "hit test" },
    { id: eid("d8"), from: nid("inspect"), to: nid("edit"), kind: "arrow", label: null },
    { id: eid("d9"), from: nid("edit"), to: nid("parse"), kind: "arrow", label: "source patch" },
  ],
  subgraphs: [
    {
      id: nid("cluster_core"),
      label: "core",
      parent: null,
      nodes: [nid("layout"), nid("route"), nid("render")],
    },
  ],
  styles: [],
};

const laidOut = async (ast: Parameters<typeof layoutDiagram>[0]): Promise<Scene> => {
  const r = await layoutDiagram(ast, heuristicMeasure);
  if (!isOk(r)) throw new Error(r.error.message);
  return r.value;
};

describe("demo parity invariants", () => {
  it("network demo: edge labels stay on the sheet and off every node box", async () => {
    const scene = await laidOut(NETWORK_DEMO);
    expectLabelsOnSheetAndOffLeaves(scene);
  });

  it("c4 demo: edge labels avoid the boxes and each other", async () => {
    const scene = await laidOut(C4_DEMO);
    expectLabelsOnSheetAndOffLeaves(scene);
    const labels = scene.edges.flatMap((e) => {
      const b = labelBoxOf(e);
      return b === null ? [] : [b];
    });
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i];
        const b = labels[j];
        if (a === undefined || b === undefined) continue;
        expect(intersects(a, b)).toBe(false);
      }
    }
  });

  it("cloud demo: alb→web enters the Services group exactly once (through the facing side)", async () => {
    const scene = await laidOut(CLOUD_DEMO);
    expectLabelsOnSheetAndOffLeaves(scene);
    const services = scene.nodes.find((n) => n.id === "gServices");
    const http = scene.edges.find((e) => e.id === "k4");
    if (services === undefined || http === undefined) throw new Error("fixture nodes missing");
    expect(borderCrossings(http.waypoints, boxOf(services))).toBe(1);
  });

  it("block demo: group members sit strictly inside the group; lb enters it exactly once", async () => {
    const scene = await laidOut(BLOCK_DEMO);
    const app = scene.nodes.find((n) => n.id === "app");
    if (app === undefined) throw new Error("group missing");
    const appBox = boxOf(app);
    for (const id of ["web1", "web2", "api1", "api2"]) {
      const n = scene.nodes.find((x) => x.id === id);
      if (n === undefined) throw new Error(`${id} missing`);
      const b = boxOf(n);
      expect(b.x1).toBeGreaterThan(appBox.x1);
      expect(b.y1).toBeGreaterThan(appBox.y1);
      expect(b.x2).toBeLessThan(appBox.x2);
      expect(b.y2).toBeLessThan(appBox.y2);
    }
    for (const id of ["b2", "b3"]) {
      const e = scene.edges.find((x) => x.id === id);
      if (e === undefined) throw new Error(`${id} missing`);
      expect(borderCrossings(e.waypoints, appBox)).toBe(1);
    }
  });

  it("state demo: transition labels keep clear of the note box", async () => {
    const scene = await laidOut(STATE_DEMO);
    const note = scene.nodes.find((n) => n.role === "stateNote");
    if (note === undefined) throw new Error("note missing");
    const noteBox = boxOf(note);
    for (const e of scene.edges) {
      const lb = labelBoxOf(e);
      if (lb === null) continue;
      expect(intersects(lb, noteBox)).toBe(false);
    }
  });

  it("DOT-imported clusters get the same member padding as flowchart subgraphs, labels clear of the border", async () => {
    const scene = await laidOut(DOT_DEMO_FLOW);
    const cluster = scene.nodes.find((n) => n.id === "cluster_core");
    if (cluster === undefined) throw new Error("cluster missing");
    const cb = boxOf(cluster);
    for (const id of ["layout", "route", "render"]) {
      const n = scene.nodes.find((x) => x.id === id);
      if (n === undefined) throw new Error(`${id} missing`);
      const b = boxOf(n);
      // The shared ELK container padding (12px sides / 28px title band) applies to DOT clusters too.
      expect(b.x1 - cb.x1).toBeGreaterThanOrEqual(10);
      expect(cb.x2 - b.x2).toBeGreaterThanOrEqual(10);
      expect(b.y1 - cb.y1).toBeGreaterThanOrEqual(10);
      expect(cb.y2 - b.y2).toBeGreaterThanOrEqual(10);
    }
    // No edge label straddles the cluster's border line — each label box is fully inside or outside.
    for (const e of scene.edges) {
      const lb = labelBoxOf(e);
      if (lb === null) continue;
      const inside =
        lb.x1 > cb.x1 && lb.x2 < cb.x2 && lb.y1 > cb.y1 && lb.y2 < cb.y2;
      const outside = !intersects(lb, cb);
      expect(inside || outside).toBe(true);
    }
  });
});
