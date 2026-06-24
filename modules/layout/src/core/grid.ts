export interface GridCell<T> {
  readonly item: T;
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly w: number;
  readonly h: number;
}

// Place items (given their intrinsic sizes) into a `columns`-wide *variable* grid: each column takes
// the widest item in it, each row the tallest — so an item bigger than a uniform cell (a nested
// composite/group) fits without overlapping. Uniform sizes degenerate to a fixed grid. Returns each
// cell's top-left + the content extent. Shared by the block + network nested layouts.
export const variableGrid = (
  sizes: readonly Size[],
  columns: number,
  gap: number,
): {
  readonly cells: readonly { x: number; y: number }[];
  readonly width: number;
  readonly height: number;
} => {
  const cols = Math.max(1, columns);
  const rows = Math.max(1, Math.ceil(sizes.length / cols));
  const colW = new Array<number>(cols).fill(0);
  const rowH = new Array<number>(rows).fill(0);
  sizes.forEach((s, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    colW[c] = Math.max(colW[c] ?? 0, s.w);
    rowH[r] = Math.max(rowH[r] ?? 0, s.h);
  });
  const colX: number[] = [];
  let x = 0;
  for (let c = 0; c < cols; c++) {
    colX.push(x);
    x += (colW[c] ?? 0) + gap;
  }
  const rowY: number[] = [];
  let y = 0;
  for (let r = 0; r < rows; r++) {
    rowY.push(y);
    y += (rowH[r] ?? 0) + gap;
  }
  const cells = sizes.map((_, i) => ({
    x: colX[i % cols] ?? 0,
    y: rowY[Math.floor(i / cols)] ?? 0,
  }));
  const usedCols = Math.min(cols, Math.max(1, sizes.length));
  const width =
    colW.slice(0, usedCols).reduce((a, b) => a + b, 0) + Math.max(0, usedCols - 1) * gap;
  const height = rowH.reduce((a, b) => a + b, 0) + Math.max(0, rows - 1) * gap;
  return { cells, width, height };
};

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
