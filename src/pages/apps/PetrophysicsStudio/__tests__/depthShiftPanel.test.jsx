/**
 * PT11c: the Depth shift panel over the in-memory backend: typed ties,
 * refusal of crossing ties, undo, save to a `_DS` row with the shift
 * object and who/when, apply on read after reload, reset to raw.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import DepthShiftPanel from '../components/DepthShiftPanel';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { mapLogs } from '../services/curveMap';
import { shiftLogFor, shiftOfLog } from '../services/depthShift';

async function openWell(backend) {
  const well = (await backend.listWells()).find((w) => w.is_own);
  const logs = await backend.listLogs(well.id);
  const raw = {};
  for (const l of logs) raw[l.mnemonic] = await backend.downloadCurve(l);
  const mapped = mapLogs(logs);
  const curves = {};
  for (const [key, log] of Object.entries(mapped)) if (log) curves[key] = raw[log.mnemonic];
  return { wellId: well.id, curves, logs: raw, allLogs: logs, inventory: Object.entries(mapped).map(([key, log]) => ({ key, log })), tops: [] };
}

// jsdom has no ResizeObserver; the TrackViewer only needs one that exists
beforeAll(() => { global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; });

// change sets the value; blur commits it (a blur with its own target value would bypass React's tracker)
const setInput = (el, value) => { fireEvent.change(el, { target: { value: String(value) } }); fireEvent.blur(el); };

test('typed ties, a crossing refusal, undo, save with provenance, apply on read, reset to raw', async () => {
  const backend = makeInMemoryBackend();
  let wd = await openWell(backend);
  const status = jest.fn();
  const saved = jest.fn(async () => { wd = await openWell(backend); rerender(ui(wd)); });
  const ui = (wellData) => (
    <DepthShiftPanel wellData={wellData} backend={backend} projectId="proj-1" depthUnit="m" onSaved={saved} onStatus={status} isOwn />
  );
  const { rerender } = render(ui(wd));
  expect(screen.getByTestId('petro-shift-src').value).toBe('GR');
  expect(screen.queryAllByTestId('petro-shift-pair')).toHaveLength(0);
  expect(screen.getByTestId('petro-shift-save').disabled).toBe(true);

  // two ties typed through the list
  fireEvent.click(screen.getByTestId('petro-shift-add'));
  fireEvent.click(screen.getByTestId('petro-shift-add'));
  expect(screen.getAllByTestId('petro-shift-pair')).toHaveLength(2);
  // always re-query: a commit re-renders the list
  const cell = (row, col) => screen.getAllByTestId('petro-shift-pair')[row].querySelectorAll('input')[col];
  const values = () => screen.getAllByTestId('petro-shift-pair').map((r) => Array.from(r.querySelectorAll('input')).map((i) => i.value));
  setInput(cell(0, 0), 2020); setInput(cell(0, 1), 2021);
  setInput(cell(1, 0), 2050); setInput(cell(1, 1), 2052.5);
  expect(values()).toEqual([['2020', '2021'], ['2050', '2052.5']]);
  expect(screen.queryByTestId('petro-shift-problem')).toBeNull();

  // a crossing edit is refused with the engine sentence and the pairs stay
  setInput(cell(1, 1), 2019);
  expect(screen.getByTestId('petro-shift-problem').textContent).toMatch(/Ties cross/);
  expect(values()).toEqual([['2020', '2021'], ['2050', '2052.5']]);

  // undo steps back one edit at a time: the 2052.5 edit, then the 2050 edit
  // (a no-op edit is still a step), the 2021 edit, the 2020 edit, then the
  // second tie itself
  fireEvent.click(screen.getByTestId('petro-shift-undo'));
  expect(values()).toEqual([['2020', '2021'], ['2050', '2050']]);
  for (let k = 0; k < 4; k++) fireEvent.click(screen.getByTestId('petro-shift-undo'));
  await waitFor(() => expect(screen.getAllByTestId('petro-shift-pair')).toHaveLength(1));
  setInput(cell(0, 0), 2020); setInput(cell(0, 1), 2021);
  expect(values()).toEqual([['2020', '2021']]);

  // save writes GR_DS with the shift object and who/when
  expect(screen.getByTestId('petro-shift-save').disabled).toBe(false);
  await act(async () => { fireEvent.click(screen.getByTestId('petro-shift-save')); });
  await waitFor(() => expect(saved).toHaveBeenCalled());
  const row = shiftLogFor(wd.allLogs, 'GR');
  expect(row).not.toBeNull();
  const shift = shiftOfLog(row);
  expect(shift.pairs).toEqual([[2020, 2021]]);
  expect(shift.reference.mnemonic).toBe(screen.getByTestId('petro-shift-ref').value);
  expect(shift.edits).toHaveLength(1);
  expect(shift.edits[0].by).toBe('dev');
  expect(typeof shift.edits[0].at).toBe('string');
  expect(status).toHaveBeenLastCalledWith(expect.stringMatching(/Saved GR_DS with 1 tie point/));

  // apply on read: reopened, the stored ties come back and verify clean
  await waitFor(() => expect(screen.getByTestId('petro-shift-stored')).toBeTruthy());
  expect(screen.getByTestId('petro-shift-verify').textContent).toMatch(/reproduces the saved samples/);
  expect(screen.getAllByTestId('petro-shift-pair')).toHaveLength(1);

  // reset to raw deletes the row after a confirm
  window.confirm = jest.fn(() => true);
  await act(async () => { fireEvent.click(screen.getByTestId('petro-shift-reset')); });
  await waitFor(() => expect(shiftLogFor(wd.allLogs, 'GR')).toBeNull());
  expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/deletes the saved curve GR_DS/));
  expect(wd.logs.GR).toBeDefined();
});

test('the panel tells the user the click order and needs the target after the reference', async () => {
  const backend = makeInMemoryBackend();
  const wd = await openWell(backend);
  const status = jest.fn();
  render(<DepthShiftPanel wellData={wd} backend={backend} projectId="proj-1" onSaved={jest.fn()} onStatus={status} isOwn />);
  fireEvent.click(screen.getByTestId('petro-shift-place'));
  expect(screen.getByTestId('petro-tracks').getAttribute('data-pick-mode')).toBe('tie');
  expect(screen.getByTestId('petro-shift-side').textContent).toMatch(/Click the reference curve at a feature/);
  fireEvent.click(screen.getByTestId('petro-shift-place'));
  expect(screen.getByTestId('petro-tracks').getAttribute('data-pick-mode')).toBe('');
});
