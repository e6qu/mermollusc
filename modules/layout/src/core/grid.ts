export interface GridCell<T> {
  readonly item: T;
  readonly x: number;
  readonly y: number;
}

export interface GridExtent {
  readonly width: number;
  readonly height: number;
}

export interface GridGeometry<T> {
  readonly positions: readonly GridCell<T>[];
  readonly extent: GridExtent;
}

// Row-major placement of `items` into a `columns`-wide grid of uniform cells: item `i` sits at column
// `i % columns`, row `floor(i / columns)`, with `gap` between cells on both axes. Returns each item
// paired with its cell's top-left corner (so callers iterate `positions` without re-indexing, keeping
// the read total) plus the overall extent — sized to the actually-used columns/rows, never below 1×1.
// Pure geometry only — callers brand the corners (`rect`/`point`), build SceneNodes, and style edges.
export const gridGeometry = <T>(
  items: readonly T[],
  columns: number,
  cellWidth: number,
  cellHeight: number,
  gap: number,
): GridGeometry<T> => {
  const positions: GridCell<T>[] = items.map((item, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    return { item, x: col * (cellWidth + gap), y: row * (cellHeight + gap) };
  });

  const count = items.length;
  const rows = Math.ceil(count / columns);
  const usedColumns = Math.min(columns, Math.max(1, count));
  const width = usedColumns * cellWidth + (usedColumns - 1) * gap;
  const height = Math.max(1, rows) * cellHeight + Math.max(0, rows - 1) * gap;
  return { positions, extent: { width, height } };
};
