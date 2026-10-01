// Wellsite Studio upgrade U2-004 (2026-10-01): the lag check and the washout,
// on the shipped service (which calls the engine) and on the real workstation,
// local database and fake transport. The numbers are never restated here: the
// expected count is built by the lag engine on a washed-out geometry, and the
// check must recover the washout and close the lag on it.
import 'fake-indexeddb/auto';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellsiteWorkstation from '../components/WellsiteWorkstation';
import { openWellsiteDb } from '@/lib/wellsite/db';
import { makeLocalBackend } from '../services/localBackend';
import { makeFakeTransport } from '../services/transports/fakeTransport';
import { seedWellsite, SEED_REGISTRY_WELLS, SEED_RIG_CONFIG } from '../services/seed';
import { lagNow, lagContextOf } from '../services/samples';
import { runLagCheck, lagCheckParams, washoutParams, currentWashout, lagCheckLabel, LAG_CHECK_SUBTYPE, WASHOUT_SUBTYPE } from '../services/lagCheck';
import { lagStrokesAt } from '@/lib/wellsite/lag';
import { withWashout, downStrokesAt } from '@/lib/wellsite/lagCheck';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, dock, statusBar }) => <div data-testid="ws-desktop">{ribbon}{explorer}{center}{dock}{statusBar}</div> }));

const FT = 0.3048;
const well = { id: 'w1', name: 'KETA-2', header: { kb_elev_m: 25 }, survey: { version: 'registry-1', stations: SEED_REGISTRY_WELLS[0].deviation }, settings: {} };
const T0 = Date.parse('2026-09-07T10:00:00Z');
const iso = (min) => new Date(T0 + min * 60000).toISOString();
const bits = [{ id: 'b1', kind: 'observation', occurred_at: iso(-120), md_calc_m: 9900 * FT }, { id: 'b2', kind: 'observation', occurred_at: iso(0), md_calc_m: 10000 * FT }];
const pumps = [{ id: 'p1', kind: 'observation', occurred_at: iso(-240), payload: { spm: 60 } }];
const gauge = lagContextOf(well, SEED_RIG_CONFIG);
const BIT = 10000 * FT;
// what a mudlogger would count if the open hole were 18 percent over gauge by volume
const countFor = (w) => lagStrokesAt(withWashout(gauge, w), BIT).lagStrokes + downStrokesAt(gauge, BIT).downStrokes;

describe('service: the check runs on the shipped lag and the washout closes it', () => {
  const lag = lagNow({ well, rigConfig: SEED_RIG_CONFIG, bitDepths: bits, pumpEvents: pumps, nowUtcMs: T0 });
  test('an 18 percent washout is recovered from the count', () => {
    const r = runLagCheck({ lag, totalStrokes: countFor(0.18) });
    expect(r.applies).toBe(true);
    expect(r.washoutFraction).toBeCloseTo(0.18, 9);
    expect(r.calculatedLagStrokes).toBeCloseTo(lag.lagStrokes, 9);
  });
  test('with the washout in force the lag readout equals the measured lag (identity)', () => {
    const r = runLagCheck({ lag, totalStrokes: countFor(0.18) });
    const dec = { id: 'd1', kind: 'decision', subtype: WASHOUT_SUBTYPE, occurred_at: iso(1), chain_id: 'd1', payload: washoutParams({ washoutFraction: r.washoutFraction, lagCheckId: 'c1' }).payload };
    const washout = currentWashout([dec]);
    expect(washout.fraction).toBeCloseTo(0.18, 9);
    const corrected = lagNow({ well, rigConfig: SEED_RIG_CONFIG, bitDepths: bits, pumpEvents: pumps, nowUtcMs: T0, washout });
    expect(Math.abs(corrected.lagStrokes - r.measuredLagStrokes)).toBeLessThan(1e-6);
    expect(corrected.washoutFraction).toBeCloseTo(0.18, 9);
    // negative control: without the decision the lag is still the gauge lag, short by the excess
    expect(r.measuredLagStrokes - lag.lagStrokes).toBeGreaterThan(100);
  });
  test('a second check with a washout in force still measures against gauge, never one washout on another', () => {
    const washout = { fraction: 0.18 };
    const corrected = lagNow({ well, rigConfig: SEED_RIG_CONFIG, bitDepths: bits, pumpEvents: pumps, nowUtcMs: T0, washout });
    const r = runLagCheck({ lag: corrected, totalStrokes: countFor(0.25) });
    expect(r.washoutFraction).toBeCloseTo(0.25, 9);
  });
  test('the decision chain: the latest version wins and zero clears it', () => {
    const v1 = { id: 'd1', kind: 'decision', subtype: WASHOUT_SUBTYPE, occurred_at: iso(1), chain_id: 'd1', payload: washoutParams({ washoutFraction: 0.18 }).payload };
    const v2 = { id: 'd2', kind: 'decision', subtype: WASHOUT_SUBTYPE, occurred_at: iso(5), chain_id: 'd1', previous_version_id: 'd1', payload: washoutParams({ washoutFraction: 0 }).payload };
    expect(currentWashout([v1]).fraction).toBe(0.18);
    expect(currentWashout([v1, v2]).fraction).toBe(0);
    expect(v2.payload.statement).toMatch(/cleared/);
    expect(currentWashout([])).toBeNull();
  });
  test('hostile inputs are refused with a reason', () => {
    expect(() => runLagCheck({ lag: { available: false }, totalStrokes: 5000 })).toThrow(/needs the rig geometry/);
    expect(() => runLagCheck({ lag, totalStrokes: NaN })).toThrow(/Enter the strokes/);
    expect(() => washoutParams({ washoutFraction: -0.1 })).toThrow(/zero or more/);
    expect(() => washoutParams({ washoutFraction: 4 })).toThrow(/300 percent/);
    const short = runLagCheck({ lag, totalStrokes: 100 });
    expect(short.applies).toBe(false);
    expect(lagCheckLabel({ payload: lagCheckParams({ result: short }).payload })).toMatch(/no lag measured/);
  });
});

