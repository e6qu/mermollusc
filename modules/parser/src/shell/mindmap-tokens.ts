import { createToken, Lexer, type TokenType } from "chevrotain";

// Mindmaps are indentation-structured, which Chevrotain grammars don't model. Instead the lexer skips
// leading whitespace (so each line's first token carries a `startColumn` that *is* the indentation),
// captures the rest of the line as one `LineText`, and the CST→AST step rebuilds the tree from those
// columns. `LineText` deliberately matches a whole line of content; `mindmap`/newlines are separate.
const Comment = createToken({ name: "Comment", pattern: /%%[^\n]*/, group: Lexer.SKIPPED });
const WhiteSpace = createToken({ name: "WhiteSpace", pattern: /[ \t]+/, group: Lexer.SKIPPED });
const NewLine = createToken({ name: "NewLine", pattern: /\r?\n/, line_breaks: true });
const Mindmap = createToken({ name: "Mindmap", pattern: /mindmap\b/ });
const LineText = createToken({ name: "LineText", pattern: /[^\n]+/ });

const order: TokenType[] = [Comment, WhiteSpace, NewLine, Mindmap, LineText];

export const mindmapLexer = new Lexer(order);

export const MmTok = { NewLine, Mindmap, LineText };

export const mindmapAllTokens: TokenType[] = order;
