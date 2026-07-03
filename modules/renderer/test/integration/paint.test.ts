import { brand, coordinate, length, point, rect } from "@m/std";
import type { Scene } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { toDisplayList } from "../../src/core/display.js";
import { accentFill, bandFill, type Canvas2D, darkTheme, defaultTheme, paint, type Theme } from "../../src/shell/paint.js";

class RecordingCtx implements Canvas2D {
  fillStyle: string | CanvasGradient | CanvasPattern = "";
  strokeStyle: string | CanvasGradient | CanvasPattern = "";
  lineWidth = 0;
  globalAlpha = 1;
  font = "";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  readonly calls: string[] = [];
  readonly fillTextFonts: string[] = [];
  readonly fillTexts: { readonly text: string; readonly alpha: number }[] = [];
  readonly fillRects: { readonly w: number; readonly h: number; readonly alpha: number; readonly fill: string }[] = [];
  beginPath(): void {
    this.calls.push("beginPath");
  }
  moveTo(): void {
    this.calls.push("moveTo");
  }
  lineTo(): void {
    this.calls.push("lineTo");
  }
  bezierCurveTo(): void {
    this.calls.push("bezierCurveTo");
  }
  quadraticCurveTo(): void {
    this.calls.push("quadraticCurveTo");
  }
  closePath(): void {
    this.calls.push("closePath");
  }
  stroke(): void {
    this.calls.push("stroke");
  }
  fill(): void {
    this.calls.push("fill");
  }
  fillText(text: string): void {
    this.calls.push(`fillText:${text}`);
    this.fillTextFonts.push(this.font);
    this.fillTexts.push({ text, alpha: this.globalAlpha });
  }
  fillRect(_x: number, _y: number, w: number, h: number): void {
    this.calls.push(`fillRect:${String(this.fillStyle)}`);
    this.fillRects.push({ w, h, alpha: this.globalAlpha, fill: String(this.fillStyle) });
  }
  measureText(text: string): { readonly width: number } {
    return { width: text.length * 7 };
  }
  roundRect(): void {
    this.calls.push("roundRect");
  }
  arc(): void {
    this.calls.push("arc");
  }
  setLineDash(): void {
    this.calls.push("setLineDash");
  }
  drawImage(): void {
    this.calls.push("drawImage");
  }
}

const snid = (s: string) => brand<string, "SceneNodeId">(s);
const seid = (s: string) => brand<string, "SceneEdgeId">(s);

const scene: Scene = {
  nodes: [
    { id: snid("A"), bounds: rect(0, 0, 60, 40), label: "A", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "normal", rows: null },
    { id: snid("B"), bounds: rect(0, 80, 60, 40), label: "B", shape: "diamond", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "normal", rows: null },
  ],
  edges: [
    {
      id: seid("e0"),
      from: snid("A"),
      to: snid("B"),
      waypoints: [point(30, 40), point(30, 80)],
      label: null,
      stroke: "solid",
      fromEnd: "none",
      toEnd: "arrow",
      curved: false,
      fromLabel: null,
      toLabel: null,
      labelPos: null,
    },
  ],
  wedges: [],
  decorations: [], extent: rect(0, 0, 60, 120),
};

const iconScene: Scene = {
  nodes: [
    {
      id: snid("S"),
      bounds: rect(0, 0, 80, 48),
      label: "Web",
      shape: "rect",
      parent: null,
      icon: { pack: "devicon", name: "docker" },
      rowDivider: null, subtitle: null, accent: "none",
      role: "normal", rows: null,
    },
  ],
  edges: [],
  wedges: [],
  decorations: [], extent: rect(0, 0, 80, 48),
};

