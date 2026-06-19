import { brand, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseCloud, parseCloudWithSource } from "../../src/shell/cloud-parse.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const eid = (s: string) => brand<string, "EdgeId">(s);

const SAMPLE = `cloud
  group "AWS" {
    group "us-east-1" {
      compute web "Web"
      storage assets "Assets"
    }
  }
  database db "Orders"
  web -- db : "query"
`;

describe("parseCloud", () => {
  it("parses nested groups with synthetic ids and parent links", () => {
    const r = parseCloud(SAMPLE);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    expect(r.value.groups.map((g) => [g.id, g.label, g.parent])).toEqual([
      ["group:0", "AWS", null],
      ["group:1", "us-east-1", nid("group:0")],
    ]);
  });

  it("synthetic group ids can't collide with a user service named like the old `g0`", () => {
    // `g0` was the old group-id format; a service literally named `g0` used to overwrite the group.
    const r = parseCloud('cloud\n  group "AWS" {\n    compute g0 "Edge"\n  }\n');
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.groups.map((g) => g.id)).toEqual(["group:0"]);
    const svc = r.value.nodes.find((n) => n.id === "g0");
    expect(svc?.label).toBe("Edge");
    expect(svc?.parent).toBe("group:0"); // nested in the group, not conflated with it
  });

  it("parses kind-typed service leaves nested under their group", () => {
    const r = parseCloud(SAMPLE);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    expect(r.value.nodes.map((n) => [n.id, n.label, n.kind, n.parent])).toEqual([
      ["web", "Web", "compute", nid("group:1")],
      ["assets", "Assets", "storage", nid("group:1")],
      ["db", "Orders", "database", null],
    ]);
  });

  it("parses a per-leaf icon override (with and without a label)", () => {
    const r = parseCloud(
      'cloud\n  compute web "Web" icon "devicon/aws"\n  storage s3 icon "gilbarbara/aws-s3"\n  database db "Orders"\n',
    );
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const byId = new Map(r.value.nodes.map((n) => [n.id, n]));
    expect(byId.get(nid("web"))?.label).toBe("Web");
    expect(byId.get(nid("web"))?.icon).toEqual({ pack: "devicon", name: "aws" });
    expect(byId.get(nid("s3"))?.label).toBe("s3");
    expect(byId.get(nid("s3"))?.icon).toEqual({ pack: "gilbarbara", name: "aws-s3" });
    expect(byId.get(nid("db"))?.icon).toBeNull();
  });

  it("parses an undirected link with a label", () => {
    const r = parseCloud(SAMPLE);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.links).toHaveLength(1);
    expect(r.value.links[0]?.from).toBe("web");
    expect(r.value.links[0]?.to).toBe("db");
    expect(r.value.links[0]?.label).toBe("query");
  });
});

describe("parseCloudWithSource", () => {
  it("captures inner-label spans for groups, service leaves, and links", () => {
    const r = parseCloudWithSource(SAMPLE);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    const at = (span: { start: number; end: number } | undefined) =>
      span === undefined ? "" : SAMPLE.slice(span.start, span.end);

    expect(at(r.value.source.groups.get(nid("group:0")))).toBe("AWS");
    expect(at(r.value.source.groups.get(nid("group:1")))).toBe("us-east-1");
    expect(at(r.value.source.nodes.get(nid("web")))).toBe("Web");
    expect(at(r.value.source.links.get(eid("l0")))).toBe("query");
  });
});
