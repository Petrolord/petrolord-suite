/**
 * Group 5 fault stick operations (lib/faultStickEdit) and the owner's
 * required case: "a fault shortened and erased, then undone".
 */
import {
  nearestNode, nearestStick, extendStick, moveNode, deleteNode, deleteStick,
  shortenStick, trimStickAt, newStick, savableSticks,
} from '@/pages/apps/Seismolord/lib/faultStickEdit';
import { UndoStack } from '@/pages/apps/Seismolord/lib/undoStack';

// two sticks on inline 10, picked top-down; a third on inline 14
const P = (xl, s, il = 10) => ({ il, xl, s });
const fault = () => [
  [P(20, 100), P(21, 120), P(22, 140), P(23, 160)],
  [P(40, 90), P(41, 130)],
  [P(20, 100, 14), P(22, 150, 14)],
];
const pick = (xl, sample, il = 10) => ({ ilIdx: il, xlIdx: xl, sample });

describe('faultStickEdit (pure)', () => {
  test('operations never mutate their input', () => {
    const f = fault();
    const snap = JSON.stringify(f);
    extendStick(f, 0, P(19, 80), 'inline');
    moveNode(f, 0, 1, P(21, 125));
    deleteNode(f, 0, 1);
    deleteStick(f, 1);
    shortenStick(f, 0, 'top');
    trimStickAt(f, 0, 2);
    newStick(f);
    expect(JSON.stringify(f)).toBe(snap);
  });

  test('extend adds at the NEARER end (picking above the top grows the top)', () => {
    const f = fault();
    const above = extendStick(f, 0, P(19, 80), 'inline');
    expect(above[0][0]).toEqual(P(19, 80));
    expect(above[0]).toHaveLength(5);
    const below = extendStick(f, 0, P(24, 180), 'inline');
    expect(below[0][4]).toEqual(P(24, 180));
    // one-point stick: ordered by time
    expect(extendStick([[P(5, 100)]], 0, P(5, 60))[0]).toEqual([P(5, 60), P(5, 100)]);
    // an empty (new) stick takes the point; no sticks at all makes one
    expect(extendStick([[]], 0, P(1, 1))).toEqual([[P(1, 1)]]);
    expect(extendStick([], 0, P(1, 1))).toEqual([[P(1, 1)]]);
  });

  test('nearest node and nearest stick only see the displayed section', () => {
    const f = fault();
    expect(nearestNode(f, pick(21, 121), { axis: 'inline' })).toMatchObject({ si: 0, pi: 1 });
    // same xl/sample but four inlines away: not on this section
    expect(nearestNode(f, pick(20, 100, 14), { axis: 'inline' })).toMatchObject({ si: 2, pi: 0 });
    expect(nearestNode(f, pick(80, 500), { axis: 'inline' })).toBeNull();
    // a click on the middle of a segment finds its stick
    expect(nearestStick(f, pick(40, 110), { axis: 'inline' })).toBe(1);
    expect(nearestStick(f, pick(90, 10), { axis: 'inline' })).toBe(-1);
  });

  test('move, delete node, delete stick', () => {
    const f = fault();
    expect(moveNode(f, 0, 1, P(21, 125))[0][1]).toEqual(P(21, 125));
    expect(deleteNode(f, 1, 0)[1]).toEqual([P(41, 130)]);
    // deleting the last node of a stick removes the stick
    expect(deleteNode([[P(1, 1)], [P(2, 2)]], 0, 0)).toEqual([[P(2, 2)]]);
    expect(deleteStick(f, 1)).toHaveLength(2);
  });

  test('shorten trims the top or the bottom by time, whatever the pick order', () => {
    const f = fault();
    expect(shortenStick(f, 0, 'top')[0][0]).toEqual(P(21, 120));
    expect(shortenStick(f, 0, 'bottom')[0]).toHaveLength(3);
    const bottomUp = [[P(1, 200), P(1, 150), P(1, 100)]];
    expect(shortenStick(bottomUp, 0, 'top')[0]).toEqual([P(1, 200), P(1, 150)]);
    expect(shortenStick([[P(1, 1)]], 0, 'top')).toEqual([]);
  });

  test('trim at a node removes it and the part toward the nearer end', () => {
    const f = fault();
    expect(trimStickAt(f, 0, 3)[0]).toEqual([P(20, 100), P(21, 120), P(22, 140)]);
    expect(trimStickAt(f, 0, 1)[0]).toEqual([P(22, 140), P(23, 160)]);
    const odd = [[P(1, 100), P(1, 120), P(1, 140)]];
    expect(trimStickAt(odd, 0, 1, 110)[0]).toEqual([P(1, 140)]);   // click above: top part goes
    expect(trimStickAt(odd, 0, 1, 130)[0]).toEqual([P(1, 100)]);
  });

  test('new stick and the save shape', () => {
    expect(newStick([[P(1, 1)]])).toEqual([[P(1, 1)], []]);
    expect(newStick([[P(1, 1)], []])).toEqual([[P(1, 1)], []]);
    expect(savableSticks([[P(1, 1)], [P(1, 1), P(1, 2)], []])).toEqual([{ points: [P(1, 1), P(1, 2)] }]);
  });
});

test('a fault shortened and erased, then undone (stick ops on the undo stack)', async () => {
  let draft = fault();
  const original = JSON.stringify(draft);
  const set = (d) => { draft = d; };
  const stack = new UndoStack();
  const apply = (label, next) => {
    const prev = draft;
    set(next);
    stack.push({ label, undo: () => set(prev), redo: () => set(next) });
  };

  apply('shorten', trimStickAt(draft, 0, 3));               // shorten the long stick
  apply('shorten', shortenStick(draft, 0, 'top'));          // and trim its top
  apply('delete point', deleteNode(draft, 1, 1));           // erase a point
  apply('delete stick', deleteStick(draft, 2));             // erase a stick
  expect(draft).toEqual([[P(21, 120), P(22, 140)], [P(40, 90)]]);

  await stack.undo();
  await stack.undo();
  expect(draft).toHaveLength(3);
  expect(draft[0]).toEqual([P(21, 120), P(22, 140)]);
  await stack.undo();
  await stack.undo();
  expect(JSON.stringify(draft)).toBe(original);
  // and redo replays it
  await stack.redo();
  await stack.redo();
  await stack.redo();
  await stack.redo();
  expect(draft).toEqual([[P(21, 120), P(22, 140)], [P(40, 90)]]);
});
