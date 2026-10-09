/**
 * SCAL-T1 (tester report, reproduced 2026-10-09): the autosave fired 10 s after
 * the last edit and leaving SCAL Studio sooner cancelled it, so the edits were
 * lost while the header said "Saved". Pending edits are now written when the
 * studio unmounts, when the page is hidden and before another project opens;
 * closing the tab asks the browser to confirm; and the header says "Unsaved
 * changes" until the edits are stored.
 * Negative control (run 2026-10-09): with the unmount flush removed, the
 * "leaving within 10 s" test fails (the stored marker stays at the old value).
 */
import React from 'react';
import { renderHook, act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockRows = new Map();
const mockSave = jest.fn(async (id, payload) => { mockRows.set(id, payload); return { success: true }; });
jest.mock('@/utils/savedProjects', () => ({
  createSavedProjectsService: () => ({
    list: async () => [...mockRows.entries()].map(([id, p]) => ({ id, name: p.name })),
    load: async (id) => mockRows.get(id) ?? null,
    save: (...a) => mockSave(...a),
    remove: async () => ({ success: true }),
  }),
}));
jest.mock('@/lib/recordSharing/useRecordSharing', () => ({ useRecordSharing: () => ({ canWrite: true, userId: null }) }));

import { useScalProjects, payloadPrint } from '../useScalProjects';
import StudioAutoSave from '@/components/studio/StudioAutoSave';

const addNotification = () => {}; // stable, as the provider's is
function mount(marker = 1) {
  return renderHook(({ m }) => useScalProjects({
    serialize: (id, name) => ({ id, name, schema: 2, marker: m, modified: new Date().toISOString() }),
    hydrate: () => {},
    changeKey: m,
    addNotification,
  }), { initialProps: { m: marker } });
}
async function openSeeded(view, marker = 1) {
  mockRows.set('p1', { id: 'p1', name: 'Ekene', schema: 2, marker });
  await act(async () => { await view.result.current.openProject('p1'); });
  mockSave.mockClear();
}

beforeEach(() => { mockRows.clear(); mockSave.mockClear(); });

test('the print ignores the modified stamp and the derived contract block', () => {
  expect(payloadPrint({ a: 1, modified: 'x', krContract: { t: 1 } })).toBe(payloadPrint({ a: 1, modified: 'y', krContract: { t: 2 } }));
  expect(payloadPrint({ a: 1 })).not.toBe(payloadPrint({ a: 2 }));
});

test('an edit makes the project dirty, and leaving within 10 s still saves it', async () => {
  const view = mount(1);
  await openSeeded(view, 1);
  expect(view.result.current.dirty).toBe(false);
  view.rerender({ m: 2 });
  expect(view.result.current.dirty).toBe(true);
  await act(async () => { view.unmount(); await Promise.resolve(); });
  expect(mockSave).toHaveBeenCalledTimes(1);
  expect(mockRows.get('p1').marker).toBe(2);
});

test('no edit, no write on the way out', async () => {
  const view = mount(1);
  await openSeeded(view, 1);
  await act(async () => { view.unmount(); await Promise.resolve(); });
  expect(mockSave).not.toHaveBeenCalled();
});

test('the autosave still fires 10 s after the last edit and clears the flag', async () => {
  jest.useFakeTimers();
  try {
    const view = mount(1);
    await openSeeded(view, 1);
    view.rerender({ m: 3 });
    await act(async () => { jest.advanceTimersByTime(10001); });
    await act(async () => { await Promise.resolve(); });
    expect(mockRows.get('p1').marker).toBe(3);
    expect(view.result.current.dirty).toBe(false);
  } finally { jest.useRealTimers(); }
});

test('opening another project first saves the pending edits of this one', async () => {
  const view = mount(1);
  await openSeeded(view, 1);
  mockRows.set('p2', { id: 'p2', name: 'Other', schema: 2, marker: 7 });
  view.rerender({ m: 5 });
  await act(async () => { await view.result.current.openProject('p2'); });
  expect(mockRows.get('p1').marker).toBe(5);
});

test('closing the tab with pending edits asks the browser to confirm', async () => {
  const view = mount(1);
  await openSeeded(view, 1);
  view.rerender({ m: 4 });
  const ev = new Event('beforeunload', { cancelable: true });
  act(() => { window.dispatchEvent(ev); });
  expect(ev.defaultPrevented).toBe(true);
});

test('the header says Unsaved changes while edits are pending', () => {
  render(<StudioAutoSave isSaving={false} saveError={null} lastSaveTime={new Date()} onSave={() => {}} dirty />);
  expect(screen.getByTestId('studio-unsaved')).toHaveTextContent('Unsaved changes');
});
