/**
 * A unit change converts the values typed in Scenario & rock instead of
 * discarding them (found recording the QI videos: typing 180 degF, then
 * switching salinity to ppm, put the temperature back to 140).
 */
import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { DEFAULT_SCENARIO, DEFAULT_ROCK } from '../services/scenario';
import RockParamsPanel, { redisplayDraft } from '../components/RockParamsPanel';

function Host({ onApply }) {
  const [units, setUnits] = useState({ temperature: 'degC', pressure: 'MPa', gor: 'm3/m3', depth: 'm' });
  return (
    <RockParamsPanel scenario={DEFAULT_SCENARIO} rock={DEFAULT_ROCK} onApply={onApply}
      units={units} onUnit={(k, v) => setUnits((u) => ({ ...u, [k]: v }))} />
  );
}
const val = (id) => screen.getByTestId(id).value;
const type = (id, v) => fireEvent.change(screen.getByTestId(id), { target: { value: v } });

test('changing the salinity unit keeps a temperature typed but not applied', () => {
  render(<Host onApply={jest.fn()} />);
  type('rp-param-tC', '82.5');
  fireEvent.change(screen.getByTestId('rp-param-salinity-unit'), { target: { value: 'ppm' } });
  expect(val('rp-param-tC')).toBe('82.5');
  expect(val('rp-param-salinity')).toBe('35000');
});

test('changing the temperature and pressure units converts what is typed, and Apply sends SI', () => {
  const onApply = jest.fn();
  render(<Host onApply={onApply} />);
  type('rp-param-tC', '100');
  type('rp-param-pMPa', '20');
  fireEvent.change(screen.getByTestId('rp-param-tC-unit'), { target: { value: 'degF' } });
  fireEvent.change(screen.getByTestId('rp-param-pMPa-unit'), { target: { value: 'psi' } });
  expect(val('rp-param-tC')).toBe('212');
  expect(Number(val('rp-param-pMPa'))).toBeCloseTo(2900.755, 2);
  fireEvent.click(screen.getByTestId('rp-apply-params'));
  const c = onApply.mock.calls[0][0].scenario.conditions;
  expect(c.tC).toBeCloseTo(100, 6);
  expect(c.pMPa).toBeCloseTo(20, 6);
});

test('a blank field stays blank through a unit change (it is not turned into a number)', () => {
  const dr = { conditions: { tC: '', pMPa: '25', salinity: '0.035' }, fluidA: { hc: { kind: 'gas' } }, fluidB: { hc: { kind: 'gas' } } };
  const from = { temperature: 'degC', pressure: 'MPa', gor: 'm3/m3', salinity: 'frac' };
  const out = redisplayDraft(dr, from, { ...from, temperature: 'degF' }, 'm', 'm');
  expect(out.conditions.tC).toBe('');
  expect(out.conditions.pMPa).toBe('25');
});
