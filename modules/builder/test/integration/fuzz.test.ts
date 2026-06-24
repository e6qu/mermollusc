import fc from "fast-check";
import { brand, isOk } from "@m/std";
import { parseWithSource } from "@m/parser";
import { describe, expect, it } from "vitest";
import {
  addNode,
  connect,
  deleteEdge,
  deleteNode,
  relabelNode,
  reshapeNode,
} from "../../src/core/patch.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const SHAPES = ["rect", "round", "stadium", "diamond", "circle"] as const;
const EDGES = ["arrow", "open", "dotted", "thick"] as const;

// Adversarial labels: include every delimiter that could terminate a token early (brackets, pipes,
// quotes, newlines) plus unicode — exactly what `validateLabel` must reject so a relabel can't corrupt.
const wildLabel = fc
  .array(fc.constantFrom(..."abc12 []{}()|\"'<>:;-\n\té🙂"), { maxLength: 12 })
  .map((cs) => cs.join(""));

type Op =
  | { readonly k: "add"; readonly label: string; readonly shape: number }
  | { readonly k: "connect"; readonly a: number; readonly b: number; readonly edge: number }
  | { readonly k: "delNode"; readonly i: number }
  | { readonly k: "delEdge"; readonly a: number; readonly b: number }
  | { readonly k: "relabel"; readonly i: number; readonly label: string }
  | { readonly k: "reshape"; readonly i: number; readonly shape: number };

// Add/Duplicate always supply a generated, bracket-free label (never user text), so the fuzz feeds add
// a clean label — the user-typed-anything path is `relabel`, which must validate.
const cleanLabel = fc.constantFrom("node", "Alpha", "Beta", "Svc 1");
const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ k: fc.constant("add" as const), label: cleanLabel, shape: fc.nat() }),
  fc.record({ k: fc.constant("connect" as const), a: fc.nat(), b: fc.nat(), edge: fc.nat() }),
  fc.record({ k: fc.constant("delNode" as const), i: fc.nat() }),
  fc.record({ k: fc.constant("delEdge" as const), a: fc.nat(), b: fc.nat() }),
  fc.record({ k: fc.constant("relabel" as const), i: fc.nat(), label: wildLabel }),
  fc.record({ k: fc.constant("reshape" as const), i: fc.nat(), shape: fc.nat() }),
);

const reparses = (text: string): boolean => isOk(parseWithSource(text));

describe("builder fuzz — patches never corrupt the source", () => {
  it("a random sequence of flowchart edits always leaves parseable text", () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 25 }), (ops) => {
        let text = "flowchart TD\n  A[Start] --> B[Mid]\n  B --> C[End]\n";
        let fresh = 0;
        for (const op of ops) {
          const parsed = parseWithSource(text);
          // Invariant under test: every prior edit kept the text parseable.
          expect(reparses(text)).toBe(true);
          if (!isOk(parsed)) break;
          const { ast, source } = parsed.value;
          const ids = ast.nodes.map((n) => n.id);
          if (ids.length === 0) {
            text = addNode(text, nid(`g${fresh++}`), "x", "rect");
            continue;
          }
          const pick = (n: number) => ids[n % ids.length] ?? nid("A"); // ids is non-empty here
          switch (op.k) {
            case "add":
              text = addNode(text, nid(`g${fresh++}`), op.label, SHAPES[op.shape % SHAPES.length] ?? "rect");
              break;
            case "connect":
              text = connect(text, pick(op.a), pick(op.b), EDGES[op.edge % EDGES.length] ?? "arrow");
              break;
            case "delNode":
              text = deleteNode(text, pick(op.i));
              break;
            case "delEdge":
              text = deleteEdge(text, pick(op.a), pick(op.b));
              break;
            case "relabel": {
              const r = relabelNode(text, source, pick(op.i), op.label);
              if (isOk(r)) text = r.value; // a rejected label (Result err) must NOT mutate the text
              break;
            }
            case "reshape": {
              const node = ast.nodes.find((n) => n.id === pick(op.i));
              const r = reshapeNode(text, source, pick(op.i), node?.label ?? "x", SHAPES[op.shape % SHAPES.length] ?? "rect");
              if (isOk(r)) text = r.value;
              break;
            }
          }
        }
        // The accumulated edits must still parse — any corruption is a bug.
        expect(reparses(text)).toBe(true);
      }),
      { numRuns: 1500 },
    );
  });

  it("relabelNode that returns ok always yields parseable text, for any label", () => {
    const base = "flowchart TD\n  A[Start] --> B(Mid)\n  C{D}\n";
    const parsed = parseWithSource(base);
    if (!isOk(parsed)) throw new Error("base must parse");
    const { source } = parsed.value;
    fc.assert(
      fc.property(fc.constantFrom("A", "B", "C"), wildLabel, (id, label) => {
        const r = relabelNode(base, source, nid(id), label);
        if (isOk(r)) expect(reparses(r.value)).toBe(true);
      }),
      { numRuns: 3000 },
    );
  });
});
