import type { CstElement, CstNode, IToken } from "chevrotain";
import { brand, err, map, ok, type Result } from "@m/std";
import type {
  CloudAst,
  CloudGroup,
  CloudLink,
  CloudNode,
  CloudNodeKind,
  CloudSource,
  EdgeId,
  IconRef,
  NodeId,
  TextSpan,
} from "@m/contracts";
import { cloudParser } from "./cloud-grammar.js";
import { cloudLexer } from "./cloud-tokens.js";
import { lexingError, recognitionError } from "./parse-error.js";
import type { ParseError } from "./parse-error.js";

export interface ParsedCloud {
  readonly ast: CloudAst;
  readonly source: CloudSource;
}

type Children = Record<string, CstElement[] | undefined>;

const childTokens = (c: Children, name: string): IToken[] => (c[name] ?? []) as IToken[];
const childNodes = (c: Children, name: string): CstNode[] => (c[name] ?? []) as CstNode[];
const imageOf = (c: Children, name: string): string | null =>
  childTokens(c, name)[0]?.image ?? null;
const unquote = (s: string): string => s.slice(1, -1);
// Inner span of a `"…"` token (between the quotes), derived from image length.
const innerSpan = (t: IToken): TextSpan => ({
  start: t.startOffset + 1,
  end: t.startOffset + t.image.length - 1,
});

// `"<pack>/<name>"` (a quoted-token image) → an icon ref; null unless it's a two-part reference.
const parseIconRef = (image: string): IconRef | null => {
  const slash = image.indexOf("/");
  if (slash <= 1 || slash >= image.length - 2) return null;
  return { pack: image.slice(1, slash), name: image.slice(slash + 1, -1) };
};

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
  readonly groupSpans: Map<NodeId, TextSpan>;
  readonly nodeSpans: Map<NodeId, TextSpan>;
  readonly linkSpans: Map<EdgeId, TextSpan>;
}

const walkItems = (items: readonly CstNode[], parent: NodeId | null, acc: Acc): void => {
  for (const item of items) {
    const group = childNodes(item.children, "group")[0];
    if (group !== undefined) {
      // Groups are named only by a quoted label, so their id is synthetic. The `:` keeps it out of
      // the `CloudIdentifier` space (`[A-Za-z0-9_]+`) — a user service named `g0` can no longer
      // collide with the first group and silently overwrite its box / hit-test / source identity.
      const id = brand<string, "NodeId">(`group:${acc.groups.length}`);
      const label = childTokens(group.children, "CloudQuoted")[0];
      acc.groups.push({ id, label: unquote(label?.image ?? '""'), parent });
      if (label !== undefined) acc.groupSpans.set(id, innerSpan(label));
      walkItems(childNodes(group.children, "item"), id, acc);
      continue;
    }
    const leaf = childNodes(item.children, "leaf")[0];
    if (leaf !== undefined) {
      const id = brand<string, "NodeId">(imageOf(leaf.children, "CloudIdentifier") ?? "");
      // Grammar order is `[label] [icon "ref"]`: with an `icon`, the ref is the last quoted string
      // and a label exists only when there are two; without one, the sole quote is the label.
      const quotes = childTokens(leaf.children, "CloudQuoted");
      const hasIcon = childTokens(leaf.children, "CloudIcon").length > 0;
      const iconToken = hasIcon ? quotes[quotes.length - 1] : undefined;
      const labelToken = hasIcon ? (quotes.length >= 2 ? quotes[0] : undefined) : quotes[0];
      const kindNode = childNodes(leaf.children, "kind")[0];
      acc.nodes.push({
        id,
        label: labelToken === undefined ? id : unquote(labelToken.image),
        kind: kindNode === undefined ? "compute" : kindOf(kindNode.children),
        parent,
        icon: iconToken === undefined ? null : parseIconRef(iconToken.image),
      });
      if (labelToken !== undefined) acc.nodeSpans.set(id, innerSpan(labelToken));
      continue;
    }
    const link = childNodes(item.children, "link")[0];
    if (link === undefined) continue;
    const ids = childTokens(link.children, "CloudIdentifier");
    const label = childTokens(link.children, "CloudQuoted")[0];
    const linkId = brand<string, "EdgeId">(`l${acc.links.length}`);
    acc.links.push({
      id: linkId,
      from: brand<string, "NodeId">(ids[0]?.image ?? ""),
      to: brand<string, "NodeId">(ids[1]?.image ?? ""),
      label: label === undefined ? null : unquote(label.image),
    });
    if (label !== undefined) acc.linkSpans.set(linkId, innerSpan(label));
  }
};

export const parseCloudWithSource = (text: string): Result<ParsedCloud, ParseError> => {
  const lexed = cloudLexer.tokenize(text);
  if (lexed.errors.length > 0) {
    return err(lexingError(lexed.errors));
  }
  cloudParser.input = lexed.tokens;
  const cst = cloudParser.cloud();
  if (cloudParser.errors.length > 0) {
    return err(recognitionError(cloudParser.errors));
  }
  const acc: Acc = {
    groups: [],
    nodes: [],
    links: [],
    groupSpans: new Map(),
    nodeSpans: new Map(),
    linkSpans: new Map(),
  };
  walkItems(childNodes(cst.children, "item"), null, acc);
  return ok({
    ast: { kind: "cloud", groups: acc.groups, nodes: acc.nodes, links: acc.links },
    source: { groups: acc.groupSpans, nodes: acc.nodeSpans, links: acc.linkSpans },
  });
};

export const parseCloud = (text: string): Result<CloudAst, ParseError> =>
  map(parseCloudWithSource(text), (parsed) => parsed.ast);
