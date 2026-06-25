import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { type Diagnostic, lintGutter, setDiagnostics } from "@codemirror/lint";
import { Annotation, Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

// A source range into the document, matching the parser's `ParseError.positions` shape.
export interface SourceRange {
  readonly offset: number;
  readonly length: number;
}

// The editor surface main.ts talks to — deliberately small, so the CodeMirror types never leak into
// the rest of the app and the textarea could be swapped back without touching call sites.
export interface Editor {
  value(): string;
  setValue(text: string): void;
  insertAtCursor(text: string): void;
  cursor(): number;
  select(from: number, to: number): void;
  focus(): void;
  hasFocus(): boolean;
  // Re-measure after the container's size changes while hidden (e.g. expanding the collapsed source
  // panel) — CodeMirror renders zero-height until it re-measures a display:none → visible transition.
  refresh(): void;
  setError(range: SourceRange | null, message: string): void;
  // Make the buffer non-editable (a collaborative viewer). Programmatic changes — incl. the remote
  // sync — still apply; only user keystrokes are blocked.
  setReadOnly(readOnly: boolean): void;
}

// Keywords across all six families. Highlighting a network/cloud node kind (`cloud`, `group`,
// `database`) as a keyword everywhere is harmless — these are reserved words in the grammars that use
// them, and a bare identifier that happens to collide just gets a keyword colour.
const KEYWORDS = new Set([
  "flowchart",
  "graph",
  "subgraph",
  "end",
  "direction",
  "TD",
  "TB",
  "BT",
  "RL",
  "LR",
  "sequenceDiagram",
  "participant",
  "actor",
  "as",
  "note",
  "over",
  "loop",
  "alt",
  "opt",
  "par",
  "C4Context",
  "C4Container",
  "C4Component",
  "Person",
  "Person_Ext",
  "System",
  "System_Ext",
  "SystemDb",
  "Container",
  "ContainerDb",
  "Component",
  "Boundary",
  "System_Boundary",
  "Container_Boundary",
  "Enterprise_Boundary",
  "Rel",
  "BiRel",
  "block-beta",
  "columns",
  "network",
  "cloud",
  "group",
  "router",
  "server",
  "switch",
  "firewall",
  "host",
  "database",
  "compute",
  "storage",
  "queue",
  "cdn",
]);

const ARROW = /^(?:-\.->|-->>|==>|-->|->>|---|->|--)/;
const IDENT = /^[A-Za-z_][\w-]*/;

// A lightweight stream tokenizer — enough to colour headers, links, strings, comments, and brackets
// without re-implementing each family's full grammar (the parsers own correctness; this is colour).
const mermaidLanguage = StreamLanguage.define<Record<string, never>>({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match("%%")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return "string";
    if (stream.match(ARROW)) return "operator";
    const ch = stream.peek();
    if (ch !== undefined && "[]{}()|".includes(ch)) {
      stream.next();
      return "bracket";
    }
    const word = stream.match(IDENT);
    if (word !== null && typeof word !== "boolean") {
      const text = word[0];
      return text !== undefined && KEYWORDS.has(text) ? "keyword" : null;
    }
    stream.next();
    return null;
  },
  tokenTable: {
    keyword: tags.keyword,
    string: tags.string,
    comment: tags.lineComment,
    operator: tags.operator,
    bracket: tags.bracket,
  },
});

// Colours are CSS variables so the existing light/dark `data-theme` switch drives them — no need to
// rebuild the editor when the theme toggles.
const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--cm-keyword)", fontWeight: "600" },
  { tag: tags.string, color: "var(--cm-string)" },
  { tag: tags.lineComment, color: "var(--cm-comment)", fontStyle: "italic" },
  { tag: tags.operator, color: "var(--cm-operator)" },
  { tag: tags.bracket, color: "var(--cm-bracket)" },
]);

const appTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px", backgroundColor: "var(--surface)", color: "var(--ink)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.7", overflow: "auto" },
  ".cm-content": { padding: "14px 0", caretColor: "var(--primary)" },
  ".cm-gutters": {
    backgroundColor: "var(--surface)",
    color: "var(--ink-soft)",
    border: "none",
    paddingRight: "4px",
  },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--primary) 6%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--ink)" },
  ".cm-cursor": { borderLeftColor: "var(--primary)" },
});

