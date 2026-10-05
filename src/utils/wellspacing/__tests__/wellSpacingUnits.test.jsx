/**
 * WS-U1 units (PL3, RL7, PL11): one known value pinned per conversion (a
 * round trip cannot see a wrong factor: the Well Test SI storage lesson),
 * typed text kept as typed (the unit-draft guard), the engine fed oilfield
 * values whatever the display, and the exports in the display unit.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { wsUnits, inputStore, inputText } from '../units';
import { defaultInputs, SAMPLE_FORM, blankForm } from '../model';
import { WellSpacingProvider, useWellSpacing } from '@/contexts/WellSpacingContext';
import WsField from '@/components/wellspacing/WsField';
import { runSpacingCases, generateCSV } from '@/utils/wellSpacingCalculations';

describe('one known value per conversion', () => {
  const si = wsUnits('si');
  it.each([
    ['area', 5000, 2023.4282, 'ha'], // 1 acre = 4,046.8564224 m2
    ['spacing', 40, 16.18742569, 'ha/well'],
    ['thickness', 60, 18.288, 'm'],
    ['length', 1320, 402.336, 'm'],
    ['temperature', 180, 82.2222222, 'degC'],
    ['pressure', 3500, 24131.6505, 'kPa'],
    ['gor', 500, 89.05380, 'sm3/sm3'], // 1 scf/STB = 0.178107607 m3/m3
    ['rate', 10, 1.58987295, 'sm3/d'],
    ['eur', 289.2, 45.97913, '10^3 sm3'], // Mbbl to 10^3 m3: 0.158987294928
    ['volume', 152, 24.16606883, '10^6 sm3'],
    ['fvf', 1.2845, 1.2845, 'rm3/sm3'],
    ['viscosity', 1.2, 1.2, 'mPa.s'],
    ['compressibility', 15e-6, 2.17557e-6, '1/kPa'], // 1/psi = 0.145037738 1/kPa
    ['permeability', 50, 50, 'mD'],
  ])('%s: %s oilfield is %s %s', (kind, stored, shown, label) => {
    expect(si.show(kind, stored) / shown).toBeCloseTo(1, 5);
    expect(si.label(kind)).toBe(label);
    expect(si.store(kind, si.show(kind, stored)) / stored).toBeCloseTo(1, 9);
  });
  it('NEGATIVE CONTROL: a hectare read as an acre is 2.47 times off', () => {
    expect(si.show('area', 1)).not.toBeCloseTo(1, 1);
    expect(1 / si.show('area', 1)).toBeCloseTo(2.4710538, 6);
  });
  it('typed text: blank, partial and comma decimals', () => {
    expect(inputStore('thickness', '', 'si')).toBe('');
    expect(inputStore('thickness', '-', 'si')).toBeUndefined();
    expect(inputStore('thickness', '18.288', 'si')).toBe('60');
    expect(inputStore('area', '2.', 'oilfield')).toBe('2');
    expect(inputStore('area', '2,5', 'oilfield')).toBe('2.5');
    expect(inputText('length', '1320', 'si')).toBe('402.336');
  });
});

describe('the engine reads oilfield values whatever the display', () => {
  it('the SI study gives the oilfield cases to the last digit; the CSV prints the display units', () => {
    const form = { ...blankForm(), ...SAMPLE_FORM };
    const r = runSpacingCases(form);
    const csvOil = generateCSV(r, wsUnits('oilfield')).split('\n');
    const csvSi = generateCSV(r, wsUnits('si')).split('\n');
    expect(csvOil[0]).toMatch(/Well Spacing \(acres\/well\)/);
    expect(csvSi[0]).toMatch(/Well Spacing \(ha\/well\)/);
    expect(csvSi[0]).toMatch(/EUR per Well \(10\^3 sm3\)/);
    // 40 acres: 16.1874 ha/well; NPV column identical in both
    const oil40 = csvOil.find((l) => l.startsWith('40,')).split(',');
    const si40 = csvSi.find((l) => l.startsWith('16.1874,')).split(',');
    expect(si40[8]).toBe(oil40[8]);
    expect(Number(si40[2])).toBeCloseTo(402.3, 1);
  });
});

const Wired = () => {
  const { inputs, setFormField, setUnitSystem, results } = useWellSpacing();
  return (
    <div>
      <WsField id="f-h" label="Net pay" kind="thickness" value={inputs.form.avgNetPayThickness} onChange={(v) => setFormField('avgNetPayThickness', v)} />
      <span data-testid="stored">{inputs.form.avgNetPayThickness}</span>
      <span data-testid="eur20">{results ? results.spacingResults[0].eurPerWell.toFixed(1) : 'none'}</span>
      <button type="button" onClick={() => setUnitSystem('si')}>si</button>
    </div>
  );
};

describe('typing in SI (PL11, the unit-draft guard)', () => {
  it('"18." stays as typed; 18.288 m stores 60 ft and the EUR is the oilfield one', () => {
    const initial = { ...defaultInputs('si'), form: { ...blankForm(), ...SAMPLE_FORM } };
    render(<WellSpacingProvider initialInputs={initial}><Wired /></WellSpacingProvider>);
    const box = screen.getByTestId('f-h');
    expect(box).toHaveValue('18.288');
    fireEvent.change(box, { target: { value: '18.' } });
    expect(box).toHaveValue('18.');
    expect(screen.getByTestId('stored')).toHaveTextContent('59.0551');
    fireEvent.change(box, { target: { value: '18.288' } });
    expect(screen.getByTestId('stored')).toHaveTextContent(/^60$/);
    expect(screen.getByTestId('eur20')).toHaveTextContent('289.2');
    fireEvent.change(box, { target: { value: '' } });
    expect(screen.getByTestId('stored')).toHaveTextContent(/^$/);
    expect(screen.getByTestId('eur20')).toHaveTextContent('none');
  });
});
