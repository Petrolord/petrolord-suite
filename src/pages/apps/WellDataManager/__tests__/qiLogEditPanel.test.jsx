/**
 * QI A3: the Edit logs panel previews, then saves a NEW curve through the
 * backend and refreshes the well; errors from the engine show in words.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LogEditPanel from '../components/LogEditPanel';

const reg = (id, mnemonic, unit, start, step, n) => ({ id, mnemonic, unit, start_md_m: start, stop_md_m: start + step * (n - 1), step_m: step, n_samples: n });
const a = reg('a', 'GR', 'GAPI', 100, 1, 21);
const b = reg('b', 'GR:2', 'GAPI', 100, 1, 21);
const curves = {
  a: Float32Array.from({ length: 21 }, (_, i) => (i <= 12 ? 10 + 0.1 * i : NaN)),
  b: Float32Array.from({ length: 21 }, (_, i) => 12.5 + 0.1 * i),
};

test('splice: preview the join, save a new curve, refresh the well', async () => {
  const backend = { saveLogs: jest.fn(async () => []) };
  const onSaved = jest.fn();
  render(<LogEditPanel well={{ id: 'w1', checkshots: [] }} logs={[a, b]} backend={backend} unit="m" onSaved={onSaved} loadCurve={async (l) => curves[l.id]} />);
  fireEvent.click(screen.getByTestId('wdm-splice-run-GR'));
  fireEvent.click(screen.getByTestId('wdm-splice-run-GR:2'));
  const inputs = screen.getAllByRole('textbox');
  // GR from 100 to 112, GR:2 from 110 to 120
  fireEvent.change(inputs[1], { target: { value: '112' } });
  fireEvent.change(inputs[2], { target: { value: '110' } });
  fireEvent.change(screen.getByTestId('wdm-splice-window'), { target: { value: '3' } });
  fireEvent.click(screen.getByTestId('wdm-edit-preview'));
  expect(await screen.findByTestId('wdm-edit-result')).toHaveTextContent(/Join at 110 m to GR:2: shifted by -2.5 over 6 overlap samples/);
  fireEvent.click(screen.getByTestId('wdm-edit-save'));
  await waitFor(() => expect(backend.saveLogs).toHaveBeenCalled());
  const [wellId, [log]] = backend.saveLogs.mock.calls[0];
  expect(wellId).toBe('w1');
  expect(log.mnemonic).toBe('GR_SPL');
  expect(onSaved).toHaveBeenCalled();
  expect(screen.getByTestId('wdm-edit-note')).toHaveTextContent(/GR_SPL saved \(splice\)\. The original curves are unchanged\./);
});

test('sonic drift with no checkshots says what is missing, and nothing is saved', async () => {
  const dt = reg('dt', 'DT', 'US/M', 800, 1, 101);
  const backend = { saveLogs: jest.fn() };
  render(<LogEditPanel well={{ id: 'w1', checkshots: [] }} logs={[dt]} backend={backend} unit="m" loadCurve={async () => new Float32Array(101).fill(300)} />);
  fireEvent.click(screen.getByTestId('wdm-edit-mode-drift'));
  fireEvent.change(screen.getByTestId('wdm-drift-sonic'), { target: { value: 'dt' } });
  fireEvent.click(screen.getByTestId('wdm-edit-preview'));
  expect(await screen.findByTestId('wdm-edit-note')).toHaveTextContent(/at least two checkshot levels/);
  expect(backend.saveLogs).not.toHaveBeenCalled();
});
