/**
 * PT11a: the Rw tools dialog shows the whole SP chain (Rmf at FT, Rmfe
 * with its rule, Rwe, Rw by Bateman-Konen), applies Rw with its method and
 * a provenance entry, and refuses outside the fit instead of extrapolating.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import RwToolsDialog from '../components/RwToolsDialog';
import { RW_METHOD_LABELS, FIELDS } from '../services/paramFields';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'petrophysics');
const AC = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'analytic_cases.json'), 'utf8'));
const fToC = (f) => ((f - 32) * 5) / 9;

function mount(extra = {}) {
  const onApplyParams = jest.fn();
  const onProvenance = jest.fn();
  const onStatus = jest.fn();
  const onOpenChange = jest.fn();
  render(<RwToolsDialog open onOpenChange={onOpenChange} onApplyParams={onApplyParams}
    onProvenance={onProvenance} onStatus={onStatus} surfaceTempC={fToC(75)} {...extra} />);
  return { onApplyParams, onProvenance, onStatus, onOpenChange };
}

const type = (testId, value) => fireEvent.change(screen.getByTestId(testId), { target: { value: String(value) } });

describe('PT11a Rw tools SP route', () => {
  test('the type-well SP case runs the whole chain and applies Rw = 0.05 with its method and provenance', () => {
    const { onApplyParams, onProvenance } = mount();
    const c = AC.sp_chain_typewell;
    type('petro-rw-ssp', c.in.ssp_mv);
    type('petro-rw-rmf', c.in.rmf);
    type('petro-rw-rmf-tempc', fToC(c.in.rmf_t_f));
    type('petro-rw-tempc', fToC(c.in.t_f));
    expect(screen.getByTestId('petro-rw-sp-rmfe').textContent).toMatch(/by 0\.85 Rmf/);
    expect(screen.getByTestId('petro-rw-sp-result').textContent).toMatch(/Rwe = 0\.04245/);
    expect(screen.getByTestId('petro-rw-sp-rw').textContent).toMatch(/Rw = 0\.05\b/);
    expect(screen.getByTestId('petro-rw-sp-rw').textContent).toMatch(/Bateman-Konen 1977/);
    expect(screen.queryByTestId('petro-rw-sp-problem')).toBeNull();
    fireEvent.click(screen.getByTestId('petro-rw-sp-apply'));
    expect(onApplyParams).toHaveBeenCalledTimes(1);
    const patch = onApplyParams.mock.calls[0][0];
    expect(patch.rw).toBeCloseTo(0.05, 6);
    expect(patch.rwMethod).toBe('sp-bateman-konen');
    expect(onProvenance).toHaveBeenCalledTimes(1);
    const entry = onProvenance.mock.calls[0][0];
    expect(entry.kind).toBe('rw-apply');
    expect(entry.method).toBe('sp-bateman-konen');
    expect(entry.rmfeRule).toBe('x0.85');
    expect(entry.rwe).toBeCloseTo(c.rwe, 9);
    expect(entry.inputs.ssp).toBeCloseTo(c.in.ssp_mv, 9);
    expect(entry.note).toMatch(/Bateman-Konen/);
  });

  test('outside the fit the card refuses with the reason and Apply is disabled', () => {
    const { onApplyParams } = mount();
    // Rmf huge and SSP near zero so Rwe lands beyond the chart at 65 C
    type('petro-rw-ssp', 0);
    type('petro-rw-rmf', 8);
    type('petro-rw-tempc', 65);
    expect(screen.getByTestId('petro-rw-sp-problem').textContent).toMatch(/beyond the chart/);
    expect(screen.getByTestId('petro-rw-sp-rw').textContent).toMatch(/Rw = —/);
    expect(screen.getByTestId('petro-rw-sp-apply').disabled).toBe(true);
    fireEvent.click(screen.getByTestId('petro-rw-sp-apply'));
    expect(onApplyParams).not.toHaveBeenCalled();
    // the temperature limit
    type('petro-rw-rmf', 0.5);
    type('petro-rw-tempc', 5);
    expect(screen.getByTestId('petro-rw-sp-problem').textContent).toMatch(/50\.8/);
  });

  test('the Arps and salinity applies also name their method', () => {
    const { onApplyParams, onProvenance } = mount();
    fireEvent.click(screen.getByTestId('petro-rw-arps-apply'));
    expect(onApplyParams.mock.calls[0][0].rwMethod).toBe('arps');
    expect(onProvenance.mock.calls[0][0].method).toBe('arps');
    fireEvent.click(screen.getByTestId('petro-rw-sal-apply'));
    expect(onApplyParams.mock.calls[1][0].rwMethod).toBe('salinity');
  });

  test('the parameter panel hint names the method and hides for a typed Rw', () => {
    const hint = FIELDS.find((f) => f.testId === 'petro-param-rw-method');
    expect(hint.show({ rwMethod: 'sp-bateman-konen' })).toBe(true);
    expect(hint.hint({ rwMethod: 'sp-bateman-konen' })).toContain(RW_METHOD_LABELS['sp-bateman-konen']);
    expect(hint.show({ rwMethod: 'entered' })).toBe(false);
    expect(hint.show({})).toBe(false);
  });
});
