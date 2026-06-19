# @m/builder — bugs

Open (external review, codex `gpt-5.5`, 2026-06-19):

- **Deleting a brace-bodied entity orphans its body.** The app's `removeNode` falls through to the
  line-based `deleteNode` for ER/class/requirement (and composite state); for `CUSTOMER { … }` /
  `class Animal { … }` / `requirement r { … }` that strips only the id line and leaves the `{ … }`
  rows + closing `}`, corrupting the source. Needs family entity-delete that removes the whole brace
  block plus incident relationship lines. *(P1; ER/class/requirement fixed here, composite state still
  open.)*
- **Drag/resize extent only grows right/down** (`src/core/overrides.ts` `applyOverrides`). A node moved
  past `x=0`/`y=0` keeps negative coords; `paintScene` draws origin-anchored, so it's clipped/
  unreachable. Normalize the displayed origin (and update hit-test/export/minimap). *(P1, open.)*

Checked while adding family-specific C4 and sequence delete patchers.

Checked while adding sidecar group labels.

Checked while adding resizeNode (manual node sizing).

Checked while adding pruneGroups (drop groups whose nodes the text removed).

Checked while adding the ER connect/delete patchers.