let n = 0;
async function setup() {
  const db = openWellsiteDb(`ws-u2-lag-${n += 1}`);
  const transport = makeFakeTransport({ registryWells: SEED_REGISTRY_WELLS });
  const backend = makeLocalBackend({ transport, db, autoSync: false });
  const w = await seedWellsite(backend);
  render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  return { backend, well: w };
}

test('screen: a count is checked, recorded and applied; the lag panel then says it is corrected', async () => {
  const { backend, well: w } = await setup();
  await waitFor(() => expect(screen.getByTestId('ws-lag-strokes')).toHaveTextContent(/\d+ stk/));
  const before = Number(screen.getByTestId('ws-lag-strokes').textContent.replace(/\D/g, ''));
  expect(screen.getByTestId('ws-lagcheck-inforce')).toHaveTextContent('none, gauge hole');
  fireEvent.change(screen.getByTestId('ws-lagcheck-strokes'), { target: { value: String(Math.round(countFor(0.18))) } });
  await waitFor(() => expect(screen.getByTestId('ws-lagcheck-washout')).toHaveTextContent(/18\.0 %/));
  expect(screen.getByTestId('ws-lagcheck-diameter')).toHaveTextContent(/13\.31 in \(gauge 12\.25 in\)/);
  expect(screen.getByTestId('ws-lagcheck-down')).toHaveTextContent(/stk \(\d+\.\d bbl\)/);
  await act(async () => { fireEvent.click(screen.getByTestId('ws-lagcheck-apply')); });
  await waitFor(() => expect(screen.getByTestId('ws-lag-washout')).toHaveTextContent('18.0 % of the open hole'));
  await waitFor(() => expect(screen.getByTestId('ws-lagcheck-inforce')).toHaveTextContent(/18\.0 % of the open hole, since \d\d:\d\d/));
  const after = Number(screen.getByTestId('ws-lag-strokes').textContent.replace(/\D/g, ''));
  expect(after).toBeGreaterThan(before + 100);
  expect(screen.getByTestId('ws-status')).toHaveTextContent('Open hole washout 18.0 percent applied to the lag.');
  // both records are in the local store and queued for sharing, the decision citing the check
  const checks = await backend.listRecords(w.id, { subtype: LAG_CHECK_SUBTYPE });
  const decisions = await backend.listRecords(w.id, { subtype: WASHOUT_SUBTYPE });
  expect(checks).toHaveLength(1);
  expect(decisions).toHaveLength(1);
  expect(decisions[0].evidence_ids).toEqual([checks[0].id]);
  expect(await backend.db.outbox.where('entity_id').equals(decisions[0].id).count()).toBe(1);
  // clearing it is a new version, and the lag returns to gauge
  await act(async () => { fireEvent.click(screen.getByTestId('ws-lagcheck-clear')); });
  await waitFor(() => expect(screen.getByTestId('ws-lagcheck-inforce')).toHaveTextContent('none, gauge hole'));
  await waitFor(() => expect(screen.queryByTestId('ws-lag-washout')).toBeNull());
  expect(Number(screen.getByTestId('ws-lag-strokes').textContent.replace(/\D/g, ''))).toBe(before);
});

test('screen: a count shorter than the gauge lag is recorded as counted and corrects nothing', async () => {
  await setup();
  await waitFor(() => expect(screen.getByTestId('ws-lag-strokes')).toHaveTextContent(/\d+ stk/));
  fireEvent.change(screen.getByTestId('ws-lagcheck-strokes'), { target: { value: String(Math.round(countFor(0) - 300)) } });
  await waitFor(() => expect(screen.getByTestId('ws-lagcheck-engine-note')).toHaveTextContent(/shorter than the calculated lag/));
  expect(screen.getByTestId('ws-lagcheck-apply')).toBeDisabled();
  expect(screen.queryByTestId('ws-lagcheck-washout')).toBeNull();
  await act(async () => { fireEvent.click(screen.getByTestId('ws-lagcheck-record')); });
  await waitFor(() => expect(screen.getByTestId('ws-lagcheck-last')).toHaveTextContent(/1 check\(s\) on record/));
  expect(screen.getByTestId('ws-lagcheck-inforce')).toHaveTextContent('none, gauge hole');
});
