/**
 * WF-U2-014 (closes WF-U1-021 and WF-U1-023): SI in the Uncertainty
 * distributions and in the layer cells. One known value pinned per
 * conversion through the app's own unit helper (registry factors): 40 acres
 * = 16.1874256896 ha, 25 ft = 7.62 m, 800 RB/d = 127.18983594 rm3/d. The
 * distributions are shown and typed in the display units and stored in
 * oilfield; a layer cell keeps "2." while typing in SI. Negative control:
 * the old cell (value read back from the stored ft each keystroke) drops
 * the decimal point.
 */
import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { wfUnits } from '@/utils/waterflooddesign/units';
import { UInput } from '@/components/waterflooddesign/primitives';
import { ParamRow } from '@/components/waterflooddesign/UncertaintyPanel';
import { UNCERTAINTY_PARAMS } from '@/utils/waterfloodUncertainty';

const SI = wfUnits('si');
const OF = wfUnits('oilfield');
const def = (key) => UNCERTAINTY_PARAMS.find((p) => p.key === key);

describe('pinned conversions of the Uncertainty kinds', () => {
  it('area, length, injection rate, FVF, viscosity', () => {
    expect(SI.show('area', 40)).toBeCloseTo(16.1874256896, 9);
    expect(SI.show('length', 25)).toBeCloseTo(7.62, 12);
    expect(SI.show('resRate', 800)).toBeCloseTo(127.18983594, 6);
    expect(SI.show('fvfOil', 1.25)).toBeCloseTo(1.25, 12);
    expect(SI.label('viscosity')).toBe('mPa.s');
    expect(SI.show('viscosity', 5)).toBe(5);
    expect(SI.store('area', 16.1874256896)).toBeCloseTo(40, 9);
    for (const p of UNCERTAINTY_PARAMS) expect(typeof p.kind).toBe('string');
  });
});

describe('the Uncertainty distributions in SI', () => {
  it('shows a stored triangular in ha and stores what is typed in acres', () => {
    const patches = [];
    render(<ParamRow def={def('area_acres')} cfg={{ enabled: true, type: 'triangular', min: '32', mode: '40', max: '48' }} base="40" onToggle={() => {}} onPatch={(k, p) => patches.push([k, p])} u={SI} />);
    expect(screen.getByText('Pattern area (ha)')).toBeInTheDocument();
    const mode = screen.getByTestId('wds-mc-area_acres-mode');
    expect(mode.value).toBe('16.18743');
    fireEvent.change(screen.getByTestId('wds-mc-area_acres-max'), { target: { value: '20' } });
    expect(patches[0][0]).toBe('area_acres');
    expect(Number(patches[0][1].max)).toBeCloseTo(20 / 0.40468564224, 6);
  });

  it('in oilfield nothing changes: acres as typed', () => {
    const patches = [];
    render(<ParamRow def={def('area_acres')} cfg={{ enabled: true, type: 'uniform', min: '32', max: '48' }} base="40" onToggle={() => {}} onPatch={(k, p) => patches.push(p)} u={OF} />);
    expect(screen.getByText('Pattern area (acres)')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('wds-mc-area_acres-min'), { target: { value: '30' } });
    expect(patches[0]).toEqual({ min: '30' });
  });

  it('a standard deviation converts as a value (a factor, no offset)', () => {
    const patches = [];
    render(<ParamRow def={def('h_ft')} cfg={{ enabled: true, type: 'normal', mean: '25', stdDev: '2.5' }} base="25" onToggle={() => {}} onPatch={(k, p) => patches.push(p)} u={SI} />);
    expect(screen.getByTestId('wds-mc-h_ft-stdDev').value).toBe('0.762');
  });
});

function Cell({ Comp }) {
  const [h, setH] = useState('');
  return (
    <>
      <Comp value={h} onStore={setH} />
      <span data-testid="stored">{h}</span>
    </>
  );
}
const NewCell = ({ value, onStore }) => <UInput kind="length" u={SI} value={value} onChange={onStore} testId="cell" />;
// the cell before WF-U2-014: the shown text read back from the stored ft on every keystroke
const OldCell = ({ value, onStore }) => (
  <input data-testid="cell" value={SI.text('length', value)} onChange={(e) => { const s = SI.toState('length', e.target.value); if (s != null) onStore(s); }} />
);

describe('the layer thickness cell in SI', () => {
  it('keeps "2." while typing and stores 2.5 m as ft', () => {
    render(<Cell Comp={NewCell} />);
    const cell = screen.getByTestId('cell');
    fireEvent.change(cell, { target: { value: '2.' } });
    expect(cell.value).toBe('2.');
    fireEvent.change(cell, { target: { value: '2.5' } });
    expect(cell.value).toBe('2.5');
    expect(Number(screen.getByTestId('stored').textContent)).toBeCloseTo(2.5 / 0.3048, 9);
  });

  it('negative control: the old cell drops the decimal point', () => {
    render(<Cell Comp={OldCell} />);
    const cell = screen.getByTestId('cell');
    fireEvent.change(cell, { target: { value: '2.' } });
    expect(cell.value).toBe('2');
  });
});
