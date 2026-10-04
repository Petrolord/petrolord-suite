/**
 * WTA-U1-017 (S1, PL11): typing a decimal under SI. The field re-rendered
 * the stored oilfield value converted back on every key, so the decimal
 * point vanished: "13.7" m of net pay was stored as 137 m (449.5 ft), and
 * "0.108" m of wellbore radius as 108 m. Every UnitField and every inline
 * converted input (rate history, deliverability points, match parameters,
 * choke, recovered volume) goes through the same draft now.
 */
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnitField, UnitInput } from '../primitives';

function Host({ kind, initial = '', Comp = UnitField }) {
  const [v, setV] = useState(initial);
  return (
    <>
      {Comp === UnitField
        ? <UnitField kind={kind} system="si" label="X" value={v} onChange={setV} />
        : <UnitInput kind={kind} system="si" value={v} onChange={setV} aria-label="X" />}
      <span data-testid="stored">{v}</span>
      <button type="button" onClick={() => setV('100')}>external</button>
    </>
  );
}
const stored = () => Number(screen.getByTestId('stored').textContent);

test.each([
  ['length', '13.7', 13.7 / 0.3048],
  ['length', '0.108', 0.108 / 0.3048],
  ['pressure', '20684.5', 20684.5 / 6.894757293168361],
  ['compressibility', '0.0000017', 0.0000017 * 6.894757293168361],
])('UnitField %s: typing %s key by key keeps what was typed and stores the oilfield twin', async (kind, typed, oil) => {
  render(<Host kind={kind} initial="45" />);
  const input = screen.getByLabelText(/^X/);
  await userEvent.clear(input);
  await userEvent.type(input, typed);
  expect(input.value).toBe(typed);
  expect(stored() / oil).toBeCloseTo(1, 9);
  fireEvent.blur(input);
  expect(stored() / oil).toBeCloseTo(1, 9);
});

test('UnitInput (rate rows, match parameters): "2." stays "2." while typing, then 2.5', async () => {
  render(<Host kind="oilRate" Comp={UnitInput} />);
  const input = screen.getByLabelText('X');
  await userEvent.type(input, '2.');
  expect(input.value).toBe('2.');
  await userEvent.type(input, '5');
  expect(input.value).toBe('2.5');
  expect(stored() / (2.5 / 0.158987294928)).toBeCloseTo(1, 9);
});

test('a value set from elsewhere replaces the draft', async () => {
  render(<Host kind="length" initial="45" />);
  const input = screen.getByLabelText(/^X/);
  await userEvent.clear(input);
  await userEvent.type(input, '13.');
  fireEvent.click(screen.getByText('external'));
  expect(input.value).toBe(String(parseFloat((100 * 0.3048).toPrecision(10))));
});
