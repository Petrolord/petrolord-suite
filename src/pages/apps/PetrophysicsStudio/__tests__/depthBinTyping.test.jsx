/**
 * Depth density "Depth bin" box (CrossplotPanel): the box showed the stored
 * metre value converted and rounded back on every key, so a decimal point
 * never survived. "2." showed as "2", "0.5" could not be started (0 is
 * refused, so the old value came back) and "13.7" was stored as 137. The box
 * now keeps the typed text through the shared useUnitDraft hook.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CrossplotPanel from '../components/CrossplotPanel';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

const M_PER_FT = 0.3048;

function setup(depthUnit) {
  const onConfigChange = jest.fn();
  render(
    <CrossplotPanel
      curves={{}} outputs={{}} params={{ m: 2 }} facies={[]} onFaciesChange={() => {}}
      onApplyParams={() => {}} onStatus={() => {}}
      initialConfig={{ plot: 'density', density: { depthBinM: 5 } }}
      onConfigChange={onConfigChange} depthUnit={depthUnit}
    />,
  );
  const lastBinM = () => onConfigChange.mock.calls.at(-1)[0].density.depthBinM;
  return { input: screen.getByTestId('petro-density-depthbin'), lastBinM };
}

test.each([
  ['m', '2.', 2],
  ['m', '0.5', 0.5],
  ['m', '13.7', 13.7],
  ['ft', '2.', 2 * M_PER_FT],
  ['ft', '0.5', 0.5 * M_PER_FT],
  ['ft', '13.7', 13.7 * M_PER_FT],
])('depth bin in %s: typing %s key by key keeps it and stores the metre twin', async (unit, typed, metres) => {
  const { input, lastBinM } = setup(unit);
  await userEvent.clear(input);
  await userEvent.type(input, typed);
  expect(input.value).toBe(typed);
  expect(lastBinM()).toBeCloseTo(metres, 9);
});

test('a cleared box stores nothing (no NaN, no zero) and blur shows the kept bin', async () => {
  const { input, lastBinM } = setup('m');
  await userEvent.clear(input);
  expect(input.value).toBe('');
  expect(lastBinM()).toBe(5);
  fireEvent.blur(input);
  expect(input.value).toBe('5');
});
