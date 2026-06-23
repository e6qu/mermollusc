import type { CstNode, IToken } from "chevrotain";
import { childNodes, childTokens } from "./cst.js";
import type { Children } from "./cst.js";
import { brand, err, map, ok, type Result } from "@m/std";
import type {
  EdgeId,
  IconRef,
  NetworkAst,
  NetworkLink,
  NetworkNode,
  NetworkNodeKind,
  NetworkSource,
  NodeId,
  TextSpan,
} from "@m/contracts";
import { lexingError, parseErrorAt, recognitionError } from "./parse-error.js";
import type { ParseError } from "./parse-error.js";
import { iconRefOf } from "./icon-ref.js";
import { networkParser } from "./net-grammar.js";
import { netLexer } from "./net-tokens.js";

export interface ParsedNetwork {
  readonly ast: NetworkAst;
  readonly source: NetworkSource;
}

// The kind subrule consumes exactly one keyword token; its name is the node kind.
const KIND_TOKENS: readonly NetworkNodeKind[] = [
  "server",
  "database",
  "cloud",
  "router",
  "switch",
  "firewall",
  "host",
];

const kindOf = (c: Children): NetworkNodeKind => {
  for (const k of KIND_TOKENS) {
    const name = `${k.charAt(0).toUpperCase()}${k.slice(1)}`;
    if (childTokens(c, name).length > 0) return k;
  }
  return "host";
};

const unquote = (s: string): string => s.slice(1, -1);
// Inner span of a `"…"` token (between the quotes), derived from image length.
const innerSpan = (t: IToken): TextSpan => ({
  start: t.startOffset + 1,
  end: t.startOffset + t.image.length - 1,
});

const buildResult = (cst: CstNode): Result<ParsedNetwork, ParseError> => {
  const root = cst.children;
  const nodeMap = new Map<string, NetworkNode>();
  const nodeSpans = new Map<NodeId, TextSpan>();
  const linkSpans = new Map<EdgeId, TextSpan>();
  const links: NetworkLink[] = [];

  for (const stmt of childNodes(root, "statement")) {
    const decl = childNodes(stmt.children, "nodeDecl")[0];
    if (decl !== undefined) {
      const id = childTokens(decl.children, "Identifier")[0]?.image ?? "";
      const nodeId = brand<string, "NodeId">(id);
      const kindNode = childNodes(decl.children, "kind")[0];
      const kind = kindNode === undefined ? "host" : kindOf(kindNode.children);
      // Grammar order is `[label] [icon "ref"]`: with an `icon`, the ref is the last quoted string
      // and a label exists only when there are two; without one, the sole quoted string is the label.
      const quotes = childTokens(decl.children, "QuotedString");
      const hasIcon = childTokens(decl.children, "Icon").length > 0;
      const iconToken = hasIcon ? quotes[quotes.length - 1] : undefined;
      const labelToken = hasIcon ? (quotes.length >= 2 ? quotes[0] : undefined) : quotes[0];
      let icon: IconRef | null = null;
      if (iconToken !== undefined) {
        const ref = iconRefOf(iconToken.image);
        if (!ref.ok) {
          return err(parseErrorAt(ref.error, iconToken.startOffset, iconToken.image.length));
        }
        icon = ref.value;
      }
      nodeMap.set(id, {
        id: nodeId,
        label: labelToken === undefined ? id : unquote(labelToken.image),
        kind,
        icon,
      });
      if (labelToken !== undefined) nodeSpans.set(nodeId, innerSpan(labelToken));
      continue;
    }

    const link = childNodes(stmt.children, "link")[0];
    if (link === undefined) continue;
    const ids = childTokens(link.children, "Identifier");
    const labelToken = childTokens(link.children, "QuotedString")[0];
    const linkId = brand<string, "EdgeId">(`l${links.length}`);
    links.push({
      id: linkId,
      from: brand<string, "NodeId">(ids[0]?.image ?? ""),
      to: brand<string, "NodeId">(ids[1]?.image ?? ""),
      label: labelToken === undefined ? null : unquote(labelToken.image),
    });
    if (labelToken !== undefined) linkSpans.set(linkId, innerSpan(labelToken));
  }

  return ok({
    ast: { kind: "network", nodes: [...nodeMap.values()], links },
    source: { nodes: nodeSpans, links: linkSpans },
  });
};

export const parseNetworkWithSource = (text: string): Result<ParsedNetwork, ParseError> => {
  const lexed = netLexer.tokenize(text);
  if (lexed.errors.length > 0) {
    return err(lexingError(lexed.errors));
  }
  networkParser.input = lexed.tokens;
  const cst = networkParser.network();
  if (networkParser.errors.length > 0) {
    return err(recognitionError(networkParser.errors));
  }
  return buildResult(cst);
};

export const parseNetwork = (text: string): Result<NetworkAst, ParseError> =>
  map(parseNetworkWithSource(text), (parsed) => parsed.ast);
