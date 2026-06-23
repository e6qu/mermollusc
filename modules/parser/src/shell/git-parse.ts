import type { CstNode, IToken } from "chevrotain";
import { childNodes, childTokens } from "./cst.js";
import type { Children } from "./cst.js";
import { brand, err, map, ok, type Result } from "@m/std";
import type {
  GitBranch,
  GitCommit,
  GitCommitId,
  GitCommitType,
  GitDirection,
  GitGraphAst,
  GitGraphSource,
  TextSpan,
} from "@m/contracts";
import { parseError, parseErrorAt, lexingError, recognitionError } from "./parse-error.js";
import type { ParseError } from "./parse-error.js";
import { gitGraphParser } from "./git-grammar.js";
import { gitLexer } from "./git-tokens.js";

export interface ParsedGitGraph {
  readonly ast: GitGraphAst;
  readonly source: GitGraphSource;
}

const unquote = (s: string): string => s.slice(1, -1);
// Inner span of a `"…"` token (between the quotes), derived from image length.
const innerSpan = (t: IToken): TextSpan => ({
  start: t.startOffset + 1,
  end: t.startOffset + t.image.length - 1,
});

const directionOf = (root: Children): GitDirection => {
  const dir = childNodes(root, "direction")[0];
  if (dir === undefined) return "LR";
  if (childTokens(dir.children, "DirTB").length > 0) return "TB";
  if (childTokens(dir.children, "DirBT").length > 0) return "BT";
  return "LR";
};

// A branch reference (`branch`/`checkout`/`merge` operand): its resolved name plus the token, so a
// semantic error (unknown / self-merge branch) can be located at the exact source range.
interface BranchRef {
  readonly name: string;
  readonly token: IToken;
}

const branchRefOf = (stmt: Children): BranchRef | null => {
  const node = childNodes(stmt, "branchName")[0];
  if (node === undefined) return null;
  const quoted = childTokens(node.children, "QuotedString")[0];
  if (quoted !== undefined) return { name: unquote(quoted.image), token: quoted };
  const ident = childTokens(node.children, "Identifier")[0];
  if (ident === undefined) return null;
  return { name: ident.image, token: ident };
};

const typeOf = (node: CstNode | undefined): GitCommitType => {
  if (node === undefined) return "normal";
  const v = childNodes(node.children, "commitTypeVal")[0];
  if (v === undefined) return "normal";
  if (childTokens(v.children, "Reverse").length > 0) return "reverse";
  if (childTokens(v.children, "Highlight").length > 0) return "highlight";
  return "normal";
};

// The parsed `id:`/`tag:`/`type:` attributes of a `commit` or `merge`. `idSpan` points at the inner
// text of an explicit `id: "…"` (for inline editing); null when the id was auto-generated.
interface CommitOpts {
  readonly id: string | null;
  readonly idSpan: TextSpan | null;
  readonly tag: string | null;
  readonly commitType: GitCommitType;
}

const optsOf = (stmt: Children): CommitOpts => {
  let id: string | null = null;
  let idSpan: TextSpan | null = null;
  let tag: string | null = null;
  let commitType: GitCommitType = "normal";
  for (const opt of childNodes(stmt, "commitOpt")) {
    const c = opt.children;
    const quoted = childTokens(c, "QuotedString")[0];
    if (childTokens(c, "Id").length > 0 && quoted !== undefined) {
      id = unquote(quoted.image);
      idSpan = innerSpan(quoted);
    } else if (childTokens(c, "Tag").length > 0 && quoted !== undefined) {
      tag = unquote(quoted.image);
    } else if (childTokens(c, "Type").length > 0) {
      commitType = typeOf(opt);
    }
  }
  return { id, idSpan, tag, commitType };
};

