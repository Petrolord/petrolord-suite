/**
 * Crossplot colouring (2026-10-08, owner review: bright colours that carry
 * information). With no saved choice and no facies, points colour by shale
 * volume on the Turbo map; the map is selectable; depth colours read in the
 * session's unit.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CrossplotPanel from '../components/CrossplotPanel';
import { computeWell, DEFAULT_PARAMS } from '../engine/pipeline';
import { COLOR_MAPS } from '@/utils/colorMaps';
import typewell from '../../../../../packages/engines/test-data/petrophysics/typewell.json';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
const curve = (name) => Float64Array.from(typewell.curves[name], (v) => (v === null ? NaN : v));
const curves = { DEPT: curve('DEPT'), GR: curve('GR'), RHOB: curve('RHOB'), NPHI: curve('NPHI'), DT: curve('DT'), RT: curve('RT') };

function mount(extra = {}) {
  const params = { ...DEFAULT_PARAMS };
  const { outputs } = computeWell(curves, params);
  const onConfigChange = jest.fn();
  render(<CrossplotPanel curves={curves} outputs={outputs} params={params} facies={[]} onFaciesChange={() => {}}
    onApplyParams={() => {}} onStatus={() => {}} initialConfig={{ plot: 'pickett' }} onConfigChange={onConfigChange} depthUnit="ft" {...extra} />);
  return { onConfigChange };
}

test('no saved choice and no facies: colour by Vsh on Turbo, and the choice is saved', () => {
  const { onConfigChange } = mount();
  expect(screen.getByTestId('petro-colorby')).toHaveValue('VSH');
  expect(screen.getByTestId('petro-colormap')).toHaveValue('turbo');
  fireEvent.change(screen.getByTestId('petro-colormap'), { target: { value: 'viridis' } });
  expect(onConfigChange.mock.calls.at(-1)[0]).toMatchObject({ colorBy: 'VSH', colorMap: 'viridis' });
});

test('negative control: a saved facies choice is kept and no colour-map picker shows', () => {
  mount({ initialConfig: { plot: 'pickett', colorBy: 'facies' } });
  expect(screen.getByTestId('petro-colorby')).toHaveValue('facies');
  expect(screen.queryByTestId('petro-colormap')).toBeNull();
});

test('Turbo runs from blue through green to deep red', () => {
  const [r0, , b0] = COLOR_MAPS.turbo.fn(0.15);
  const [, g5] = COLOR_MAPS.turbo.fn(0.5);
  const [r1, , b1] = COLOR_MAPS.turbo.fn(1);
  expect(b0).toBeGreaterThan(r0);
  expect(g5).toBeGreaterThan(200);
  expect(r1).toBeGreaterThan(b1);
});