describe("paint", () => {
  it("executes the display list against the context", () => {
    const ctx = new RecordingCtx();
    paint(ctx, toDisplayList(scene));
    expect(ctx.calls.filter((c) => c === "roundRect")).toHaveLength(1);
    expect(ctx.calls).toContain("closePath");
    expect(ctx.calls).toContain("fillText:A");
    expect(ctx.calls).toContain("fillText:B");
    expect(ctx.calls.filter((c) => c === "moveTo").length).toBeGreaterThanOrEqual(2);
  });

  it("draws crow's-foot ER markers: stroked bars/prongs, a filled triangle, and a ringed circle", () => {
    const er: Scene = {
      nodes: [
        { id: snid("A"), bounds: rect(0, 0, 60, 40), label: "A", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "normal", rows: ["int id PK"] },
        { id: snid("B"), bounds: rect(0, 100, 60, 40), label: "B", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "normal", rows: null },
      ],
      edges: [
        {
          id: seid("e0"),
          from: snid("A"),
          to: snid("B"),
          waypoints: [point(30, 40), point(30, 100)],
          label: "rel",
          stroke: "dashed",
          fromEnd: "one",
          toEnd: "zeroOrMany",
          curved: false,
          fromLabel: null,
          toLabel: null,
          labelPos: null,
        },
      ],
      wedges: [],
      decorations: [], extent: rect(0, 0, 60, 140),
    };
    const ctx = new RecordingCtx();
    paint(ctx, toDisplayList(er));
    // The "zeroOrMany" ring is drawn with arc(); the row text appears left-aligned in the box.
    expect(ctx.calls).toContain("arc");
    expect(ctx.calls).toContain("fillText:int id PK");
    // The dashed edge stroke plus the bar/prong segments all go through stroke().
    expect(ctx.calls.filter((c) => c === "stroke").length).toBeGreaterThanOrEqual(3);
    // Sketch mode wobbles the marker line segments too (multi-pass), so it strokes strictly more.
    const sketchy = new RecordingCtx();
    paint(sketchy, toDisplayList(er), new Map(), { ...defaultTheme, sketch: true });
    expect(sketchy.calls.filter((c) => c === "stroke").length).toBeGreaterThan(
      ctx.calls.filter((c) => c === "stroke").length,
    );
  });

  it("draws a vertical edge label as translucent text on an opaque masking plate", () => {
    const labelled: Scene = {
      ...scene,
      edges: [
        {
          id: seid("e0"),
          from: snid("A"),
          to: snid("B"),
          waypoints: [point(30, 40), point(30, 80)],
          label: "edge",
          stroke: "solid",
          fromEnd: "none",
          toEnd: "arrow",
          curved: false,
          fromLabel: null,
          toLabel: null,
          labelPos: null,
        },
      ],
    };
    const ctx = new RecordingCtx();
    paint(ctx, toDisplayList(labelled), new Map(), { ...defaultTheme, font: "14px sans-serif" });
    // Vertical edge → the label sits on a small opaque (background-fill) plate that masks the line, with
    // 75%-alpha text. (A horizontal edge label would instead lift above the line with no plate.)
    const plate = ctx.fillRects.find((r) => r.fill === defaultTheme.background && r.w < 60 && r.w > 20);
    expect(plate).toBeDefined();
    const edgeText = ctx.fillTexts.find((t) => t.text === "edge");
    expect(edgeText?.alpha).toBe(0.75);
  });

  it("draws UML class markers (hollow triangle) and a field/method inner divider", () => {
    const cls: Scene = {
      nodes: [
        {
          id: snid("Animal"),
          bounds: rect(0, 0, 120, 70),
          label: "Animal",
          shape: "rect",
          parent: null,
          icon: null,
          rowDivider: 1, subtitle: null, accent: "none",
      role: "normal",
          rows: ["+int age", "+move() void"],
        },
        {
          id: snid("Duck"),
          bounds: rect(0, 120, 100, 30),
          label: "Duck",
          shape: "rect",
          parent: null,
          icon: null,
          rowDivider: null, subtitle: null, accent: "none",
      role: "normal",
          rows: null,
        },
      ],
      edges: [
        {
          id: seid("e0"),
          from: snid("Animal"),
          to: snid("Duck"),
          waypoints: [point(60, 70), point(60, 120)],
          label: null,
          stroke: "solid",
          fromEnd: "triangle",
          toEnd: "none",
          curved: false,
          fromLabel: null,
          toLabel: null,
          labelPos: null,
        },
      ],
      wedges: [],
      decorations: [], extent: rect(0, 0, 120, 150),
    };
    const ctx = new RecordingCtx();
    paint(ctx, toDisplayList(cls));
    // Title + both compartment rows render; the hollow head fills then strokes (closePath used).
    expect(ctx.calls).toContain("fillText:Animal");
    expect(ctx.calls).toContain("fillText:+int age");
    expect(ctx.calls).toContain("fillText:+move() void");
    expect(ctx.calls).toContain("closePath");
    // The box (1) + title divider + inner field/method divider → at least three stroke() calls.
    expect(ctx.calls.filter((c) => c === "stroke").length).toBeGreaterThanOrEqual(3);
  });

  it("draws a multi-line label, scaling the continuation line down", () => {
    const ml: Scene = {
      nodes: [
        { id: snid("C"), bounds: rect(0, 0, 90, 56), label: "API\nHandles", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "normal", rows: null },
      ],
      edges: [],
      wedges: [],
      decorations: [], extent: rect(0, 0, 90, 56),
    };
    const ctx = new RecordingCtx();
    paint(ctx, toDisplayList(ml), new Map(), { ...defaultTheme, font: "14px sans-serif" });
    expect(ctx.calls).toContain("fillText:API");
    expect(ctx.calls).toContain("fillText:Handles");
    // First line at the base font; the continuation line scaled down (14 * 0.82 ≈ 11.5).
    expect(ctx.fillTextFonts).toEqual(["14px sans-serif", "11.5px sans-serif"]);
  });

  it("uses the supplied theme's font and text colour", () => {
    const theme: Theme = {
      background: "#000000",
      nodeFill: "#000001",
      nodeStroke: "#000004",
      stroke: "#000002",
      text: "#000003",
      font: "11px monospace",
      sketch: false,
    };
    const nodeOnly: Scene = {
      nodes: [
        { id: snid("A"), bounds: rect(0, 0, 60, 40), label: "A", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "normal", rows: null },
      ],
      edges: [],
      wedges: [],
      decorations: [], extent: rect(0, 0, 60, 40),
    };
    const ctx = new RecordingCtx();
    paint(ctx, toDisplayList(nodeOnly), new Map(), theme);
    expect(ctx.font).toBe("11px monospace");
    // For a node-only scene the label is the last draw, so the final fill is the text colour.
    expect(ctx.fillStyle).toBe("#000003");
  });

  it("sketch theme wobbles compartment (ER/class) boxes too — no crisp roundRect", () => {
    const comp: Scene = {
      nodes: [
        {
          id: snid("CUSTOMER"),
          bounds: rect(0, 0, 120, 70),
          label: "CUSTOMER",
          shape: "rect",
          parent: null,
          icon: null,
          rowDivider: null, subtitle: null, accent: "none",
      role: "normal",
          rows: ["string name PK", "int age"],
        },
      ],
      edges: [],
      wedges: [],
      decorations: [], extent: rect(0, 0, 120, 70),
    };
    const sketchy = new RecordingCtx();
    paint(sketchy, toDisplayList(comp), new Map(), { ...defaultTheme, sketch: true });
    expect(sketchy.calls.filter((c) => c === "roundRect")).toHaveLength(0);
    expect(sketchy.calls).toContain(`fillRect:${defaultTheme.nodeFill}`);
    expect(sketchy.calls.filter((c) => c === "stroke").length).toBeGreaterThan(4);
    expect(sketchy.calls).toContain("fillText:string name PK");
  });

  it("sketch theme draws tinted fills plus wobbly outlines instead of crisp shapes", () => {
    const crisp = new RecordingCtx();
    paint(crisp, toDisplayList(scene), new Map(), defaultTheme);
    const sketchy = new RecordingCtx();
    paint(sketchy, toDisplayList(scene), new Map(), { ...defaultTheme, sketch: true });
    // Crisp mode uses roundRect for the box; sketch mode never does (it strokes wobbly lines).
    expect(crisp.calls.filter((c) => c === "roundRect").length).toBeGreaterThanOrEqual(1);
    expect(sketchy.calls.filter((c) => c === "roundRect")).toHaveLength(0);
    expect(sketchy.calls).toContain(`fillRect:${defaultTheme.nodeFill}`);
    // Sketch mode is stroke-heavy (multi-pass lines), labels still render.
    expect(sketchy.calls.filter((c) => c === "stroke").length).toBeGreaterThan(
      crisp.calls.filter((c) => c === "stroke").length,
    );
    expect(sketchy.calls).toContain("fillText:A");
  });

  it("paints state pseudo-node commands as marker primitives", () => {
    const ctx = new RecordingCtx();
    paint(ctx, [
      { kind: "stateStart", cx: coordinate(10), cy: coordinate(10), radius: length(10) },
      { kind: "stateEnd", cx: coordinate(40), cy: coordinate(10), radius: length(10) },
      { kind: "stateBar", x: coordinate(60), y: coordinate(6), width: length(48), height: length(8) },
    ]);
    expect(ctx.calls.filter((c) => c === "arc")).toHaveLength(3);
    expect(ctx.calls).toContain("roundRect");
    expect(ctx.calls.filter((c) => c === "fill").length).toBeGreaterThanOrEqual(3);
  });

  it("draws a curved 2-point connector as a bezier (not straight line segments)", () => {
    const curved: Scene = {
      nodes: [],
      edges: [
        {
          id: seid("e0"),
          from: snid("A"),
          to: snid("B"),
          waypoints: [point(0, 0), point(100, 60)],
          label: null,
          stroke: "solid",
          fromEnd: "none",
          toEnd: "none",
          curved: true,
          fromLabel: null,
          toLabel: null,
          labelPos: null,
        },
      ],
      wedges: [],
      decorations: [], extent: rect(0, 0, 120, 80),
    };
    const ctx = new RecordingCtx();
    paint(ctx, toDisplayList(curved));
    expect(ctx.calls).toContain("bezierCurveTo");
    expect(ctx.calls).not.toContain("lineTo"); // a curve, no straight segments
  });

  it("fills a pie wedge with an arc sweep", () => {
    const pie: Scene = {
      nodes: [],
      edges: [],
      wedges: [
        {
          center: point(100, 100),
          radius: 80,
          innerRadius: 0,
          startAngle: -Math.PI / 2,
          endAngle: Math.PI / 2,
          label: "Half",
          value: 50,
          percent: 50,
          colorIndex: 0,
        },
      ],
      decorations: [], extent: rect(0, 0, 200, 200),
    };
    const ctx = new RecordingCtx();
    paint(ctx, toDisplayList(pie));
    expect(ctx.calls).toContain("arc");
    expect(ctx.calls).toContain("fill");
    expect(ctx.calls).toContain("fillText:50%");
  });

  it("draws a donut slice as an annular sector (inner + outer arcs)", () => {
    const donut: Scene = {
      nodes: [],
      edges: [],
      wedges: [
        {
          center: point(100, 100),
          radius: 80,
          innerRadius: 40, // > 0 → the annular-sector path (two arcs joined)
          startAngle: -Math.PI / 2,
          endAngle: Math.PI / 2,
          label: "Half",
          value: 50,
          percent: 50,
          colorIndex: 1,
        },
      ],
      decorations: [],
      extent: rect(0, 0, 200, 200),
    };
    const ctx = new RecordingCtx();
    paint(ctx, toDisplayList(donut));
    expect(ctx.calls.filter((c) => c === "arc")).toHaveLength(2); // outer + inner sweep
    expect(ctx.calls).toContain("closePath");
    expect(ctx.calls).toContain("fill");
    expect(ctx.calls).toContain("stroke");
  });

  it("draws an icon glyph only when its image is supplied", () => {
    const without = new RecordingCtx();
    paint(without, toDisplayList(iconScene));
    expect(without.calls).not.toContain("drawImage");

    const ctx = new RecordingCtx();
    const fakeImage = new RecordingCtx() as unknown as CanvasImageSource;
    paint(ctx, toDisplayList(iconScene), new Map([["devicon/docker", fakeImage]]));
    expect(ctx.calls).toContain("drawImage");
    expect(ctx.calls).toContain("fillText:Web");
  });
});

