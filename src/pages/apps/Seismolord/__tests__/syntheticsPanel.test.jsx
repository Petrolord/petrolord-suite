/**
 * Synthetics window end-to-end through the dev harness: the REAL
 * SyntheticsPanel on the known wedge fixture (seismic delayed +8 ms) —
 * pick well -> Synthesize -> provenance badge -> Suggest recovers the
 * shift. Same drive path a Playwright spec would take on
 * /dev/seismolord-synthetics.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SeismolordSyntheticsHarness from '@/pages/apps/Seismolord/SeismolordSyntheticsHarness';

const pickWell = async () => {
  render(<SeismolordSyntheticsHarness />);
  // wells' log metadata loads async; the selector fills once known
  await waitFor(() => {
    expect(screen.getByTestId('synth-well').querySelector('option[value="w-syn"]')).not.toBeNull();
  });
  fireEvent.change(screen.getByTestId('synth-well'), { target: { value: 'w-syn' } });
};

describe('SyntheticsPanel through the harness', () => {
  test('curve pickers pre-fill from guessCurveKind (DT sonic, RHOB density)', async () => {
    await pickWell();
    expect(screen.getByTestId('synth-sonic').value).toBe('log-dt');
    expect(screen.getByTestId('synth-density').value).toBe('log-rhob');
    // Ricker defaults: 25 Hz, SEG normal polarity on
    expect(screen.getByTestId('synth-freq').value).toBe('25');
    expect(screen.getByTestId('synth-polarity').checked).toBe(true);
  });

  test('Synthesize renders tracks with checkshot provenance; Suggest recovers +8 ms', async () => {
    await pickWell();
    fireEvent.click(screen.getByTestId('synth-run'));
    await waitFor(() => expect(screen.getByTestId('synth-result')).toBeTruthy());

    // T(z) provenance from makeTvdssToTwt — this well has checkshots
    expect(screen.getByTestId('synth-provenance').textContent).toContain('checkshots');
    // RHOB is picked, so no constant-density note
    expect(screen.queryByTestId('synth-density-note')).toBeNull();
    expect(screen.getByTestId('synth-canvas')).toBeTruthy();

    // display-only bulk shift: cross-correlation finds the +8 ms delay
    fireEvent.click(screen.getByTestId('synth-suggest'));
    await waitFor(() => expect(screen.getByTestId('synth-suggest-result')).toBeTruthy());
    expect(screen.getByTestId('synth-suggest-result').textContent).toContain('+8 ms');
    fireEvent.click(screen.getByTestId('synth-apply-shift'));
    expect(screen.getByTestId('synth-shift').value).toBe('8');
  });

  test('constant-density fallback surfaces its provenance note', async () => {
    await pickWell();
    fireEvent.change(screen.getByTestId('synth-density'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('synth-run'));
    await waitFor(() => expect(screen.getByTestId('synth-result')).toBeTruthy());
    expect(screen.getByTestId('synth-density-note').textContent).toContain('constant density');
  });
});
