/**
 * Group 5 horizon edit undo/redo: a whole paint stroke is ONE undo op
 * (it used to be one op per pointer move, so a drag burned the 40-op cap),
 * and undone ops can be redone exactly.
 */
import { EditHistory } from '@/pages/apps/Seismolord/lib/horizonEditHistory';
import { NULL_VALUE } from '@/pages/apps/Seismolord/engine/manifest';

const NUL = Math.fround(NULL_VALUE);
const blank = (n) => new Float32Array(n).fill(NUL);

describe('EditHistory', () => {
  test('a stroke of many pointer moves is one undo op, and redo restores it', () => {
    const h = new EditHistory(40);
    let g = blank(100);
    // a drag across 30 traces, several moves re-painting the same cells
    for (let tr = 0; tr < 30; tr++) h.apply(g, [tr], [50 + tr * 0.5], { stroke: true });
    h.apply(g, [5, 6], [70, 71], { stroke: true });
    h.close();
    expect(h.undoCount).toBe(1);
    const painted = new Float32Array(g);

    g = h.undo(g);
    expect(h.undoCount).toBe(0);
    expect(h.redoCount).toBe(1);
    expect(Array.from(g)).toEqual(Array.from(blank(100)));   // first old value wins

    g = h.redo(g);
    expect(Array.from(g)).toEqual(Array.from(painted));
    expect(h.undoCount).toBe(1);
    expect(h.redoCount).toBe(0);
  });

  test('strokes separated by close() stay separate ops', () => {
    const h = new EditHistory();
    let g = blank(10);
    h.apply(g, [1], [5], { stroke: true });
    h.close();
    h.apply(g, [2], [6], { stroke: true });
    h.close();
    expect(h.undoCount).toBe(2);
    g = h.undo(g);
    expect(g[2]).toBe(NUL);
    expect(g[1]).toBe(5);
  });

  test('an open stroke counts and is closed by undo', () => {
    const h = new EditHistory();
    let g = blank(4);
    h.apply(g, [0, 1], [3, 4], { stroke: true });
    expect(h.undoCount).toBe(1);
    expect(h.dirty).toBe(true);
    g = h.undo(g);
    expect(g[0]).toBe(NUL);
    expect(h.dirty).toBe(false);
  });

  test('a new edit clears the redo lane; no-op writes record nothing', () => {
    const h = new EditHistory();
    let g = blank(4);
    h.apply(g, [0], [1]);
    g = h.undo(g);
    expect(h.redoCount).toBe(1);
    expect(h.apply(g, [3], [NUL])).toBe(0);            // unchanged cell
    expect(h.redoCount).toBe(1);
    h.apply(g, [2], [9]);
    expect(h.redoCount).toBe(0);
    expect(h.redo(g)).toBeNull();
  });

  test('erase after pick: undo steps back one operation at a time', () => {
    const h = new EditHistory();
    let g = blank(6);
    h.apply(g, [0, 1, 2, 3], [10, 11, 12, 13]);         // e.g. a 2D track
    h.apply(g, [1, 2], [NULL_VALUE, NULL_VALUE], { stroke: true });  // eraser drag
    h.apply(g, [3], [NULL_VALUE], { stroke: true });
    h.close();
    expect(h.undoCount).toBe(2);
    g = h.undo(g);
    expect(Array.from(g.slice(0, 4))).toEqual([10, 11, 12, 13]);
    g = h.undo(g);
    expect(Array.from(g.slice(0, 4))).toEqual([NUL, NUL, NUL, NUL]);
    g = h.redo(g);
    g = h.redo(g);
    expect(Array.from(g.slice(0, 4))).toEqual([10, NUL, NUL, NUL]);
  });

  test('history is bounded', () => {
    const h = new EditHistory(3);
    const g = blank(10);
    for (let i = 0; i < 5; i++) h.apply(g, [i], [i + 1]);
    expect(h.undoCount).toBe(3);
  });
});

describe('horizon write undo commands (Save, Track 3D, Grow)', () => {
  // eslint-disable-next-line global-require
  const { createdHorizonCommand, rewriteHorizonCommand } = require('@/pages/apps/Seismolord/lib/horizonUndoCommands');
  const { UndoStack } = require('@/pages/apps/Seismolord/lib/undoStack');

  test('Track 3D / new-horizon Save: undo deletes the row, redo re-creates and tracks the new id', async () => {
    const removed = [];
    let n = 1;
    const stack = new UndoStack();
    const cmd = createdHorizonCommand({
      label: 'track horizon "H1"',
      row: { id: 'h-1' },
      remove: async (r) => { removed.push(r.id); },
      create: async () => ({ id: `h-${++n}` }),
    });
    stack.push(cmd);
    await stack.undo();
    expect(removed).toEqual(['h-1']);
    await stack.redo();
    expect(cmd.box.row.id).toBe('h-2');
    await stack.undo();
    expect(removed).toEqual(['h-1', 'h-2']);   // the RE-created row, not the stale id
  });

  test('Grow / edited Save: undo writes the prior picks and confidence into the same row', async () => {
    const writes = [];
    const before = new Float32Array([1, 2]);
    const after = new Float32Array([1, 2.5]);
    const prevConf = new Float32Array([0.9, 0.9]);
    const nextConf = new Float32Array([0.8, 0.7]);
    const stack = new UndoStack();
    stack.push(rewriteHorizonCommand({
      label: 'grow horizon "H1"',
      before,
      after,
      prevParams: { source: 'track3d' },
      prevConfidence: prevConf,
      nextConfidence: nextConf,
      write: async (...args) => { writes.push(args); },
    }));
    await stack.undo();
    expect(writes[0]).toEqual([before, { source: 'track3d' }, prevConf]);
    await stack.redo();
    expect(writes[1]).toEqual([after, null, nextConf]);
  });
});
