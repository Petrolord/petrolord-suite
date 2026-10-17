// usePendingSave (Guided Journey design 6.4): the autosave that never drops an
// edit. The 31 studio contexts and Fluid Studio saved 10 s after the last edit
// with a timer cleared on unmount, so leaving sooner lost the edit while the
// header said "Saved" (found 2026-10-09). The negative control at the end runs
// that old pattern and shows the edit is lost; the same steps with the hook
// keep it.
import { useEffect, useState } from 'react';
import { renderHook, act } from '@testing-library/react';
import { usePendingSave, payloadPrint } from '../usePendingSave';
import { getActivity, resetActivity, leaveVerdict } from '../activity';

const HREF = '/dashboard/apps/production/test-studio';

/** A studio in miniature: one input, a project id, and the context's save state. */
function useStudio({ save, canWrite = true, initial = 1, delayMs = 10000 }) {
  const [value, setValue] = useState(initial);
  const [projectKey, setProjectKey] = useState('p1');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const ps = usePendingSave({
    appId: 'test-studio',
    appName: 'Test Studio',
    href: HREF,
    projectName: 'Alpha',
    projectKey,
    canWrite,
    changeKey: [value],
    payload: () => ({ id: projectKey, value, modified: new Date().toISOString() }),
    save: async (payload) => {
      setIsSaving(true);
      try {
        const res = await save(payload);
        if (res !== false) setLastSaveTime(new Date());
        return res;
      } finally {
        setIsSaving(false);
      }
    },
    saving: isSaving,
    savedAt: lastSaveTime,
    delayMs,
  });
  return { ...ps, value, setValue, setProjectKey, setIsSaving, setLastSaveTime };
}

const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

let store;
let save;
beforeEach(() => {
  jest.useFakeTimers();
  resetActivity();
  store = new Map();
  save = jest.fn(async (p) => { store.set(p.id, p.value); return true; });
});
afterEach(() => { jest.useRealTimers(); });

test('the print ignores the modified stamp', () => {
  expect(payloadPrint({ a: 1, modified: 'x' })).toBe(payloadPrint({ a: 1, modified: 'y' }));
  expect(payloadPrint({ a: 1 })).not.toBe(payloadPrint({ a: 2 }));
});

test('opening a project is not an edit: nothing to save, no Activity item', async () => {
  const view = renderHook(() => useStudio({ save }));
  expect(view.result.current.dirty).toBe(false);
  await act(async () => { jest.advanceTimersByTime(20000); });
  expect(save).not.toHaveBeenCalled();
  expect(getActivity()).toEqual([]);
  view.unmount();
  await settle();
  expect(save).not.toHaveBeenCalled();
});

test('debounce: the save runs once, delayMs after the last edit, and the project is clean after', async () => {
  const view = renderHook(() => useStudio({ save }));
  act(() => { view.result.current.setValue(2); });
  expect(view.result.current.dirty).toBe(true);
  await act(async () => { jest.advanceTimersByTime(6000); });
  act(() => { view.result.current.setValue(3); });         // a second edit restarts the delay
  await act(async () => { jest.advanceTimersByTime(6000); });
  expect(save).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(4001); });
  await settle();
  expect(save).toHaveBeenCalledTimes(1);
  expect(store.get('p1')).toBe(3);
  expect(view.result.current.dirty).toBe(false);
  expect(getActivity()).toEqual([]);
});

test('undoing an edit makes the project clean again (nothing is saved)', async () => {
  const view = renderHook(() => useStudio({ save }));
  act(() => { view.result.current.setValue(2); });
  act(() => { view.result.current.setValue(1); });
  expect(view.result.current.dirty).toBe(false);
  await act(async () => { jest.advanceTimersByTime(20000); });
  expect(save).not.toHaveBeenCalled();
});

test('leaving within the delay: unmount writes the pending edit', async () => {
  const view = renderHook(() => useStudio({ save }));
  act(() => { view.result.current.setValue(5); });
  view.unmount();
  await settle();
  expect(save).toHaveBeenCalledTimes(1);
  expect(store.get('p1')).toBe(5);
  expect(getActivity()).toEqual([]);   // the item goes with the studio
});