describe("band decorations", () => {
  it("fills a background band rect with its theme-aware band colour", () => {
    const s: Scene = {
      nodes: [],
      edges: [],
      wedges: [],
      decorations: [{ kind: "band", bounds: rect(0, 20, 120, 30), fill: "section" }],
      extent: rect(0, 0, 120, 80),
    };
    const ctx = new RecordingCtx();
    paint(ctx, toDisplayList(s), new Map(), defaultTheme);
    expect(ctx.calls).toContain(`fillRect:${bandFill("section", defaultTheme)}`);
  });
});

describe("bandFill", () => {
  it("maps each band fill to a distinct, theme-aware colour", () => {
    const light = (["section", "sectionAlt", "excluded"] as const).map((f) => bandFill(f, defaultTheme));
    const dark = (["section", "sectionAlt", "excluded"] as const).map((f) => bandFill(f, darkTheme));
    expect(new Set(light).size).toBe(3); // three distinct light shades
    expect(new Set(dark).size).toBe(3);
    expect(dark).not.toEqual(light); // the luminance branch is exercised
  });
});

// WCAG relative-luminance contrast ratio between two `#rrggbb` colours. Guards the palette so a future
// tweak can't quietly drop a node label or border below the AA threshold (a contrast audit found every
// pair compliant; this keeps it that way).
const relativeLuminance = (hex: string): number => {
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
};
const contrast = (a: string, b: string): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