const buildResult = (cst: CstNode): Result<ParsedGitGraph, ParseError> => {
  const root = cst.children;
  const direction = directionOf(root);

  const branchOrder = new Map<string, number>([["main", 0]]);
  const tip = new Map<string, GitCommitId | null>([["main", null]]);
  let current = "main";

  const commits: GitCommit[] = [];
  const commitSpans = new Map<GitCommitId, TextSpan>();
  const usedIds = new Set<string>();

  // Resolves a commit id: an explicit `id:` must be unique (a duplicate is a loud error, as in real
  // git); an absent one gets the first free `cN`, so a synthetic id can never shadow an explicit one.
  const mintId = (opts: CommitOpts): Result<GitCommitId, ParseError> => {
    if (opts.id !== null) {
      if (usedIds.has(opts.id)) {
        const span = opts.idSpan;
        const msg = `gitGraph: duplicate commit id "${opts.id}"`;
        return span === null
          ? err(parseError([msg]))
          : err(parseErrorAt(msg, span.start, span.end - span.start));
      }
      usedIds.add(opts.id);
      return ok(brand<string, "GitCommitId">(opts.id));
    }
    let k = commits.length;
    while (usedIds.has(`c${k}`)) k++;
    const auto = `c${k}`;
    usedIds.add(auto);
    return ok(brand<string, "GitCommitId">(auto));
  };

  for (const stmt of childNodes(root, "statement")) {
    const sc = stmt.children;

    const commit = childNodes(sc, "commitStmt")[0];
    if (commit !== undefined) {
      const opts = optsOf(commit.children);
      const minted = mintId(opts);
      if (!minted.ok) return err(minted.error);
      const parent = tip.get(current) ?? null;
      commits.push({
        id: minted.value,
        branch: brand<string, "GitBranchName">(current),
        parents: parent === null ? [] : [parent],
        tag: opts.tag,
        commitType: opts.commitType,
        merge: false,
      });
      tip.set(current, minted.value);
      if (opts.idSpan !== null) commitSpans.set(minted.value, opts.idSpan);
      continue;
    }

    const branchStmt = childNodes(sc, "branchStmt")[0];
    if (branchStmt !== undefined) {
      const ref = branchRefOf(branchStmt.children);
      if (ref === null) continue;
      if (branchOrder.has(ref.name)) {
        return err(
          parseErrorAt(
            `gitGraph: branch "${ref.name}" already exists`,
            ref.token.startOffset,
            ref.token.image.length,
          ),
        );
      }
      branchOrder.set(ref.name, branchOrder.size);
      tip.set(ref.name, tip.get(current) ?? null);
      current = ref.name; // Mermaid's `branch` creates and checks out in one step.
      continue;
    }

    const checkoutStmt = childNodes(sc, "checkoutStmt")[0];
    if (checkoutStmt !== undefined) {
      const ref = branchRefOf(checkoutStmt.children);
      if (ref === null) continue;
      if (!branchOrder.has(ref.name)) {
        return err(
          parseErrorAt(
            `gitGraph: checkout of unknown branch "${ref.name}"`,
            ref.token.startOffset,
            ref.token.image.length,
          ),
        );
      }
      current = ref.name;
      continue;
    }

    const mergeStmt = childNodes(sc, "mergeStmt")[0];
    if (mergeStmt !== undefined) {
      const ref = branchRefOf(mergeStmt.children);
      if (ref === null) continue;
      if (!branchOrder.has(ref.name)) {
        return err(
          parseErrorAt(
            `gitGraph: merge of unknown branch "${ref.name}"`,
            ref.token.startOffset,
            ref.token.image.length,
          ),
        );
      }
      if (ref.name === current) {
        return err(
          parseErrorAt(
            `gitGraph: cannot merge branch "${ref.name}" into itself`,
            ref.token.startOffset,
            ref.token.image.length,
          ),
        );
      }
      const opts = optsOf(mergeStmt.children);
      const minted = mintId(opts);
      if (!minted.ok) return err(minted.error);
      const currentTip = tip.get(current) ?? null;
      const mergedTip = tip.get(ref.name) ?? null;
      const parents = [currentTip, mergedTip].filter((p): p is GitCommitId => p !== null);
      commits.push({
        id: minted.value,
        branch: brand<string, "GitBranchName">(current),
        parents,
        tag: opts.tag,
        commitType: opts.commitType,
        merge: true,
      });
      tip.set(current, minted.value);
      if (opts.idSpan !== null) commitSpans.set(minted.value, opts.idSpan);
    }
  }

  const branches: GitBranch[] = [...branchOrder.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([name, order]) => ({ name: brand<string, "GitBranchName">(name), order }));

  return ok({
    ast: { kind: "gitGraph", direction, branches, commits },
    source: { commits: commitSpans },
  });
};

export const parseGitGraphWithSource = (text: string): Result<ParsedGitGraph, ParseError> => {
  const lexed = gitLexer.tokenize(text);
  if (lexed.errors.length > 0) {
    return err(lexingError(lexed.errors));
  }
  gitGraphParser.input = lexed.tokens;
  const cst = gitGraphParser.gitGraph();
  if (gitGraphParser.errors.length > 0) {
    return err(recognitionError(gitGraphParser.errors));
  }
  return buildResult(cst);
};

export const parseGitGraph = (text: string): Result<GitGraphAst, ParseError> =>
  map(parseGitGraphWithSource(text), (parsed) => parsed.ast);
