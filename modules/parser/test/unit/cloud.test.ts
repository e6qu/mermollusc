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
      ["g0", "AWS", null],
      ["g1", "us-east-1", nid("g0")],
    ]);
  });

  it("parses kind-typed service leaves nested under their group", () => {
    const r = parseCloud(SAMPLE);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    expect(r.value.nodes.map((n) => [n.id, n.label, n.kind, n.parent])).toEqual([
      ["web", "Web", "compute", nid("g1")],
      ["assets", "Assets", "storage", nid("g1")],
      ["db", "Orders", "database", null],
    ]);
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

    expect(at(r.value.source.groups.get(nid("g0")))).toBe("AWS");
    expect(at(r.value.source.groups.get(nid("g1")))).toBe("us-east-1");
    expect(at(r.value.source.nodes.get(nid("web")))).toBe("Web");
    expect(at(r.value.source.links.get(eid("l0")))).toBe("query");
  });
});