test('the page is hidden: the pending edit is written', async () => {
  const view = renderHook(() => useStudio({ save }));
  act(() => { view.result.current.setValue(6); });
  const vis = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  try {
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  } finally { vis.mockRestore(); }
  await settle();
  expect(save).toHaveBeenCalledTimes(1);
  expect(store.get('p1')).toBe(6);
  expect(view.result.current.dirty).toBe(false);
});

test('the page becoming visible again is not a reason to save', async () => {
  const view = renderHook(() => useStudio({ save }));
  act(() => { view.result.current.setValue(6); });
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); }); // jsdom: visible
  expect(save).not.toHaveBeenCalled();
  view.unmount();
});

test('pagehide writes the edit; beforeunload starts the save and asks to confirm', async () => {
  const view = renderHook(() => useStudio({ save }));
  act(() => { view.result.current.setValue(7); });
  await act(async () => { window.dispatchEvent(new Event('pagehide')); });
  await settle();
  expect(store.get('p1')).toBe(7);
  act(() => { view.result.current.setValue(8); });
  const ev = new Event('beforeunload', { cancelable: true });
  await act(async () => { window.dispatchEvent(ev); });
  await settle();
  expect(ev.defaultPrevented).toBe(true);
  expect(store.get('p1')).toBe(8);
  const clean = new Event('beforeunload', { cancelable: true });
  await act(async () => { window.dispatchEvent(clean); });
  expect(clean.defaultPrevented).toBe(false);   // nothing pending: no question
});

test('flush() writes the pending edit at once (before opening another project) and only once', async () => {
  const view = renderHook(() => useStudio({ save }));
  act(() => { view.result.current.setValue(9); });
  let ok;
  await act(async () => { ok = await view.result.current.flush(); });
  expect(ok).toBe(true);
  expect(save).toHaveBeenCalledTimes(1);
  expect(store.get('p1')).toBe(9);
  await act(async () => { await view.result.current.flush(); });   // clean: nothing to do
  await act(async () => { jest.advanceTimersByTime(20000); });     // the debounce was cancelled
  expect(save).toHaveBeenCalledTimes(1);
  // opening another project takes a new saved state: not an edit
  act(() => { view.result.current.setProjectKey('p2'); });
  expect(view.result.current.dirty).toBe(false);
});

test('no save when clean, on every way out', async () => {
  const view = renderHook(() => useStudio({ save }));
  await act(async () => { await view.result.current.flush(); });
  await act(async () => { window.dispatchEvent(new Event('pagehide')); });
  view.unmount();
  await settle();
  expect(save).not.toHaveBeenCalled();
});

test('Activity: an unsaved item while dirty, which leaving does not block on (it is saved on the way out); cleared after the save', async () => {
  const view = renderHook(() => useStudio({ save }));
  act(() => { view.result.current.setValue(2); });
  const items = getActivity();
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    appId: 'test-studio', appName: 'Test Studio', kind: 'unsaved', state: 'dirty',
    href: HREF, onLeave: 'continues', title: 'Unsaved changes in Alpha',
  });
  expect(leaveVerdict(items, HREF, '/dashboard/apps/production/other').block).toHaveLength(0);
  // the item's save action (Activity list) writes the edits
  await act(async () => { await items[0].actions.save(); });
  expect(store.get('p1')).toBe(2);
  expect(getActivity()).toEqual([]);
});

test('Activity: cleared on unmount', async () => {
  const view = renderHook(() => useStudio({ save }));
  act(() => { view.result.current.setValue(2); });
  expect(getActivity()).toHaveLength(1);
  view.unmount();
  await settle();
  expect(getActivity()).toEqual([]);
});

test('a failed save keeps the edit pending, and the item save reports it', async () => {
  save.mockImplementation(async () => false);
  const view = renderHook(() => useStudio({ save }));
  act(() => { view.result.current.setValue(4); });
  const item = getActivity()[0];
  let err = null;
  await act(async () => { try { await item.actions.save(); } catch (e) { err = e; } });
  expect(err).toBeTruthy();
  expect(view.result.current.dirty).toBe(true);
  expect(getActivity()).toHaveLength(1);
  view.unmount();
});

