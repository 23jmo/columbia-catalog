/**
 * Layered layout for the prerequisite map.
 *
 * React Flow positions nodes exactly where it is told and computes nothing, so
 * the layout is ours to produce. A general graph layout library would be the
 * obvious reach, but a prerequisite graph is not a general graph: it is a DAG
 * whose natural x-axis is already computed. `ProgressionGraph.depth` is the
 * longest prerequisite chain ending at a course, which means a course always
 * lands right of everything it needs — the one property the drawing must have.
 *
 * That leaves only vertical ordering inside each column, which is the classic
 * crossing-minimisation problem. Two barycenter sweeps get close enough that
 * the remaining crossings are the ones inherent to the data, and it stays pure,
 * synchronous and testable, which a layout worker would not.
 *
 * ── Wrapping, and why it is not optional ────────────────────────────────────
 *
 * Layered layouts assume columns are roughly balanced. A prerequisite graph is
 * the opposite shape: COMS W3134 is a prerequisite of sixteen courses, so its
 * successor column is a 1,700px stack while its neighbours hold one node each.
 * Fitting that into a 620px canvas zooms every card down to unreadable — one
 * column dictating the legibility of the whole map.
 *
 * So a column taller than `MAX_ROWS_PER_COLUMN` wraps into lanes: a sub-grid
 * at the same depth. The layering semantics are untouched (every node in the
 * band still sits right of everything it needs) and the tallest column drops
 * from sixteen rows to seven.
 */

export interface LayoutInput {
  courseIds: readonly string[];
  edges: readonly { from: string; to: string }[];
  depthOf: (courseId: string) => number;
}

export interface LayoutNode {
  courseId: string;
  x: number;
  y: number;
  column: number;
  /** Index within the column, top to bottom. */
  row: number;
  /** Sub-column within a wrapped band. 0 unless the column overflowed. */
  lane: number;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  /** Column index → the courses in it, in final vertical order. */
  columns: string[][];
  width: number;
  height: number;
}

/**
 * Node geometry. The map reads as columns of cards, so the horizontal gap is
 * generous (edges need room to be followed) and the vertical gap is tight.
 */
export const NODE_WIDTH = 184;
export const NODE_HEIGHT = 78;
const COLUMN_GAP = 88;
const ROW_GAP = 20;
/** Lanes of one wrapped column sit closer together than separate columns do. */
const LANE_GAP = 20;

/**
 * The tallest a column may get before it wraps into lanes.
 *
 * Deliberately generous. Wrapping trades height for width, and on this canvas
 * those are not equally priced: it is about 780px wide and 660px tall, so it
 * holds four node-widths but eight node-heights. Height is the cheap axis.
 * Wrapping a column of fourteen into three lanes costs 200px of width — and
 * width is what sets the zoom — to save height nothing was competing for.
 * Eight rows keeps the common fan-outs at two lanes.
 */
export const MAX_ROWS_PER_COLUMN = 8;

const SWEEPS = 2;

