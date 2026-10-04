/**
 * WTA-U1-021: typing a decimal under SI in the Nodal Analysis Studio. The
 * UnitField re-rendered the stored oilfield value converted back on every
 * key, so the decimal point vanished: "13.7" m of node depth was stored as
 * 137 m. Same defect class as Well Test WTA-U1-017. Every Nodal SI input
 * (InputCards, Panels) goes through UnitField, so this gate covers them all.
 */
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnitField } from '../primitives';
import { toOilfield, displayInputString } from '@/utils/nodal/units';

function Host({ kind, initial = '' }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <UnitField kind={kind} system="si" label="X" value={v} onChange={setV} />
      <span data-testid="stored">{v}</span>
      <button type="button" onClick={() => setV('100')}>external</button>
    </>
  );
}
const stored = () => Number(screen.getByTestId('stored').textContent);

test.each([
  ['length', '13.7'],
  ['pressure', '0.5'],
  ['diameter', '62.0'],
  ['oilRate', '2.5'],
  ['gasLiquidRatio', '17.81'],
  ['productivityIndex', '0.0123'],
  ['temperature', '93.3'],
  ['liquidRate', '1e3'],
])('UnitField %s: typing %s key by key keeps what was typed and stores the oilfield twin', async (kind, typed) => {
  render(<Host kind={kind} initial="45" />);
  const input = screen.getByRole('textbox');
  await userEvent.clear(input);
  await userEvent.type(input, typed);
  expect(input.value).toBe(typed);
  const oil = toOilfield(kind, Number(typed), 'si');
  expect(stored() / oil).toBeCloseTo(1, 9);
  fireEvent.blur(input);
  expect(stored() / oil).toBeCloseTo(1, 9);
});

test('"2." stays "2." while typing, then 2.5', async () => {
  render(<Host kind="length" />);
  const input = screen.getByRole('textbox');
  await userEvent.type(input, '2.');
  expect(input.value).toBe('2.');
  await userEvent.type(input, '5');
  expect(input.value).toBe('2.5');
  expect(stored() / toOilfield('length', 2.5, 'si')).toBeCloseTo(1, 9);
});

test('a value set from elsewhere replaces the draft', async () => {
  render(<Host kind="length" initial="45" />);
  const input = screen.getByRole('textbox');
  await userEvent.clear(input);
  await userEvent.type(input, '13.');
  fireEvent.click(screen.getByText('external'));
  expect(input.value).toBe(displayInputString('length', '100', 'si'));
});

test('blur shows the converted stored value again', async () => {
  render(<Host kind="length" />);
  const input = screen.getByRole('textbox');
  await userEvent.type(input, '13.70');
  expect(input.value).toBe('13.70');
  fireEvent.blur(input);
  expect(input.value).toBe('13.7');
});
