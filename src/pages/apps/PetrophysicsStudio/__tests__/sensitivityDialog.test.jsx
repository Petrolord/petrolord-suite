/** PETRO-U2-005: the dialog draws three sweeps with the current cutoff marked and the swing per cutoff. */
import React from 'react';
import { render, screen } from '@testing-library/react';
import SensitivityDialog from '../components/SensitivityDialog';
import { DEFAULT_PARAMS } from '../engine/pipeline';

const F = (a) => Float64Array.from(a);
const phi = [0.02, 0.05, 0.08, 0.10, 0.12, 0.15, 0.18, 0.20, 0.25, 0.30];
const curves = { DEPT: F([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) };
const outputs = { PHIE: F(phi), PHIT: F(phi), VSH: F(phi.map(() => 0.1)), SW: F([0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.3, 0.2, 0.2]) };

test('three charts, the current cutoff marked on each, the zone override honoured, feet shown in feet', () => {
  const zones = [{ id: 'z', name: 'Z', top_md_m: 0, base_md_m: 9 }];
  render(<SensitivityDialog open onOpenChange={() => {}} curves={curves} outputs={outputs}
    params={{ ...DEFAULT_PARAMS, cutPhi: 0.08, cutVsh: 0.5, cutSw: 0.6 }} zones={zones} zoneParams={{ z: { cutSw: 0.5 } }} depthUnit="ft" />);
  for (const k of ['cutPhi', 'cutVsh', 'cutSw']) {
    expect(screen.getByTestId(`petro-sensitivity-chart-${k}`)).toBeTruthy();
    expect(screen.getByTestId(`petro-sensitivity-chart-${k}-current`)).toBeTruthy();
  }
  expect(screen.getByTestId('petro-sensitivity-chart-cutSw-current').getAttribute('data-value')).toBe('0.5');
  // net pay at the zone's Sw 0.5: samples 4..9 = 6 m = 19.69 ft
  expect(screen.getByTestId('petro-sensitivity-current').textContent).toMatch(/net pay 19\.69 ft/);
  expect(screen.getByTestId('petro-sensitivity-swing-cutSw').textContent).toMatch(/%/);
});
