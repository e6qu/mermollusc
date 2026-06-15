import type { Result } from "@m/std";
import type { DiagramAst } from "@m/contracts";
import { parse } from "./parse.js";
import type { ParseError } from "./parse.js";
import { parseSequence } from "./seq-parse.js";

// Sniffs the first meaningful line (skipping blanks and `%%` comments) to pick the family.
export const parseDiagram = (text: string): Result<DiagramAst, ParseError> => {
  const header =
    text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith("%%")) ?? "";
  if (header.startsWith("sequenceDiagram")) return parseSequence(text);
  return parse(text);
};