// Marks a transaction as programmatic (a structural edit, an example load, a share-link), so the
// change listener can tell it apart from the user typing and not re-fire the render-from-text path.
const programmatic = Annotation.define<boolean>();

declare global {
  interface Window {
    // An e2e hook: reading/writing the document through CodeMirror's own state is robust, whereas
    // `.fill()`/`toHaveValue()` only work on a real <textarea>. Set once the editor mounts.
    __editor?: { value(): string; setValue(text: string): void };
  }
}

export const createEditor = (
  parent: HTMLElement,
  initial: string,
  onUserChange: (value: string) => void,
  // `extra` are appended extensions (the `@m/collab` source binding, in collab mode). When that binding
  // is present it owns text undo/redo (per-user, via Yjs), so `textHistory` is set false to drop
  // CodeMirror's own history — otherwise the two undo stacks fight over ⌘Z.
  opts: { extra?: readonly Extension[]; textHistory?: boolean } = {},
): Editor => {
  const textHistory = opts.textHistory ?? true;
  // A compartment so editability can be toggled later (a collaborative viewer is read-only).
  const editable = new Compartment();
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: initial,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        ...(textHistory ? [history()] : []),
        drawSelection(),
        EditorView.lineWrapping,
        keymap.of([...defaultKeymap, ...(textHistory ? historyKeymap : [])]),
        syntaxHighlighting(highlight),
        mermaidLanguage,
        lintGutter(),
        appTheme,
        // Name the editable surface for screen readers — without this the CodeMirror content is an
        // unlabelled textbox.
        EditorView.contentAttributes.of({ "aria-label": "Diagram source" }),
        editable.of(EditorView.editable.of(true)),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const isProgrammatic = update.transactions.some(
            (t) => t.annotation(programmatic) === true,
          );
          if (!isProgrammatic) onUserChange(view.state.doc.toString());
        }),
        ...(opts.extra ?? []),
      ],
    }),
  });

  const replaceDoc = (text: string, programmaticChange: boolean): void => {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      annotations: programmaticChange ? [programmatic.of(true)] : [],
    });
  };
  const setValue = (text: string): void => replaceDoc(text, true);

  const editor: Editor = {
    value: () => view.state.doc.toString(),
    setValue,
    insertAtCursor: (text) => {
      const at = view.state.selection.main.head;
      view.dispatch({
        changes: { from: at, insert: text },
        selection: { anchor: at + text.length },
        annotations: programmatic.of(true),
      });
    },
    cursor: () => view.state.selection.main.head,
    select: (from, to) => {
      view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
    },
    focus: () => view.focus(),
    hasFocus: () => view.hasFocus,
    refresh: () => view.requestMeasure(),
    setError: (range, message) => {
      // Clamp to a non-empty span strictly inside the doc — `from ∈ [0, len-1]`, `to ∈ [from+1, len]`.
      // A diagnostic range that's empty, out of bounds, or non-finite makes CodeMirror's lint throw,
      // so mark nothing when there's nothing valid to mark (an empty doc, or an un-located/EOF error).
      const len = view.state.doc.length;
      const diagnostics: Diagnostic[] = [];
      if (
        range !== null &&
        len > 0 &&
        Number.isFinite(range.offset) &&
        Number.isFinite(range.length)
      ) {
        const from = Math.min(Math.max(range.offset, 0), len - 1);
        const to = Math.min(Math.max(range.offset + range.length, from + 1), len);
        diagnostics.push({ from, to, severity: "error", message });
      }
      view.dispatch(setDiagnostics(view.state, diagnostics));
    },
    setReadOnly: (readOnly) => {
      view.dispatch({ effects: editable.reconfigure(EditorView.editable.of(!readOnly)) });
    },
  };

  // The e2e hook's `setValue` emulates a user edit (non-programmatic, so the change listener fires and
  // the diagram re-renders) — matching how a spec's old `textarea.fill()` drove an `input` event.
  window.__editor = { value: editor.value, setValue: (text) => replaceDoc(text, false) };
  return editor;
};
