import type { CstElement, CstNode, IToken } from "chevrotain";
import { brand, err, ok, type Result } from "@m/std";
import type {
  CloudAst,
  CloudGroup,
  CloudLink,
  CloudNode,
  CloudNodeKind,
  NodeId,
} from "@m/contracts";
import { cloudParser } from "./cloud-grammar.js";
import { cloudLexer } from "./cloud-tokens.js";
import type { ParseError } from "./parse.js";

type Children = Record<string, CstElement[] | undefined>;

const childTokens = (c: Children, name: string): IToken[] => (c[name] ?? []) as IToken[];
const childNodes = (c: Children, name: string): CstNode[] => (c[name] ?? []) as CstNode[];
const imageOf = (c: Children, name: string): string | null =>
  childTokens(c, name)[0]?.image ?? null;
const unquote = (s: string): string => s.slice(1, -1);

const KIND_TOKEN: ReadonlyMap<string, CloudNodeKind> = new Map([
  ["Compute", "compute"],
  ["Storage", "storage"],
  ["CloudDatabase", "database"],
  ["CloudQueue", "queue"],
  ["Cdn", "cdn"],
]);

const kindOf = (c: Children): CloudNodeKind => {
  for (const [token, kind] of KIND_TOKEN) {
    if (childTokens(c, token).length > 0) return kind;
  }
  return "compute";
};

interface Acc {
  readonly groups: CloudGroup[];
  readonly nodes: CloudNode[];
  readonly links: CloudLink[];
}

const walkItems = (items: readonly CstNode[], parent: NodeId | null, acc: Acc): void => {
  for (const item of items) {
    const group = childNodes(item.children, "group")[0];
    if (group !== undefined) {
      const id = brand<string, "NodeId">(`g${acc.groups.length}`);
      acc.groups.push({
        id,
        label: unquote(imageOf(group.children, "CloudQuoted") ?? '""'),
        parent,
      });
      walkItems(childNodes(group.children, "item"), id, acc);
      continue;
    }
    const leaf = childNodes(item.children, "leaf")[0];
    if (leaf !== undefined) {
      const nodeId = imageOf(leaf.children, "CloudIdentifier") ?? "";
      const quoted = imageOf(leaf.children, "CloudQuoted");
      const kindNode = childNodes(leaf.children, "kind")[0];
      acc.nodes.push({
        id: brand<string, "NodeId">(nodeId),
        label: quoted === null ? nodeId : unquote(quoted),
        kind: kindNode === undefined ? "compute" : kindOf(kindNode.children),
        parent,
      });
      continue;
    }
    const link = childNodes(item.children, "link")[0];
    if (link === undefined) continue;
    const ids = childTokens(link.children, "CloudIdentifier");
    const quoted = imageOf(link.children, "CloudQuoted");
    acc.links.push({
      id: brand<string, "EdgeId">(`l${acc.links.length}`),
      from: brand<string, "NodeId">(ids[0]?.image ?? ""),
      to: brand<string, "NodeId">(ids[1]?.image ?? ""),
      label: quoted === null ? null : unquote(quoted),
    });
  }
};

export const parseCloud = (text: string): Result<CloudAst, ParseError> => {
  const lexed = cloudLexer.tokenize(text);
  if (lexed.errors.length > 0) {
    return err({ kind: "parse", errors: lexed.errors.map((e) => e.message) });
  }
  cloudParser.input = lexed.tokens;
  const cst = cloudParser.cloud();
  if (cloudParser.errors.length > 0) {
    return err({ kind: "parse", errors: cloudParser.errors.map((e) => e.message) });
  }
  const acc: Acc = { groups: [], nodes: [], links: [] };
  walkItems(childNodes(cst.children, "item"), null, acc);
  return ok({ kind: "cloud", groups: acc.groups, nodes: acc.nodes, links: acc.links });
};
