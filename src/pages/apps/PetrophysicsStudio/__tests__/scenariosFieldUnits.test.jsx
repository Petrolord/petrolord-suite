/**
 * The Low, mid, high dialog in field units (2026-10-08, demo videos: an
 * oilfield session saw degC, m and us/m in this dialog while the parameter
 * panel showed field units). Cells show slowness and temperatures in the
 * session's system; the patch handed back is in engine units.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ScenariosDialog from '../components/ScenariosDialog';
import { DEFAULT_PARAMS } from '../engine/pipeline';
import typewell from '../../../../../packages/engines/test-data/petrophysics/typewell.json';

const curve = (name) => Float64Array.from(typewell.curves[name], (v) => (v === null ? NaN : v));
const curves = { DEPT: curve('DEPT'), GR: curve('GR'), RHOB: curve('RHOB'), NPHI: curve('NPHI'), DT: curve('DT'), RT: curve('RT') };

const M_PER_FT = 0.3048;
const params = { ...DEFAULT_PARAMS, dtMa: 182, tempMode: 'linear', bhtC: 90 };

function mount(unitSystem) {
  const onApply = jest.fn();
  render(<ScenariosDialog open onOpenChange={() => {}} params={params} scenarios={null} curves={curves} zoneParamList={[]}
    zones={[]} zoneParams={{}} onApply={onApply} onStatus={() => {}} unitSystem={unitSystem} />);
  return { onApply };
}

test('field units: slowness in us/ft and temperatures in degF, labels and values', () => {
  mount('field');
  const dlg = screen.getByTestId('petro-scenarios-dialog');
  expect(within(dlg).getByText('Δt matrix (µs/ft)')).toBeInTheDocument();
  expect(screen.getByTestId('petro-sc-global-dtMa')).toHaveTextContent(String(Number((182 * M_PER_FT).toPrecision(6))).slice(0, 5));
  expect(screen.getByTestId('petro-sc-global-bhtC')).toHaveTextContent('194');
});

test('a Low value typed in us/ft is applied in us/m', () => {
  const { onApply } = mount('field');
  fireEvent.change(screen.getByTestId('petro-sc-Low-dtMa'), { target: { value: '60' } });
  fireEvent.click(screen.getByTestId('petro-scenarios-apply'));
  const patches = onApply.mock.calls.at(-1)[0];
  expect(patches.low.dtMa).toBeCloseTo(60 / M_PER_FT, 6);
  expect('dtMa' in (patches.high || {})).toBe(false);
});

test('negative control: an SI session shows us/m and degC as before', () => {
  mount('si');
  const dlg = screen.getByTestId('petro-scenarios-dialog');
  expect(within(dlg).getByText('Δt matrix (µs/m)')).toBeInTheDocument();
  expect(screen.getByTestId('petro-sc-global-bhtC')).toHaveTextContent('90');
});
