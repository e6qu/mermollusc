# @m/app (playground) — plan

The web app that wires the full pipeline (parser → layout → renderer → builder) to an HTML
canvas, and hosts the e2e / golden tests.

## Responsibility

- Mount the builder onto a canvas; provide the text editor and the diagram surface.
- Own end-to-end tests: text → pixels snapshots, and text → edit → text round-trips.
- Feature-detect HTML-in-Canvas (`drawElement`) and select the renderer backend.

## Public API (stable surface)

None — this is the top of the DAG. It depends on `@m/builder` only.
