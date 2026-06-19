import { brand, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseTimeline, parseTimelineWithSource } from "../../src/shell/timeline-parse.js";

const pid = (s: string) => brand<string, "TimelinePeriodId">(s);
const evid = (s: string) => brand<string, "TimelineEventId">(s);

describe("parseTimeline", () => {
  it("parses the title and one event per period", () => {
    const text = "timeline\n  title History\n  2002 : LinkedIn\n  2004 : Facebook\n";
    const r = parseTimeline(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.title).toBe("History");
    expect(r.value.periods.map((p) => p.label)).toEqual(["2002", "2004"]);
    expect(r.value.periods.map((p) => p.events.map((e) => e.text))).toEqual([
      ["LinkedIn"],
      ["Facebook"],
    ]);
  });

  it("attaches multiple same-line events to one period", () => {
    const r = parseTimeline("timeline\n  2004 : Facebook : Google\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.periods[0]?.events.map((e) => e.text)).toEqual(["Facebook", "Google"]);
  });

  it("attaches `:`-continuation lines to the previous period", () => {
    const text = "timeline\n  2002 : LinkedIn\n       : Friendster\n       : MySpace\n";
    const r = parseTimeline(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.periods).toHaveLength(1);
    expect(r.value.periods[0]?.events.map((e) => e.text)).toEqual([
      "LinkedIn",
      "Friendster",
      "MySpace",
    ]);
  });

  it("groups periods under the section in force when they appear", () => {
    const text =
      "timeline\n  title T\n  2002 : a\n  section Social\n    2004 : b\n    2006 : c\n  section Video\n    2005 : d\n";
    const r = parseTimeline(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.periods.map((p) => [p.label, p.section])).toEqual([
      ["2002", null],
      ["2004", "Social"],
      ["2006", "Social"],
      ["2005", "Video"],
    ]);
  });

  it("tolerates a period with no events and a dangling colon", () => {
    const r = parseTimeline("timeline\n  2002\n  2004 :\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.periods.map((p) => p.events.length)).toEqual([0, 0]);
  });

  it("records period and event spans for inline relabel", () => {
    const text = "timeline\n  2002 : LinkedIn\n";
    const r = parseTimelineWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const ps = r.value.source.periods.get(pid("p0"));
    const es = r.value.source.events.get(evid("e0"));
    expect(ps).toBeDefined();
    expect(es).toBeDefined();
    if (ps !== undefined) expect(text.slice(ps.start, ps.end)).toBe("2002");
    if (es !== undefined) expect(text.slice(es.start, es.end)).toBe("LinkedIn");
  });

  it("fails loudly on a continuation `:` before any period", () => {
    expect(isOk(parseTimeline("timeline\n  : orphan\n"))).toBe(false);
  });

  it("does not treat a period whose text merely starts with a keyword as that keyword", () => {
    const r = parseTimeline("timeline\n  titles released : x\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.periods[0]?.label).toBe("titles released");
  });
});