test('a thrown save counts as failed', async () => {
  save.mockImplementation(async () => { throw new Error('offline'); });
  const err = jest.spyOn(console, 'error').mockImplementation(() => {});
  const view = renderHook(() => useStudio({ save }));
  act(() => { view.result.current.setValue(4); });
  let ok;
  await act(async () => { ok = await view.result.current.flush(); });
  expect(ok).toBe(false);
  expect(view.result.current.dirty).toBe(true);
  view.unmount();
  await settle();
  err.mockRestore();
});

test('read-only: edits are never written and no Activity item claims they will be', async () => {
  const view = renderHook(() => useStudio({ save, canWrite: false }));
  act(() => { view.result.current.setValue(2); });
  await act(async () => { jest.advanceTimersByTime(20000); });
  expect(getActivity()).toEqual([]);
  view.unmount();
  await settle();
  expect(save).not.toHaveBeenCalled();
});

test("the studio's own Save button: the state it wrote becomes the saved state", async () => {
  const view = renderHook(() => useStudio({ save }));
  act(() => { view.result.current.setValue(2); });
  // manual save starts (isSaving), writes, then sets lastSaveTime
  act(() => { view.result.current.setIsSaving(true); });
  act(() => { view.result.current.setLastSaveTime(new Date()); view.result.current.setIsSaving(false); });
  expect(view.result.current.dirty).toBe(false);
  await act(async () => { jest.advanceTimersByTime(20000); });
  expect(save).not.toHaveBeenCalled();
  expect(getActivity()).toEqual([]);
});

test('an edit made while the Save button was saving stays pending', async () => {
  const view = renderHook(() => useStudio({ save }));
  act(() => { view.result.current.setValue(2); });
  act(() => { view.result.current.setIsSaving(true); });
  act(() => { view.result.current.setValue(3); });              // typed during the save
  act(() => { view.result.current.setLastSaveTime(new Date()); view.result.current.setIsSaving(false); });
  expect(view.result.current.dirty).toBe(true);
  view.unmount();
  await settle();
  expect(store.get('p1')).toBe(3);
});

describe('negative control: the old pattern', () => {
  // The hand-rolled autosave every affected studio had before this hook.
  function useOldAutosave({ save: write }) {
    const [value, setValue] = useState(1);
    useEffect(() => {
      if (value === 1) return undefined;
      const timer = setTimeout(() => { write({ id: 'p1', value }); }, 10000);
      return () => clearTimeout(timer);
    }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
    return { setValue };
  }

  test('old pattern: an edit followed by leaving within 10 s is lost', async () => {
    const view = renderHook(() => useOldAutosave({ save }));
    act(() => { view.result.current.setValue(5); });
    view.unmount();
    await act(async () => { jest.advanceTimersByTime(20000); });
    expect(save).not.toHaveBeenCalled();
    expect(store.has('p1')).toBe(false);
  });

  test('the same steps with usePendingSave keep the edit', async () => {
    const view = renderHook(() => useStudio({ save }));
    act(() => { view.result.current.setValue(5); });
    view.unmount();
    await settle();                       // written on the way out, not by the timer
    expect(store.get('p1')).toBe(5);
    await act(async () => { jest.advanceTimersByTime(20000); });
    expect(save).toHaveBeenCalledTimes(1);
  });
});

// owner report 2026-10-17 follow-up: leaving a studio with fresh edits saves them,
// so the leave guard never asks about them (no needless dialog)
test('unsaved edits never block leaving: the leave decision lets the link through', () => {
  // eslint-disable-next-line global-require
  const { leaveVerdict } = require('../activity');
  const item = { id: 'x', appId: 'separator', href: '/dashboard/apps/facilities/separator-slug-catcher-designer', kind: 'unsaved', state: 'dirty', onLeave: 'continues' };
  expect(leaveVerdict([item], item.href, '/dashboard').block).toEqual([]);
});
