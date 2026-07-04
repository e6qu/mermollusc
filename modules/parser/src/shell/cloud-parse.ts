import type { CstNode, IToken } from "chevrotain";
import { childNodes, childTokens } from "./cst.js";
import type { Children } from "./cst.js";
import { brand, err, map, ok, type Result } from "@m/std";
import type {
  CloudAst,
  FlowStyle,
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
import { iconRefOf } from "./icon-ref.js";
import { lexingError, parseErrorAt, recognitionError } from "./parse-error.js";
import type { ParseError } from "./parse-error.js";

export interface ParsedCloud {
  readonly ast: CloudAst;
  readonly source: CloudSource;
}

const unquote = (s: string): string => s.slice(1, -1);
// Inner span of a `"…"` token (between the quotes), derived from image length.
const innerSpan = (t: IToken): TextSpan => ({
  start: t.startOffset + 1,
  end: t.startOffset + t.image.length - 1,
});

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
  readonly styles: FlowStyle[];
  readonly groupSpans: Map<NodeId, TextSpan>;
  readonly nodeSpans: Map<NodeId, TextSpan>;
  // Id-token spans for label-less leaves, so the editor can relabel one by appending a `"label"`.
  readonly bareSpans: Map<NodeId, TextSpan>;
  readonly linkSpans: Map<EdgeId, TextSpan>;
  // First malformed-icon (or other semantic) failure; once set, the walk bails and the parse fails.
  error: ParseError | null;
}

const walkItems = (items: readonly CstNode[], parent: NodeId | null, acc: Acc): void => {
  for (const item of items) {
    if (acc.error !== null) return; // a malformed icon already failed the parse — stop walking
    const styleDir = childNodes(item.children, "cloudStyleDirective")[0];
    if (styleDir !== undefined) {
      const st = childTokens(styleDir.children, "CloudStyleStmt")[0];
      const cd = childTokens(styleDir.children, "CloudClassDefStmt")[0];
      const cl = childTokens(styleDir.children, "CloudClassStmt")[0];
      const ls = childTokens(styleDir.children, "CloudLinkStyleStmt")[0];
      if (st !== undefined) acc.styles.push({ kind: "style", raw: st.image.trim() });
      else if (cd !== undefined) acc.styles.push({ kind: "classDef", raw: cd.image.trim() });
      else if (cl !== undefined) acc.styles.push({ kind: "class", raw: cl.image.trim() });
      else if (ls !== undefined) acc.styles.push({ kind: "linkStyle", raw: ls.image.trim() });
      continue;
    }
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
      const idTok = childTokens(leaf.children, "CloudIdentifier")[0];
      const id = brand<string, "NodeId">(idTok?.image ?? "");
      // Grammar order is `[label] [icon "ref"]`: with an `icon`, the ref is the last quoted string
      // and a label exists only when there are two; without one, the sole quote is the label.
      const quotes = childTokens(leaf.children, "CloudQuoted");
      const hasIcon = childTokens(leaf.children, "CloudIcon").length > 0;
      const iconToken = hasIcon ? quotes[quotes.length - 1] : undefined;
      const labelToken = hasIcon ? (quotes.length >= 2 ? quotes[0] : undefined) : quotes[0];
      const kindNode = childNodes(leaf.children, "kind")[0];
      let icon: IconRef | null = null;
      if (iconToken !== undefined) {
        const ref = iconRefOf(iconToken.image);
        if (!ref.ok) {
          acc.error = parseErrorAt(ref.error, iconToken.startOffset, iconToken.image.length);
          return;
        }
        icon = ref.value;
      }
      acc.nodes.push({
        id,
        label: labelToken === undefined ? id : unquote(labelToken.image),
        kind: kindNode === undefined ? "compute" : kindOf(kindNode.children),
        parent,
        icon,
      });
      if (labelToken !== undefined) acc.nodeSpans.set(id, innerSpan(labelToken));
      else if (idTok !== undefined)
        acc.bareSpans.set(id, {
          start: idTok.startOffset,
          end: idTok.startOffset + idTok.image.length,
        });
      continue;
    }
    const link = childNodes(item.children, "link")[0];
    if (link === undefined) continue;
    const ids = childTokens(link.children, "CloudIdentifier");
    const label = childTokens(link.children, "CloudQuoted")[0];
    const directed = childTokens(link.children, "CloudArrow").length > 0;
    const linkId = brand<string, "EdgeId">(`l${acc.links.length}`);
    acc.links.push({
      id: linkId,
      from: brand<string, "NodeId">(ids[0]?.image ?? ""),
      to: brand<string, "NodeId">(ids[1]?.image ?? ""),
      label: label === undefined ? null : unquote(label.image),
      directed,
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
    styles: [],
    groupSpans: new Map(),
    nodeSpans: new Map(),
    bareSpans: new Map(),
    linkSpans: new Map(),
    error: null,
  };
  walkItems(childNodes(cst.children, "item"), null, acc);
  if (acc.error !== null) return err(acc.error);
  return ok({
    ast: {
      kind: "cloud",
      styles: acc.styles,
      groups: acc.groups,
      nodes: acc.nodes,
      links: acc.links,
    },
    source: {
      groups: acc.groupSpans,
      nodes: acc.nodeSpans,
      links: acc.linkSpans,
      bareNodes: acc.bareSpans,
    },
  });
};

export const parseCloud = (text: string): Result<CloudAst, ParseError> =>
  map(parseCloudWithSource(text), (parsed) => parsed.ast);
