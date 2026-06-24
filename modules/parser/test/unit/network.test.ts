import { brand, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseNetwork, parseNetworkWithSource } from "../../src/shell/net-parse.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const eid = (s: string) => brand<string, "EdgeId">(s);

const SAMPLE = 'network\n  cloud net "Internet"\n  router r1\n  server web "Web"\n  net -- r1\n  r1 -- web : "eth0"\n';

describe("parseNetwork", () => {
  it("parses kind-typed nodes and undirected links", () => {
    const r = parseNetwork(SAMPLE);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    expect(r.value.kind).toBe("network");
    expect(r.value.nodes.map((n) => [n.id, n.label, n.kind])).toEqual([
      ["net", "Internet", "cloud"],
      ["r1", "r1", "router"],
      ["web", "Web", "server"],
    ]);
    expect(r.value.links).toHaveLength(2);
    expect(r.value.links[1]?.from).toBe("r1");
    expect(r.value.links[1]?.to).toBe("web");
    expect(r.value.links[1]?.label).toBe("eth0");
    expect(r.value.links[0]?.label).toBeNull();
  });
});

describe("parseNetworkWithSource", () => {
  it("captures inner-label spans for quoted node and link labels", () => {
    const r = parseNetworkWithSource(SAMPLE);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    const node = r.value.source.nodes.get(nid("net"));
    expect(node).toBeDefined();
    if (node !== undefined) expect(SAMPLE.slice(node.start, node.end)).toBe("Internet");

    const link = r.value.source.links.get(eid("l1"));
    expect(link).toBeDefined();
    if (link !== undefined) expect(SAMPLE.slice(link.start, link.end)).toBe("eth0");

    // An unlabelled node has no label span, but carries a bare-node (id-token) span so the editor can
    // relabel it by appending a quoted label.
    expect(r.value.source.nodes.get(nid("r1"))).toBeUndefined();
    const bare = r.value.source.bareNodes.get(nid("r1"));
    expect(bare).toBeDefined();
    if (bare !== undefined) expect(SAMPLE.slice(bare.start, bare.end)).toBe("r1");
  });
});

describe("parseNetwork — per-node icon override", () => {
  it("parses `icon \"<pack>/<name>\"` with and without a label", () => {
    const r = parseNetwork(
      'network\n  server web "Web" icon "simpleicons/nginx"\n  host bare icon "simpleicons/docker"\n  router plain\n',
    );
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const byId = new Map(r.value.nodes.map((n) => [n.id, n]));
    expect(byId.get(nid("web"))?.label).toBe("Web");
    expect(byId.get(nid("web"))?.icon).toEqual({ pack: "simpleicons", name: "nginx" });
    // No label, icon present → label falls back to the id.
    expect(byId.get(nid("bare"))?.label).toBe("bare");
    expect(byId.get(nid("bare"))?.icon).toEqual({ pack: "simpleicons", name: "docker" });
    // No override → null (layout uses the kind default).
    expect(byId.get(nid("plain"))?.icon).toBeNull();
  });

  it("fails loudly on a malformed icon reference (no pack/name split) instead of silently dropping it", () => {
    const r = parseNetwork('network\n  server x "Y" icon "bogus"\n');
    expect(isOk(r)).toBe(false);
    if (isOk(r)) return;
    expect(r.error.errors[0]).toMatch(/malformed icon reference/);
    // The error is located at the icon token so the editor can highlight it.
    expect(r.error.positions[0]?.length).toBeGreaterThan(0);
  });
});