describe("palette contrast (WCAG AA)", () => {
  const themes = [defaultTheme, darkTheme];
  const accents = [
    "none",
    "muted",
    "active",
    "danger",
    "compute",
    "data",
    "network",
    "security",
    "ops",
  ] as const;

  it("a node label clears 4.5:1 against every accent fill, in both themes (1.4.3)", () => {
    for (const theme of themes) {
      for (const accent of accents) {
        const ratio = contrast(theme.text, accentFill(accent, theme));
        expect(ratio, `${accent} fill in ${theme.background} theme`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("a node stroke clears 3:1 against its fill and the background (1.4.11 non-text)", () => {
    for (const theme of themes) {
      expect(contrast(theme.stroke, theme.nodeFill)).toBeGreaterThanOrEqual(3);
      expect(contrast(theme.stroke, theme.background)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("accentFill", () => {
  it("maps `none` to the theme node fill and each semantic accent to a distinct, theme-aware colour", () => {
    expect(accentFill("none", defaultTheme)).toBe(defaultTheme.nodeFill);
    expect(accentFill("none", darkTheme)).toBe(darkTheme.nodeFill);

    const semantic = [
      "muted",
      "active",
      "danger",
      "compute",
      "data",
      "network",
      "security",
      "ops",
    ] as const;
    const light = semantic.map((a) => accentFill(a, defaultTheme));
    const dark = semantic.map((a) => accentFill(a, darkTheme));
    // each accent is distinct from the plain fill and from the others, in both themes
    expect(new Set([defaultTheme.nodeFill, ...light]).size).toBe(semantic.length + 1);
    expect(new Set([darkTheme.nodeFill, ...dark]).size).toBe(semantic.length + 1);
    // dark-theme accents differ from light-theme ones (the luminance branch is exercised)
    expect(dark).not.toEqual(light);
  });
});
