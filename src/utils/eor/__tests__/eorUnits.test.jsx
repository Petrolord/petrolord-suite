/**
 * EOR-U1 units (PL3, RL7, PL11): one known value pinned per conversion
 * (a round trip cannot see a wrong factor: the Well Test SI storage lesson),
 * typed text kept as typed (the unit-draft guard), and the criteria compared
 * in one system with boundary cases typed in SI.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { eorUnits, inputStore, inputText } from '../units';
import { EorScreeningProvider, defaultInputs, useEorScreening } from '@/contexts/EorScreeningContext';
import EorField from '@/components/eor/EorField';

describe('one known value per conversion', () => {
  const si = eorUnits('si');
  const of = eorUnits('oilfield');
  it.each([
    ['depth', 4500, 1371.6, 'm'],
    ['thickness', 20, 6.096, 'm'],
    ['temperature', 200, 93.3333333, 'degC'],
    ['temperature', 32, 0, 'degC'],
    ['viscosity', 35, 35, 'mPa.s'],
    ['permeability', 200, 200, 'mD'],
    ['pressure', 3000, 20684.2719, 'kPa'],
    ['ooip', 152e6, 24.16606883, '10^6 sm3'],
    ['transmissibility', 50, 15.24, 'mD.m/mPa.s'],
  ])('%s: %s oilfield is %s %s', (kind, stored, shown, label) => {
    expect(si.show(kind, stored)).toBeCloseTo(shown, 4);
    expect(si.label(kind)).toBe(label);
    // and back (relative, so the 10^8 STB case is held to 1e-9)
    expect(si.store(kind, si.show(kind, stored)) / stored).toBeCloseTo(1, 9);
  });
  it('oilfield: OOIP shows in MMSTB, the rest as stored', () => {
    expect(of.show('ooip', 152e6)).toBeCloseTo(152, 9);
    expect(of.label('ooip')).toBe('MMSTB');
    expect(of.show('depth', 5200)).toBe(5200);
  });
  it('typed text: blank, partial and comma decimals', () => {
    expect(inputStore('depth', '', 'si')).toBe('');
    expect(inputStore('depth', '-', 'si')).toBeUndefined();
    expect(inputStore('depth', '1371.6', 'si')).toBe('4500');
    expect(inputStore('viscosity', '2.', 'oilfield')).toBe('2');
    expect(inputStore('viscosity', '2,5', 'oilfield')).toBe('2.5');
    expect(inputText('depth', '4500', 'si')).toBe('1371.6');
  });
});

const Probe = () => {
  const { inputs, results, setUnitSystem } = useEorScreening();
  const steam = results.find((r) => r.id === 'steam');
  return (
    <div>
      <EorField id="f-depth" label="Depth" kind="depth" value={inputs.form.depthFt} onChange={() => {}} />
      <span data-testid="stored">{inputs.form.depthFt}</span>
      <span data-testid="steam-depth">{steam.verdicts.find((v) => v.key === 'depth').status}</span>
      <button type="button" onClick={() => setUnitSystem('si')}>si</button>
    </div>
  );
};
const Wired = () => {
  const { inputs, setFormField, results } = useEorScreening();
  const steam = results.find((r) => r.id === 'steam');
  return (
    <div>
      <EorField id="f-depth" label="Depth" kind="depth" value={inputs.form.depthFt} onChange={(v) => setFormField('depthFt', v)} />
      <EorField id="f-visc" label="Viscosity" kind="viscosity" value={inputs.form.viscosityCp} onChange={(v) => setFormField('viscosityCp', v)} />
      <span data-testid="stored">{inputs.form.depthFt}</span>
      <span data-testid="stored-visc">{inputs.form.viscosityCp}</span>
      <span data-testid="steam-depth">{steam.verdicts.find((v) => v.key === 'depth').status}</span>
    </div>
  );
};

describe('typing in a converted field (PL11; useUnitDraft)', () => {
  it('SI: "1371." stays as typed; 1,371.6 m is 4,500 ft and passes the steam limit on the line', async () => {
    render(<MemoryRouter><EorScreeningProvider initialInputs={defaultInputs('si')}><Wired /></EorScreeningProvider></MemoryRouter>);
    const box = screen.getByTestId('f-depth');
    expect(box).toHaveValue('1584.96'); // the sample 5,200 ft
    fireEvent.change(box, { target: { value: '1371.' } });
    expect(box).toHaveValue('1371.');
    fireEvent.change(box, { target: { value: '1371.6' } });
    expect(box).toHaveValue('1371.6');
    expect(Number(screen.getByTestId('stored').textContent)).toBeCloseTo(4500, 6);
    await waitFor(() => expect(screen.getByTestId('steam-depth')).toHaveTextContent('pass'));
    fireEvent.change(box, { target: { value: '1371.7' } });
    await waitFor(() => expect(screen.getByTestId('steam-depth')).toHaveTextContent('fail'));
    fireEvent.change(box, { target: { value: '' } });
    expect(screen.getByTestId('stored').textContent).toBe('');
    await waitFor(() => expect(screen.getByTestId('steam-depth')).toHaveTextContent('na'));
  });
  it('oilfield: "0." then "0.4" in viscosity', () => {
    render(<MemoryRouter><EorScreeningProvider initialInputs={defaultInputs('oilfield')}><Wired /></EorScreeningProvider></MemoryRouter>);
    const box = screen.getByTestId('f-visc');
    fireEvent.change(box, { target: { value: '0.' } });
    expect(box).toHaveValue('0.');
    fireEvent.change(box, { target: { value: '0.4' } });
    expect(screen.getByTestId('stored-visc').textContent).toBe('0.4');
  });
  it('switching the unit system converts the shown value and leaves the stored value', () => {
    render(<MemoryRouter><EorScreeningProvider initialInputs={defaultInputs('oilfield')}><Probe /></EorScreeningProvider></MemoryRouter>);
    expect(screen.getByTestId('f-depth')).toHaveValue('5200');
    fireEvent.click(screen.getByText('si'));
    expect(screen.getByTestId('f-depth')).toHaveValue('1584.96');
    expect(screen.getByTestId('stored').textContent).toBe('5200');
  });
});