export function layoutGraph(input: LayoutInput): LayoutResult {
  const present = new Set(input.courseIds);
  const edges = input.edges.filter((edge) => present.has(edge.from) && present.has(edge.to));

  // Normalize columns so the leftmost course in *this subgraph* sits at 0 —
  // a neighbourhood two hops downstream of an intro course would otherwise
  // start at column 3 and render with a wide empty gutter.
  const rawDepth = new Map(input.courseIds.map((id) => [id, input.depthOf(id)]));
  const minDepth = Math.min(...rawDepth.values(), 0);

  const columns: string[][] = [];
  for (const courseId of input.courseIds) {
    const column = (rawDepth.get(courseId) ?? 0) - minDepth;
    while (columns.length <= column) columns.push([]);
    columns[column].push(courseId);
  }

  // A stable starting order matters: barycenter refines an ordering, it does
  // not create one, and an unstable seed makes the map jump between renders.
  for (const column of columns) column.sort((a, b) => a.localeCompare(b));

  const predecessors = adjacency(edges, (edge) => edge.to, (edge) => edge.from);
  const successors = adjacency(edges, (edge) => edge.from, (edge) => edge.to);

  for (let sweep = 0; sweep < SWEEPS; sweep += 1) {
    // Forward: settle each column against the one to its left.
    for (let index = 1; index < columns.length; index += 1) {
      orderByBarycenter(columns[index], columns[index - 1], predecessors);
    }
    // Backward: and again against the one to its right.
    for (let index = columns.length - 2; index >= 0; index -= 1) {
      orderByBarycenter(columns[index], columns[index + 1], successors);
    }
  }

  // Rows per lane is computed from the lane count rather than fixed at the
  // maximum, so a column of eight wraps to 4+4 rather than 7+1.
  const shape = columns.map((column) => {
    const lanes = Math.max(1, Math.ceil(column.length / MAX_ROWS_PER_COLUMN));
    return { lanes, rowsPerLane: Math.max(1, Math.ceil(column.length / lanes)) };
  });

  const tallestRows = Math.max(1, ...shape.map((entry) => entry.rowsPerLane));
  const height = tallestRows * NODE_HEIGHT + (tallestRows - 1) * ROW_GAP;

  const nodes: LayoutNode[] = [];
  let x = 0;

  columns.forEach((column, columnIndex) => {
    const { rowsPerLane } = shape[columnIndex];
    const columnRows = Math.min(column.length, rowsPerLane);
    const columnHeight = columnRows * NODE_HEIGHT + (columnRows - 1) * ROW_GAP;
    // Columns are centered against the tallest one so the map reads as a band
    // rather than a staircase hanging off the top edge.
    const offset = (height - columnHeight) / 2;

    column.forEach((courseId, index) => {
      const lane = Math.floor(index / rowsPerLane);
      const rowIndex = index % rowsPerLane;
      nodes.push({
        courseId,
        column: columnIndex,
        row: rowIndex,
        lane,
        x: x + lane * (NODE_WIDTH + LANE_GAP),
        y: offset + rowIndex * (NODE_HEIGHT + ROW_GAP),
      });
    });

    const bandWidth =
      shape[columnIndex].lanes * NODE_WIDTH + (shape[columnIndex].lanes - 1) * LANE_GAP;
    x += bandWidth + COLUMN_GAP;
  });

  return {
    nodes,
    columns,
    width: Math.max(0, x - COLUMN_GAP),
    height,
  };
}

function adjacency<T extends { from: string; to: string }>(
  edges: readonly T[],
  keyOf: (edge: T) => string,
  valueOf: (edge: T) => string,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const edge of edges) {
    const key = keyOf(edge);
    const bucket = out.get(key);
    if (bucket) bucket.push(valueOf(edge));
    else out.set(key, [valueOf(edge)]);
  }
  return out;
}

/**
 * Reorder `column` so each node sits at the average height of its neighbours
 * in `reference`. Nodes with no neighbour there keep their current position
 * rather than collapsing to the top, which is what stops isolated courses from
 * piling up in one corner.
 */
function orderByBarycenter(
  column: string[],
  reference: readonly string[],
  neighboursOf: ReadonlyMap<string, string[]>,
): void {
  const referenceIndex = new Map(reference.map((id, index) => [id, index]));
  const currentIndex = new Map(column.map((id, index) => [id, index]));

  const scored = column.map((courseId) => {
    const neighbours = (neighboursOf.get(courseId) ?? [])
      .map((id) => referenceIndex.get(id))
      .filter((index): index is number => index !== undefined);

    const barycenter =
      neighbours.length > 0
        ? neighbours.reduce((sum, index) => sum + index, 0) / neighbours.length
        : (currentIndex.get(courseId) as number);

    return { courseId, barycenter };
  });

  scored.sort(
    (a, b) =>
      a.barycenter - b.barycenter ||
      (currentIndex.get(a.courseId) as number) - (currentIndex.get(b.courseId) as number),
  );
  scored.forEach((entry, index) => {
    column[index] = entry.courseId;
  });
}
