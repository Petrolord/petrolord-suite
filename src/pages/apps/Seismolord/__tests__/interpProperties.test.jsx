/**
 * Group 5 properties: fault and horizon rename / colour / line weight /
 * opacity, saved with the interpretation (params.display) and undoable,
 * plus colours that stay put when a fault is added.
 */
import React from 'react';
import {
  render, screen, fireEvent, renderHook, act,
} from '@testing-library/react';
import '@testing-library/jest-dom';

let mockUpdateCalls = [];
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (table) => ({
      update: (payload) => {
        mockUpdateCalls.push({ table, payload });
        return {
          eq: (_col, id) => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id, name: 'F1', ...payload }, error: null }),
            }),
          }),
        };
      },
    }),
  },
}));

/* eslint-disable import/first */
import {
  FAULT_COLORS, HORIZON_COLORS, faultColorFor, horizonColorFor, stableColor,
} from '@/pages/apps/Seismolord/components/workspace/interpretationColors';
import { updateFaultMeta } from '@/pages/apps/Seismolord/services/faultsService';
import useDisplaySettings from '@/pages/apps/Seismolord/hooks/useDisplaySettings';
import FaultSettingsDialog from '@/pages/apps/Seismolord/components/workspace/dialogs/FaultSettingsDialog';
import HorizonSettingsDialog from '@/pages/apps/Seismolord/components/workspace/dialogs/HorizonSettingsDialog';
import { UndoStack } from '@/pages/apps/Seismolord/lib/undoStack';
/* eslint-enable import/first */

beforeEach(() => { mockUpdateCalls = []; });

describe('stable interpretation colours', () => {
  const ids = ['8f1c', 'a7d2', '0b33', 'fe19', '6c40'];

  test('adding a fault never recolours the existing faults', () => {
    // listFaults sorts newest first: the new fault lands at index 0
    const before = ids.map((id) => ({ id, params: {} }));
    const after = [{ id: 'new-fault', params: {} }, ...before];
    const colour = (list) => Object.fromEntries(list.map((f) => [f.id, faultColorFor(f)]));
    const a = colour(before);
    const b = colour(after);
    for (const id of ids) expect(b[id]).toBe(a[id]);
  });

  test('the same id always gets the same palette colour', () => {
    expect(stableColor('abc', FAULT_COLORS)).toBe(stableColor('abc', FAULT_COLORS));
    expect(FAULT_COLORS).toContain(stableColor('abc', FAULT_COLORS));
    expect(HORIZON_COLORS).toContain(horizonColorFor({ id: 'h1' }));
  });

  test('a saved colour wins over the fallback', () => {
    expect(faultColorFor({ id: 'x', params: { display: { color: '#123456' } } })).toBe('#123456');
    expect(horizonColorFor({ id: 'x' }, { color: '#abcdef' })).toBe('#abcdef');
  });
});

describe('updateFaultMeta', () => {
  test('merges display into params and never touches the sticks', async () => {
    const fault = { id: 'f1', name: 'F1', params: { source: 'import' }, sticks: [{ points: [] }] };
    const row = await updateFaultMeta({ fault, display: { color: '#ff0000', opacity: 0.5 } });
    expect(mockUpdateCalls).toHaveLength(1);
    expect(mockUpdateCalls[0].table).toBe('seismic_faults');
    expect(mockUpdateCalls[0].payload.params).toEqual({
      source: 'import', display: { color: '#ff0000', opacity: 0.5 },
    });
    expect(mockUpdateCalls[0].payload.sticks).toBeUndefined();
    expect(row.params.display.color).toBe('#ff0000');
  });

  test('rename writes the name only; a no-op writes nothing', async () => {
    const fault = { id: 'f1', name: 'F1', params: {} };
    await updateFaultMeta({ fault, name: 'Main bounding fault' });
    expect(mockUpdateCalls[0].payload.name).toBe('Main bounding fault');
    expect(mockUpdateCalls[0].payload.params).toBeUndefined();
    await updateFaultMeta({ fault, name: 'F1' });
    expect(mockUpdateCalls).toHaveLength(1);
  });
});

