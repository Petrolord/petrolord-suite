/**
 * Crossplot colour by a facies code curve (2026-10-17, Geoscience showcase):
 * a well's RP_FACIES (or any facies / CODE log) colours the points by
 * class, with a chip and a count per class; samples with no code are
 * counted apart; no colour-map picker shows for a categorical colouring.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CrossplotPanel from '../components/CrossplotPanel';
import { computeWell, DEFAULT_PARAMS } from '../engine/pipeline';
import typewell from '../../../../../packages/engines/test-data/petrophysics/typewell.json';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
const curve = (name) => Float64Array.from(typewell.curves[name], (v) => (v === null ? NaN : v));
const curves = { DEPT: curve('DEPT'), GR: curve('GR'), RHOB: curve('RHOB'), NPHI: curve('NPHI'), DT: curve('DT'), RT: curve('RT') };
const n = curves.DEPT.length;
// codes 0..3 in turn: 0 = inside no class
const RP = Float32Array.from({ length: n }, (_, i) => i % 4);
const rpRow = { mnemonic: 'RP_FACIES', unit: 'CODE', provenance: { kind: 'facies', codes: [{ code: 1, name: 'Hydrocarbon sand' }, { code: 2, name: 'Brine sand' }, { code: 3, name: 'Shale' }] } };

function mount(extra = {}) {
  const params = { ...DEFAULT_PARAMS };
  const { outputs } = computeWell(curves, params);
  const onConfigChange = jest.fn();
  render(<CrossplotPanel curves={curves} outputs={outputs} params={params} facies={[]} onFaciesChange={() => {}}
    onApplyParams={() => {}} onStatus={() => {}} initialConfig={{ plot: 'nd' }} onConfigChange={onConfigChange} depthUnit="ft"
    logs={{ RP_FACIES: RP, GR: curves.GR }} logRows={[{ mnemonic: 'GR', unit: 'GAPI' }, rpRow]} {...extra} />);
  return { onConfigChange };
}
const optionLabels = () => [...screen.getByTestId('petro-colorby').querySelectorAll('option')].map((o) => o.textContent);

test('the facies curve is offered, colours by class with counts, and the choice is saved', () => {
  const { onConfigChange } = mount();
  expect(optionLabels()).toContain('Facies curve RP_FACIES');
  expect(optionLabels()).not.toContain('Facies curve GR');
  fireEvent.change(screen.getByTestId('petro-colorby'), { target: { value: 'code:RP_FACIES' } });
  expect(onConfigChange.mock.calls.at(-1)[0]).toMatchObject({ colorBy: 'code:RP_FACIES' });
  const legend = screen.getByTestId('petro-code-legend');
  for (const name of ['Hydrocarbon sand', 'Brine sand', 'Shale']) expect(within(legend).getByTestId(`petro-code-chip-${name}`)).toBeInTheDocument();
  const count = (name) => Number(screen.getByTestId(`petro-code-count-${name}`).textContent);
  const none = Number(screen.getByTestId('petro-code-none').textContent.replace(/\D/g, ''));
  const total = count('Hydrocarbon sand') + count('Brine sand') + count('Shale') + none;
  expect(total).toBeGreaterThan(100);
  // about a quarter each, the codes cycle 0..3 (nulls in NPHI/RHOB drop a few)
  expect(Math.abs(count('Shale') - count('Brine sand'))).toBeLessThan(total * 0.05);
  expect(none).toBeGreaterThan(total * 0.2);
  expect(screen.queryByTestId('petro-colormap')).toBeNull();
});

test('negative controls: a code curve on another depth grid is not offered', () => {
  mount({ logs: { RP_FACIES: RP.slice(0, 10) } });
  expect(optionLabels().some((l) => l.startsWith('Facies curve'))).toBe(false);
});

test('a continuous colouring still shows its colour map and no class legend', () => {
  mount({ initialConfig: { plot: 'nd', colorBy: 'GR' } });
  expect(screen.getByTestId('petro-colormap')).toBeInTheDocument();
  expect(screen.queryByTestId('petro-code-legend')).toBeNull();
});
