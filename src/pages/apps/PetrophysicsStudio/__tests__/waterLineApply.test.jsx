/**
 * Pickett and Hingle water-line fits (CrossplotPanel), PETRO-M-004 and 005,
 * found while writing the user manual (2026-10-07):
 * - the water-zone boxes were read as metres in a feet session, so 6807 ft
 *   looked for water 6807 m down;
 * - Apply left the previous Rw tool's label (and never set 'pickett'), and
 *   with the temperature model on it kept that tool's reference temperature,
 *   so a Rw read at the water zone's own temperature was corrected again.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CrossplotPanel from '../components/CrossplotPanel';
import { computeWell, DEFAULT_PARAMS } from '../engine/pipeline';
import { tempAtDepth } from '../engine/temperature';
import typewell from '../../../../../packages/engines/test-data/petrophysics/typewell.json';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

const curve = (name) => Float64Array.from(typewell.curves[name], (v) => (v === null ? NaN : v));
const curves = { DEPT: curve('DEPT'), GR: curve('GR'), RHOB: curve('RHOB'), NPHI: curve('NPHI'), DT: curve('DT'), RT: curve('RT') };
const FT = 0.3048;

function setup({ plot, depthUnit, params }) {
  const onApplyParams = jest.fn();
  const onStatus = jest.fn();
  const p = { ...DEFAULT_PARAMS, phiShale: typewell.params.phi_shale, ...params };
  const { outputs } = computeWell(curves, p);
  render(
    <CrossplotPanel
      curves={curves} outputs={outputs} params={p} facies={[]} onFaciesChange={() => {}}
      onApplyParams={onApplyParams} onStatus={onStatus}
      initialConfig={{ plot }} onConfigChange={() => {}} depthUnit={depthUnit}
    />,
  );
  return { onApplyParams, onStatus, p };
}

// the type well's aquifer, 2075 to 2078 m MD (the e2e Pickett window)
const TOP_M = 2075; const BASE_M = 2078;

test('Pickett in a feet session: the boxes are feet, the fit finds the aquifer, Apply labels it and sets the zone temperature', () => {
  const { onApplyParams, p } = setup({ plot: 'pickett', depthUnit: 'ft', params: { tempMode: 'linear', rwRefTempC: 25, rwMethod: 'salinity' } });
  expect(screen.getAllByText('Water zone (ft MD)').length).toBeGreaterThan(0);
  fireEvent.change(screen.getByTestId('petro-pickett-top'), { target: { value: String(TOP_M / FT) } });
  fireEvent.change(screen.getByTestId('petro-pickett-base'), { target: { value: String(BASE_M / FT) } });
  fireEvent.click(screen.getByTestId('petro-pickett-fit'));
  expect(screen.getByTestId('petro-pickett-result')).toHaveTextContent('m = 2.000');
  fireEvent.click(screen.getByTestId('petro-pickett-apply'));
  const patch = onApplyParams.mock.calls.at(-1)[0];
  expect(patch.rwMethod).toBe('pickett');
  expect(patch.rwRefTempC).toBeCloseTo(tempAtDepth((TOP_M + BASE_M) / 2, p), 2);
  expect(patch.rwRefTempC).not.toBe(25); // negative control: the salinity tool's reference temperature is gone
});

test('Hingle: Apply labels the Hingle fit; with no temperature model the reference temperature is left alone', () => {
  const { onApplyParams } = setup({ plot: 'hingle', depthUnit: 'm', params: { rwMethod: 'arps' } });
  fireEvent.change(screen.getByTestId('petro-hingle-top'), { target: { value: String(TOP_M) } });
  fireEvent.change(screen.getByTestId('petro-hingle-base'), { target: { value: String(BASE_M) } });
  fireEvent.click(screen.getByTestId('petro-hingle-fit'));
  fireEvent.click(screen.getByTestId('petro-hingle-apply'));
  const patch = onApplyParams.mock.calls.at(-1)[0];
  expect(patch.rwMethod).toBe('hingle');
  expect('rwRefTempC' in patch).toBe(false);
  expect(patch.rw).toBeGreaterThan(0);
});

test('negative control: metre values typed in a feet session find no water zone', () => {
  const { onStatus } = setup({ plot: 'pickett', depthUnit: 'ft', params: {} });
  fireEvent.change(screen.getByTestId('petro-pickett-top'), { target: { value: String(TOP_M) } });
  fireEvent.change(screen.getByTestId('petro-pickett-base'), { target: { value: String(BASE_M) } });
  fireEvent.click(screen.getByTestId('petro-pickett-fit'));
  expect(screen.queryByTestId('petro-pickett-result')).toBeNull();
  expect(onStatus).toHaveBeenCalled();
});
