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

    // An unlabelled node has no span.
    expect(r.value.source.nodes.get(nid("r1"))).toBeUndefined();
  });
});
