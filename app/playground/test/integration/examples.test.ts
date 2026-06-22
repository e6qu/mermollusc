import { parseDiagram } from "@m/parser";
import { isOk } from "@m/std";
import { describe, it } from "vitest";
import { EXAMPLES } from "../../src/examples.js";

describe("playground examples", () => {
  for (const [name, text] of EXAMPLES) {
    it(`parses the ${name} menu example`, () => {
      const parsed = parseDiagram(text);
      if (!isOk(parsed)) throw new Error(parsed.error.errors.join("; "));
    });
  }
});
