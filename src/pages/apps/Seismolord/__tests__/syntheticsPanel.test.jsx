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

  test('RP-U1-009: Rock Physics substituted curves are listed, labelled, and synthesize', async () => {
    await pickWell();
    const sonicOpts = [...screen.getByTestId('synth-sonic').querySelectorAll('option')].map((o) => o.textContent);
    const densOpts = [...screen.getByTestId('synth-density').querySelectorAll('option')].map((o) => o.textContent);
    expect(sonicOpts.some((t) => /DT_SUB \(US\/M\), fluid substituted/.test(t))).toBe(true);
    expect(densOpts.some((t) => /RHOB_SUB \(KG\/M3\), fluid substituted/.test(t))).toBe(true);
    // the measured curves stay the default even though the substituted ones come first
    expect(screen.getByTestId('synth-sonic').value).toBe('log-dt');
    fireEvent.change(screen.getByTestId('synth-sonic'), { target: { value: 'log-dt-sub' } });
    fireEvent.change(screen.getByTestId('synth-density'), { target: { value: 'log-rhob-sub' } });
    fireEvent.click(screen.getByTestId('synth-run'));
    await waitFor(() => expect(screen.getByTestId('synth-result')).toBeTruthy());
    expect(screen.queryByTestId('synth-density-note')).toBeNull();
  });

  test('RP-U2-007: an estimated sonic is listed last in words that say so, is never the default, and warns when chosen', async () => {
    await pickWell();
    const opts = [...screen.getByTestId('synth-sonic').querySelectorAll('option')].map((o) => o.textContent);
    expect(opts.some((t) => /^DT_EST \(US\/M\), ESTIMATED sonic: Gardner \(1974\) inverse from density/.test(t))).toBe(true);
    // the measured sonic stays the default although the estimate is first in the list
    expect(screen.getByTestId('synth-sonic').value).toBe('log-dt');
    expect(screen.queryByTestId('synth-estimated-sonic')).toBeNull();
    fireEvent.change(screen.getByTestId('synth-sonic'), { target: { value: 'log-dt-est' } });
    expect(screen.getByTestId('synth-estimated-sonic').textContent).toMatch(/is an estimate, with no sonic log behind it.*no basis for a tie/);
    // negative control: a plain DT has no warning
    fireEvent.change(screen.getByTestId('synth-sonic'), { target: { value: 'log-dt' } });
    expect(screen.queryByTestId('synth-estimated-sonic')).toBeNull();
  });

  test('RP-U2-012 (U2-020 second half): the gather Rock Physics published for the well is shown on request', async () => {
    await pickWell();
    await waitFor(() => expect(screen.getByTestId('synth-rp-gather-toggle')).toBeTruthy());
    expect(screen.queryByTestId('synth-rp-gather')).toBeNull();
    fireEvent.click(screen.getByTestId('synth-rp-gather-toggle'));
    expect(screen.getByTestId('synth-rp-gather-caption').textContent).toBe('Rock Physics angle gather of Layer 2 · 5 angles to 40 degrees · exact Zoeppritz · Ricker 25 Hz, zero phase · published 2026-10-01');
    for (const key of ['in-situ', 'substituted']) {
      const el = screen.getByTestId(`synth-rp-gather-${key}`);
      expect(el.getAttribute('data-traces')).toBe('5');
      expect(el.getAttribute('data-samples')).toBe('81');
      expect(el.getAttribute('data-canvas')).toBe('chart');
    }
    expect(screen.getByTestId('synth-rp-gather-ab').textContent).toContain('Zone with 100% gas');
    expect(screen.getByTestId('synth-rp-gather-ab').textContent).toContain('intercept -0.1000');
    expect(screen.getByTestId('synth-rp-gather-ab').textContent).toContain('gradient -0.3300');
    expect(screen.queryByTestId('synth-rp-gather-estimated')).toBeNull();
    fireEvent.click(screen.getByTestId('synth-rp-gather-toggle'));
    expect(screen.queryByTestId('synth-rp-gather')).toBeNull();
  });
});
