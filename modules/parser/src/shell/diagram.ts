import type { Result } from "@m/std";
import type { DiagramAst } from "@m/contracts";
import { parseBlock } from "./block-parse.js";
import { parseC4 } from "./c4-parse.js";
import { parseClass } from "./class-parse.js";
import { parseCloud } from "./cloud-parse.js";
import { parseEr } from "./er-parse.js";
import { parseGitGraph } from "./git-parse.js";
import { parseNetwork } from "./net-parse.js";
import { parse } from "./parse.js";
import { parseRequirement } from "./req-parse.js";
import type { ParseError } from "./parse.js";
import { parseSequence } from "./seq-parse.js";
import { parseState } from "./state-parse.js";

// Sniffs the first meaningful line (skipping blanks and `%%` comments) to pick the family.
export const parseDiagram = (text: string): Result<DiagramAst, ParseError> => {
  const header =
    text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith("%%")) ?? "";
  if (header.startsWith("stateDiagram")) return parseState(text);
  if (header.startsWith("classDiagram")) return parseClass(text);
  if (header.startsWith("requirementDiagram")) return parseRequirement(text);
  if (header.startsWith("erDiagram")) return parseEr(text);
  if (header.startsWith("sequenceDiagram")) return parseSequence(text);
  if (header.startsWith("C4")) return parseC4(text);
  if (header.startsWith("block")) return parseBlock(text);
  if (header.startsWith("network")) return parseNetwork(text);
  if (header.startsWith("cloud")) return parseCloud(text);
  if (header.startsWith("gitGraph")) return parseGitGraph(text);
  return parse(text);
};
