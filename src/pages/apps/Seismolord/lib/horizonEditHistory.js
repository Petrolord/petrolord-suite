// Cell-level undo AND redo for the horizon edit session (group 5).
//
// The session edits a WORKING grid (Float32Array, 1e30 nulls) in place
// while a paint stroke runs. Before this module every pointer move of a
// stroke pushed its own op, so one drag could burn the whole 40-op cap
// and undo stepped back one trace at a time; there was no redo at all.
//
// Now a stroke is ONE op: `apply(..., {stroke: true})` merges into the
// open op (the first old value of a cell wins, so undo restores the
// pre-stroke value) until `close()` (pointer up, commitStroke). One-shot
// ops (2D track, smooth, fill holes, region erase) close immediately.
// Undo moves an op to the redo lane carrying the values it replaced, so
// redo restores them exactly; any new edit clears the redo lane.

/** @typedef {{cells: Int32Array, old: Float32Array, next?: Float32Array}} EditOp */

export class EditHistory {
  /** @param {number} [limit] oldest ops drop beyond this */
  constructor(limit = 40) {
    this.limit = limit;
    /** @type {EditOp[]} */
    this.done = [];
    /** @type {EditOp[]} */
    this.undone = [];
    /** open stroke: parallel arrays + cell -> slot index */
    this.open = null;
  }

  /** Ops available to undo (an open stroke counts as one). */
  get undoCount() { return this.done.length + (this.open ? 1 : 0); }

  get redoCount() { return this.undone.length; }

  /** Anything unsaved in the session history. */
  get dirty() { return this.undoCount > 0; }

  /**
   * Write `values` into `grid` at `cells` (mutates grid), recording the
   * replaced values. Unchanged cells are skipped.
   * @param {Float32Array} grid
   * @param {ArrayLike<number>} cells
   * @param {ArrayLike<number>} values
   * @param {{stroke?: boolean}} [opts] stroke: merge into the open op
   * @returns {number} cells actually changed
   */
  apply(grid, cells, values, { stroke = false } = {}) {
    if (!stroke) this.close();
    let op = this.open;
    let changed = 0;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const next = Math.fround(values[i]);
      if (grid[c] === next) continue;
      if (!op) {
        op = { cells: [], old: [], slot: new Map() };
        this.open = op;
      }
      if (!op.slot.has(c)) {
        op.slot.set(c, op.cells.length);
        op.cells.push(c);
        op.old.push(grid[c]);
      }
      grid[c] = next;
      changed += 1;
    }
    if (changed) this.undone = [];
    if (!stroke) this.close();
    return changed;
  }

  /** Finalise the open stroke (no-op when none). */
  close() {
    const op = this.open;
    this.open = null;
    if (!op || !op.cells.length) return;
    this.done.push({ cells: Int32Array.from(op.cells), old: Float32Array.from(op.old) });
    if (this.done.length > this.limit) this.done.shift();
  }

  /**
   * Undo the latest op against `grid`.
   * @param {Float32Array} grid current working grid (not mutated)
   * @returns {?Float32Array} a NEW grid (callers swap references so the
   *   3D and map caches rebuild), or null when there is nothing to undo
   */
  undo(grid) {
    this.close();
    const op = this.done.pop();
    if (!op) return null;
    const g = new Float32Array(grid);
    const next = new Float32Array(op.cells.length);
    for (let i = 0; i < op.cells.length; i++) {
      next[i] = g[op.cells[i]];
      g[op.cells[i]] = op.old[i];
    }
    this.undone.push({ cells: op.cells, old: op.old, next });
    return g;
  }

  /** Redo the latest undone op; same contract as undo(). */
  redo(grid) {
    this.close();
    const op = this.undone.pop();
    if (!op) return null;
    const g = new Float32Array(grid);
    for (let i = 0; i < op.cells.length; i++) g[op.cells[i]] = op.next[i];
    this.done.push({ cells: op.cells, old: op.old });
    return g;
  }
}
