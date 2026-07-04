// Lexer patterns for Mermaid's styling directives, shared by every family's lexer (flowchart, state, …)
// so the compliance rules live in ONE place: each is matched as a WHOLE line up to a `;` statement
// separator (`[^\n;]*`), the property list isn't sub-tokenised, and the required keyword+targets+property
// structure keeps a directive from swallowing a node ref that merely starts with the word. Class names
// allow `-`. The inline `id:::className` shorthand is a separate token (the `:::` is unambiguous).

export const STYLE_STMT = /style[ \t]+[A-Za-z0-9_,]+[ \t]+[A-Za-z-]+:[^\n;]*/;
export const CLASSDEF_STMT = /classDef[ \t]+[A-Za-z0-9_,-]+[ \t]+[A-Za-z-]+:[^\n;]*/;
export const CLASS_STMT = /class[ \t]+[A-Za-z0-9_,]+[ \t]+[A-Za-z0-9_-]+[ \t]*/;
export const LINKSTYLE_STMT =
  /linkStyle[ \t]+(?:default|\d+(?:[ \t]*,[ \t]*\d+)*)[ \t]+[A-Za-z-]+:[^\n;]*/;
export const CLASS_SHORTHAND = /:::[A-Za-z0-9_-]+/;