describe('useDisplaySettings (persist + undo)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const setup = (initialDisplay = {}) => {
    let rows = [{ id: 'f1', name: 'F1', params: { display: initialDisplay } }];
    const persist = jest.fn(async ({ row, display, name }) => ({
      ...row,
      ...(name !== undefined ? { name } : {}),
      params: display !== undefined ? { ...row.params, display } : row.params,
    }));
    const onSaved = jest.fn((saved) => { rows = rows.map((r) => (r.id === saved.id ? saved : r)); });
    const undoStack = new UndoStack();
    const hook = renderHook(() => useDisplaySettings({
      rows, persist, onSaved, undoStack, noun: 'Fault',
    }));
    return {
      hook, persist, onSaved, undoStack, rows: () => rows,
    };
  };

  test('a burst of changes is one save and one undo step', async () => {
    const {
      hook, persist, undoStack, rows,
    } = setup({ color: '#fb923c' });
    act(() => { hook.result.current.changeDisplay(rows()[0], { opacity: 0.8 }); });
    act(() => { hook.result.current.changeDisplay(rows()[0], { opacity: 0.6 }); });
    act(() => { hook.result.current.changeDisplay(rows()[0], { lineWidth: 2 }); });
    // live in the session before anything is written
    expect(hook.result.current.displayFor(rows()[0])).toEqual({
      color: '#fb923c', opacity: 0.6, lineWidth: 2,
    });
    expect(persist).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(800); });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0][0].display).toEqual({ color: '#fb923c', opacity: 0.6, lineWidth: 2 });
    expect(undoStack.done).toHaveLength(1);

    // undo restores the display the burst started from, and saves it
    await act(async () => { await undoStack.undo(); });
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[1][0].display).toEqual({ color: '#fb923c' });
    expect(hook.result.current.displayFor(rows()[0])).toEqual({ color: '#fb923c' });

    await act(async () => { await undoStack.redo(); });
    expect(persist.mock.calls[2][0].display).toEqual({ color: '#fb923c', opacity: 0.6, lineWidth: 2 });
  });

  test('rename is undoable', async () => {
    const { hook, persist, undoStack, rows } = setup();
    await act(async () => { await hook.result.current.rename(rows()[0], 'Graben East'); });
    expect(persist.mock.calls[0][0].name).toBe('Graben East');
    expect(rows()[0].name).toBe('Graben East');
    await act(async () => { await undoStack.undo(); });
    expect(rows()[0].name).toBe('F1');
    await act(async () => { await undoStack.redo(); });
    expect(rows()[0].name).toBe('Graben East');
  });
});

describe('FaultSettingsDialog', () => {
  const fault = {
    id: 'f1',
    name: 'F1',
    params: {},
    sticks: [{ points: [{ il: 1, xl: 2, s: 3 }, { il: 1, xl: 3, s: 9 }] }],
  };
  const setup = (display = {}) => {
    const onChange = jest.fn();
    const onRename = jest.fn();
    render(
      <FaultSettingsDialog
        open
        onOpenChange={() => {}}
        fault={fault}
        display={display}
        onChange={onChange}
        onRename={onRename}
      />,
    );
    return { onChange, onRename };
  };

  test('colour, line weight and opacity report live changes', () => {
    const { onChange } = setup();
    expect(screen.getByText('Fault settings')).toBeInTheDocument();
    expect(screen.getByText(/1 stick, 2 points/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(`Colour ${FAULT_COLORS[2]}`));
    expect(onChange).toHaveBeenLastCalledWith({ color: FAULT_COLORS[2] });
    fireEvent.change(screen.getByLabelText('Line weight'), { target: { value: '2' } });
    expect(onChange).toHaveBeenLastCalledWith({ lineWidth: 2 });
    fireEvent.change(screen.getByLabelText('Opacity'), { target: { value: '40' } });
    expect(onChange).toHaveBeenLastCalledWith({ opacity: 0.4 });
  });

  test('rename commits the trimmed name', () => {
    const { onRename } = setup();
    const btn = screen.getByRole('button', { name: 'Rename' });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Fault name'), { target: { value: '  F-North  ' } });
    fireEvent.click(btn);
    expect(onRename).toHaveBeenCalledWith('F-North');
  });
});

test('HorizonSettingsDialog offers line opacity for sections and 3D', () => {
  const onChange = jest.fn();
  render(
    <HorizonSettingsDialog
      open
      onOpenChange={() => {}}
      horizon={{ id: 'h1', name: 'H1', stats: {}, params: {} }}
      display={{}}
      onChange={onChange}
      onRename={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText('Line opacity'), { target: { value: '55' } });
  expect(onChange).toHaveBeenLastCalledWith({ lineOpacity: 0.55 });
});
