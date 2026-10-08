/**
 * Pickett and Hingle water-line fits leave shaly samples out (2026-10-08,
 * found on Ekene-1 while preparing the demo videos: the typed water leg held
 * shale beds and the fit returned m 0.61 instead of about 2). The panel's
 * "Clean if Vsh ≤" box defaults to 0.10; blank fits every sample.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CrossplotPanel from '../components/CrossplotPanel';
import { computeWell, DEFAULT_PARAMS } from '../engine/pipeline';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

// a water sand (GR 20, Archie a*Rw 0.08, m 2) with a shale bed every fourth sample
const N = 120;
const DEPT = Float64Array.from({ length: N }, (_, i) => 2000 + i * 0.1524);
const shale = (i) => i % 4 === 0;
const phiOf = (i) => 0.16 + 0.1 * ((i * 13) % 11) / 10;
const GR = Float64Array.from(DEPT, (_, i) => (shale(i) ? 120 : 20));
const RHOB = Float64Array.from(DEPT, (_, i) => (shale(i) ? 2.55 : 2.65 - phiOf(i) * 1.65));
const NPHI = Float64Array.from(DEPT, (_, i) => (shale(i) ? 0.35 : phiOf(i)));
const RT = Float64Array.from(DEPT, (_, i) => (shale(i) ? 1.9 : 0.08 / phiOf(i) ** 2));
const curves = { DEPT, GR, RHOB, NPHI, RT };

function setup() {
  const onApplyParams = jest.fn();
  const onStatus = jest.fn();
  const params = { ...DEFAULT_PARAMS, grClean: 20, grClay: 120, vshMethod: 'linear', rhoMa: 2.65, rhoFl: 1.0, phiSource: 'density' };
  const { outputs } = computeWell(curves, params);
  render(<CrossplotPanel curves={curves} outputs={outputs} params={params} facies={[]} onFaciesChange={() => {}}
    onApplyParams={onApplyParams} onStatus={onStatus} initialConfig={{ plot: 'pickett' }} onConfigChange={() => {}} depthUnit="m" />);
  fireEvent.change(screen.getByTestId('petro-pickett-top'), { target: { value: String(DEPT[0]) } });
  fireEvent.change(screen.getByTestId('petro-pickett-base'), { target: { value: String(DEPT[N - 1]) } });
  return { onApplyParams, onStatus };
}

test('the default clean-sand limit leaves the shale beds out and recovers m = 2', () => {
  setup();
  expect(screen.getByTestId('petro-pickett-clean-vsh')).toHaveValue('0.10');
  fireEvent.click(screen.getByTestId('petro-pickett-fit'));
  expect(screen.getByTestId('petro-pickett-result')).toHaveTextContent('m = 2.000');
  expect(screen.getByTestId('petro-pickett-result')).toHaveTextContent('a·Rw = 0.0800');
  expect(screen.getByTestId('petro-pickett-result')).toHaveTextContent('30 shaly left out');
});

test('negative control: a blank limit fits every sample and the shales flatten the line', () => {
  setup();
  fireEvent.change(screen.getByTestId('petro-pickett-clean-vsh'), { target: { value: '' } });
  fireEvent.click(screen.getByTestId('petro-pickett-fit'));
  const txt = screen.getByTestId('petro-pickett-result').textContent;
  const m = Number(/m = ([\d.]+)/.exec(txt)[1]);
  expect(Math.abs(m - 2)).toBeGreaterThan(0.5);
  expect(txt).not.toContain('shaly left out');
});
