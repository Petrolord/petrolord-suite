/**
 * W1.2 global undo/redo core: LIFO order, redo lane cleared on push,
 * bounded history, failed commands stay put for retry, and the busy
 * guard against concurrent execution.
 */
import { UndoStack } from '@/pages/apps/Seismolord/lib/undoStack';

const cmd = (label, log) => ({
  label,
  undo: jest.fn(async () => log.push(`undo:${label}`)),
  redo: jest.fn(async () => log.push(`redo:${label}`)),
});

describe('UndoStack', () => {
  test('undo/redo run in LIFO order and move commands between lanes', async () => {
    const log = [];
    const s = new UndoStack();
    const a = cmd('a', log);
    const b = cmd('b', log);
    s.push(a);
    s.push(b);
    expect(s.peekUndo()).toBe('b');
    await s.undo();
    await s.undo();
    expect(log).toEqual(['undo:b', 'undo:a']);
    expect(s.canUndo).toBe(false);
    expect(s.peekRedo()).toBe('a');
    await s.redo();
    expect(log).toEqual(['undo:b', 'undo:a', 'redo:a']);
    expect(s.peekUndo()).toBe('a');
  });

  test('a new command clears the redo lane', async () => {
    const log = [];
    const s = new UndoStack();
    s.push(cmd('a', log));
    await s.undo();
    expect(s.canRedo).toBe(true);
    s.push(cmd('b', log));
    expect(s.canRedo).toBe(false);
  });

  test('history is bounded, oldest first out', () => {
    const s = new UndoStack(2);
    const log = [];
    s.push(cmd('a', log));
    s.push(cmd('b', log));
    s.push(cmd('c', log));
    expect(s.done.map((c) => c.label)).toEqual(['b', 'c']);
  });

  test('a failing undo stays on the stack for retry and rethrows', async () => {
    const s = new UndoStack();
    let fail = true;
    s.push({
      label: 'flaky',
      undo: async () => { if (fail) throw new Error('offline'); },
      redo: async () => {},
    });
    await expect(s.undo()).rejects.toThrow('offline');
    expect(s.canUndo).toBe(true);
    fail = false;
    await s.undo();
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(true);
  });

  test('busy guard: no reentrant execution while a command runs', async () => {
    const s = new UndoStack();
    let release;
    const gate = new Promise((r) => { release = r; });
    s.push({ label: 'slow', undo: () => gate, redo: async () => {} });
    const p = s.undo();
    expect(s.canUndo).toBe(false);          // busy
    expect(await s.undo()).toBeNull();      // second call refuses
    release();
    await p;
    expect(s.canRedo).toBe(true);
  });

  test('onChange fires on push, execution, and clear', async () => {
    const onChange = jest.fn();
    const s = new UndoStack(10, onChange);
    s.push(cmd('a', []));
    expect(onChange).toHaveBeenCalledTimes(1);
    await s.undo();
    expect(onChange).toHaveBeenCalledTimes(3);   // busy on + settle
    s.clear();
    expect(onChange).toHaveBeenCalledTimes(4);
    expect(s.canRedo).toBe(false);
  });

  test('malformed commands are refused', () => {
    const s = new UndoStack();
    expect(() => s.push({ label: 'x' })).toThrow(/undo\(\) and redo\(\)/);
  });
});
