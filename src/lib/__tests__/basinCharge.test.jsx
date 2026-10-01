/**
 * BF-U2-017: the charge a basin model expels, handed to ReservoirCalc Pro's
 * Prospect Risking and on to Risked Reserves Valuation (contract
 * src/lib/basinCharge.js). The chain: Basin's engine result becomes the
 * payload; ReservoirCalc Pro's panel reads it, compares the charge with the
 * prospect's mean and applies the suggested charge factor to Pg; the saved
 * prospect carries the record; Risked Reserves reads the Pg and names the
 * basin model.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SimulationEngine } from '../../../packages/engines/engines/basin/SimulationEngine';
import { buildBasinCharge, writeBasinCharge, readBasinCharge, chargeAssessment, expelledAt, BF_CHARGE_SCHEMA } from '../basinCharge';
import { referenceBasinRow } from '@/pages/apps/BasinFlowGenesis/services/backend';
import ProspectRiskingPanel from '@/pages/apps/ReservoirCalcPro/components/tools/ProspectRiskingPanel';
import { makeInMemoryProspectsBackend } from '@/pages/apps/ReservoirCalcPro/services/prospectsService';
import { fromRcpProspect } from '@/pages/apps/riskedreserves/services/rrvStore';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const row = referenceBasinRow();
const inputs = { stratigraphy: row.stratigraphy, heatFlow: row.heat_flow, erosionEvents: row.erosion_events, settings: row.settings };
let results; let payload;
beforeAll(async () => {
  results = await SimulationEngine.run(inputs);
  payload = buildBasinCharge(results, { name: 'Reference Basin', stratigraphy: inputs.stratigraphy, criticalMoment: 60, now: new Date('2026-10-01T12:00:00Z') });
}, 120000);

test('the payload is the engine result: the source, its expelled mass and its expulsion history', () => {
  expect(payload).toMatchObject({ schema: BF_CHARGE_SCHEMA, unit: { mass: 'kg/m2', age: 'Ma' }, hcDensityKgM3: 850 });
  expect(payload.sources).toHaveLength(1);
  const li = results.meta.layers.findIndex((l) => l.id === 'source_shale');
  const exp = results.data.expulsion[li];
  expect(payload.sources[0].expelledKgM2).toBe(exp[exp.length - 1].value);
  expect(payload.expelledKgM2).toBeGreaterThan(0);
  expect(expelledAt(payload, 0)).toBe(payload.expelledKgM2);
  expect(expelledAt(payload, 1000)).toBe(0);
  expect(() => buildBasinCharge(results, { stratigraphy: inputs.stratigraphy.map((l) => ({ ...l, sourceRock: { isSource: false } })) })).toThrow(/no source rock/);
});

test('the assessment is arithmetic on the model: charge after the trap, in MMboe, against the requirement', () => {
  const mid = payload.sources[0].expulsion.find((e) => e.value > 0.4 * payload.expelledKgM2).age;
  const a = chargeAssessment(payload, { fetchAreaKm2: 100, trapAgeMa: mid, efficiency: 0.1, requiredMMboe: 50 });
  expect(a.ok).toBe(true);
  const after = payload.expelledKgM2 - expelledAt(payload, mid);
  expect(a.expelledAfterTrapKgM2).toBeCloseTo(after, 9);
  expect(a.chargeMMboe).toBeCloseTo((after * 100e6 * 0.1) / 850 / 0.158987294928 / 1e6, 9);
  expect(a.ratio).toBeCloseTo(a.chargeMMboe / 50, 12);
  // an old trap catches everything; a trap younger than the last expulsion catches nothing
  const all = chargeAssessment(payload, { fetchAreaKm2: 100, trapAgeMa: 200, requiredMMboe: 50 });
  expect(all.beforeTrapFraction).toBe(0);
  expect(all.chargeMMboe).toBeGreaterThan(a.chargeMMboe);
  const late = chargeAssessment(payload, { fetchAreaKm2: 100, trapAgeMa: 0, requiredMMboe: 50 });
  expect(late).toMatchObject({ factor: 0.05, band: 'no charge after the trap formed' });
  // the bands
  const want = (ratio) => chargeAssessment(payload, { fetchAreaKm2: 100, trapAgeMa: 200, requiredMMboe: all.chargeMMboe / ratio }).factor;
  expect([0.05, 0.3, 0.7, 1.5, 5].map(want)).toEqual([0.1, 0.3, 0.5, 0.7, 0.9]);
  expect(chargeAssessment(payload, { fetchAreaKm2: 0, trapAgeMa: 10 }).ok).toBe(false);
  expect(chargeAssessment(payload, { fetchAreaKm2: 10, trapAgeMa: 10, efficiency: 2 }).ok).toBe(false);
});

test('a payload in other units or another schema is refused', () => {
  const st = { m: new Map(), getItem(k) { return this.m.get(k) ?? null; }, setItem(k, v) { this.m.set(k, v); }, removeItem(k) { this.m.delete(k); }, key(i) { return [...this.m.keys()][i] ?? null; }, get length() { return this.m.size; } };
  writeBasinCharge({ ...payload, id: 'lb', unit: { mass: 'lb/ft2', age: 'Ma' } }, st);
  expect(readBasinCharge('lb', st)).toMatchObject({ ok: false, reason: expect.stringMatching(/lb\/ft2/) });
  writeBasinCharge({ ...payload, id: 'v2', schema: 'bf-charge/2' }, st);
  expect(readBasinCharge('v2', st).ok).toBe(false);
  expect(readBasinCharge('none', st).ok).toBe(false);
});

test('the chain: ReservoirCalc Pro applies the suggested charge factor, the prospect keeps the record, Risked Reserves names it', async () => {
  writeBasinCharge(payload);
  window.history.pushState({}, '', `/?bfCharge=${payload.id}`);
  const backend = makeInMemoryProspectsBackend([]);
  render(<ProspectRiskingPanel backend={backend} unrisked={{ mean: 40, p90: 12, p50: 33, p10: 78, unit: 'MMbbl', basis: 'in-place' }} />);
  const note = await screen.findByTestId('rcp-bf-charge');
  expect(note).toHaveTextContent('Charge from the basin model: Reference Basin');
  expect(screen.getByTestId('rcp-bf-charge-result')).toHaveTextContent('Give the fetch (drainage) area in km2.');
  fireEvent.change(screen.getByTestId('rcp-bf-charge-area'), { target: { value: '100' } });
  fireEvent.change(screen.getByTestId('rcp-bf-charge-trap'), { target: { value: '200' } });
  const want = chargeAssessment(payload, { fetchAreaKm2: 100, trapAgeMa: 200, efficiency: 0.1, requiredMMboe: 40 });
  await waitFor(() => expect(screen.getByTestId('rcp-bf-charge-result')).toHaveTextContent(`Suggested charge factor ${want.factor}`));
  fireEvent.click(screen.getByTestId('rcp-bf-charge-apply'));
  expect(screen.getByTestId('pgv-charge')).toHaveTextContent(`${(want.factor * 100).toFixed(1)}%`);
  fireEvent.change(screen.getByTestId('prospect-name'), { target: { value: 'Keta North' } });
  fireEvent.click(screen.getByTestId('prospect-add'));
  await waitFor(async () => expect(await backend.listProspects()).toHaveLength(1));
  const saved = (await backend.listProspects())[0];
  expect(saved.pg_factors.charge).toBe(want.factor);
  expect(saved.inputs.bfCharge).toMatchObject({ schema: BF_CHARGE_SCHEMA, model: 'Reference Basin', fetchAreaKm2: 100, trapAgeMa: 200, suggestedFactor: want.factor, appliedFactor: want.factor });
  const rrv = fromRcpProspect(saved);
  expect(rrv.pg).toBeCloseTo(0.6 * 0.7 * want.factor * 0.7, 9);
  expect(rrv.chargeNote).toMatch(/charge from the basin model Reference Basin/);
  // control: a prospect with no handoff carries no charge note
  expect(fromRcpProspect({ id: 'x', name: 'n', pg_factors: { charge: 0.8 }, inputs: { mean: 10, unit: 'MMbbl', basis: 'recoverable' }, risked: {} }).chargeNote).toBe('');
  window.history.pushState({}, '', '/');
}, 120000);
