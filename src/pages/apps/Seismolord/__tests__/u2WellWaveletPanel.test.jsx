/**
 * U2-013 in the real SyntheticsPanel (dev harness: two reflectors under a
 * 25 Hz Ricker, the seismic delayed 8 ms): Synthesize, then Extract from
 * the well gives a 25 Hz wavelet that fits the seismic, and the synthetic
 * re-runs with it.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SeismolordSyntheticsHarness from '@/pages/apps/Seismolord/SeismolordSyntheticsHarness';

test('Extract from the well: a measured wavelet with its peak frequency, phase and fit', async () => {
  render(<SeismolordSyntheticsHarness />);
  await waitFor(() => expect(screen.getByTestId('synth-well').querySelector('option[value="w-syn"]')).not.toBeNull());
  fireEvent.change(screen.getByTestId('synth-well'), { target: { value: 'w-syn' } });
  expect(screen.getByTestId('synth-extract-well').disabled).toBe(true);   // needs a run first
  fireEvent.click(screen.getByTestId('synth-run'));
  await waitFor(() => expect(screen.getByTestId('synth-result')).toBeTruthy());
  expect(screen.getByTestId('synth-wavelet-info').textContent).toMatch(/^ricker wavelet, peak 25\.0 Hz, phase 0 deg$/);
  fireEvent.click(screen.getByTestId('synth-extract-well'));
  await waitFor(() => expect(screen.queryByTestId('synth-error')?.textContent || screen.getByTestId('synth-mode-well').checked).toBe(true));
  const m = /^well wavelet, peak ([\d.]+) Hz, phase (-?\d+) deg, fit ([\d.]+)$/.exec(screen.getByTestId('synth-wavelet-info').textContent);
  expect(m).not.toBeNull();
  expect(Math.abs(Number(m[1]) - 25)).toBeLessThan(3);
  expect(Number(m[3])).toBeGreaterThan(0.9);
});
