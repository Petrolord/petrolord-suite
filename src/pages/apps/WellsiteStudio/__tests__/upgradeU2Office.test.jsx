// Wellsite Studio upgrade U2-007 (2026-10-01): the office view. A second
// device (the rig) pushes rows to the fake server; the office follows the
// well, reads the same lag and tops services the rig reads, and writes
// nothing. Status words come from the follow that happened (PL4).
import 'fake-indexeddb/auto';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellsiteWorkstation from '../components/WellsiteWorkstation';
import { openWellsiteDb } from '@/lib/wellsite/db';
import { makeLocalBackend } from '../services/localBackend';
import { makeFakeTransport } from '../services/transports/fakeTransport';
import { seedWellsite, SEED_REGISTRY_WELLS } from '../services/seed';
import { officeRow, awaitingText, followText } from '../services/office';
import { lagNow } from '../services/samples';
import { assertBackend } from '../services/backendPort';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, dock, statusBar }) => <div data-testid="ws-desktop">{ribbon}{explorer}{center}{dock}{statusBar}</div> }));

const FT = 0.3048;
let n = 0;
async function make() {
  const db = openWellsiteDb(`ws-u2-office-${n += 1}`);
  const transport = makeFakeTransport({ registryWells: SEED_REGISTRY_WELLS });
  const backend = assertBackend(makeLocalBackend({ transport, db, autoSync: false }));
  const well = await seedWellsite(backend);
  return { db, transport, backend, well };
}
// a bit depth pushed by the rig's device, as the server holds it
const rigBit = (well, ft, min = 1) => ({ id: `rig-bit-${ft}`, well_id: well.id, kind: 'observation', subtype: 'bit_depth', chain_id: `rig-bit-${ft}`, version_no: 1, occurred_at: new Date(Date.now() + min * 60000).toISOString(), local_offset_min: 60,
  depth_value: ft, depth_unit: 'ft', depth_ref: 'MD', depth_datum: 'RT', depth_kind: 'bit_depth', md_calc_m: ft * FT, tvd_calc_m: ft * FT * 0.95, payload: { source: 'manual' }, evidence_ids: [], created_by: 'user-rig', client_created_at: new Date().toISOString(), schema_version: 1 });

describe('service: the summary reads what the rig reads and writes nothing', () => {
  test('bit, lag, awaiting and the follow record, with no write to the store', async () => {
    const { backend, transport, well, db } = await make();
    await backend.addTop(well.id, { role: 'official', status: 'preliminary', name: 'Top Agbada', formationKey: 'top_agbada', basis: 'GR drop', depth: { value: 10168, unit: 'ft', reference: 'MD', datum: 'KB', kind: 'logged' } });
    const outboxBefore = await db.outbox.count();
    const recordsBefore = await db.records.count();
    const snap0 = await backend.wellSnapshot(well.id);
    const row0 = officeRow({ ...snap0, nowMs: Date.now() });
    expect(row0.bitMdM).toBeCloseTo(10000 * FT, 6);
    // the same lag the rig's panel shows
    const bits = snap0.records.filter((r) => r.subtype === 'bit_depth'); const pumps = snap0.records.filter((r) => r.subtype === 'pump_rate');
    const cfg = snap0.records.find((r) => r.subtype === 'rig_config').payload;
    expect(row0.lagStrokes).toBeCloseTo(lagNow({ well: snap0.well, rigConfig: cfg, bitDepths: bits, pumpEvents: pumps, nowUtcMs: Date.now() }).lagStrokes, 6);
    expect(row0.awaitingFinal).toEqual([{ name: 'Top Agbada', status: 'preliminary', mdM: expect.any(Number) }]);
    expect(awaitingText(row0)).toEqual(['1 call(s) not yet final (Top Agbada, preliminary)']);
    expect(snap0.follow).toBeNull();
    expect(followText(null, true)).toBe('not followed yet on this device');
    // the rig drills ahead on its own device: the office sees it only after a follow
    transport.plant('ws_records', rigBit(well, 10050));
    expect(officeRow({ ...(await backend.wellSnapshot(well.id)), nowMs: Date.now() }).bitMdM).toBeCloseTo(10000 * FT, 6);
    const f = await backend.followWell(well.id);
    expect(f).toMatchObject({ error: null, received: 1 });
    const snap1 = await backend.wellSnapshot(well.id);
    expect(officeRow({ ...snap1, nowMs: Date.now() + 120000 }).bitMdM).toBeCloseTo(10050 * FT, 6);
    expect(followText(snap1.follow, true)).toBe('1 new row(s)');
    expect((await backend.followWell(well.id)).received).toBe(0);
    expect(followText((await backend.wellSnapshot(well.id)).follow, true)).toBe('up to date');
    // read only: nothing queued for the server, one row more (the pulled one), none made here
    expect(await db.outbox.count()).toBe(outboxBefore);
    expect(await db.records.count()).toBe(recordsBefore + 1);
    expect((await db.records.get('rig-bit-10050')).sync_state).toBe('synced');
  });
  test('a failed follow says so and keeps the time of the last good one; offline claims nothing', async () => {
    const { backend, transport, well } = await make();
    await backend.followWell(well.id);
    const good = (await backend.wellSnapshot(well.id)).follow.atUtc;
    transport._server.knobs.failNext = 1;
    const bad = await backend.followWell(well.id);
    expect(bad).toMatchObject({ error: 'Failed to fetch', atUtc: good });
    expect(followText(bad, true)).toBe('last try failed (Failed to fetch); showing what this device held');
    transport.setOnline(false);
    expect(await backend.followWell(well.id)).toMatchObject({ offline: true });
    expect((await backend.wellSnapshot(well.id)).follow.error).toBe('Failed to fetch');
    expect(followText(null, false)).toBe('not followed yet; no connection');
  });
  test('an unsigned report and a signed one: only the unsigned one awaits', () => {
    const well = { id: 'w', name: 'W', header: { kb_elev_m: 25 }, settings: {}, survey: null };
    const reports = [{ id: 'r1', kind: 'daily', period_start: 'a', report_date: '2026-09-30', version_no: 1 }, { id: 'r2', kind: 'daily', period_start: 'a', report_date: '2026-09-30', version_no: 2 }, { id: 'r3', kind: 'daily', period_start: 'b', report_date: '2026-10-01', version_no: 1 }];
    const row = officeRow({ well, reports, signoffs: [{ report_id: 'r2' }], nowMs: Date.now() });
    expect(row.unsignedReports).toEqual([{ id: 'r3', kind: 'daily', date: '2026-10-01', version: 1 }]);
    expect(awaitingText(row)).toEqual(['1 report(s) with no sign-off (daily 2026-10-01)']);
    // signing an older version does not sign the newer one
    expect(officeRow({ well, reports, signoffs: [{ report_id: 'r1' }], nowMs: Date.now() }).unsignedReports.map((r) => r.id)).toEqual(['r2', 'r3']);
    expect(row.bitMdM).toBeNull();
  });
});

test('screen: the office page lists the well, follows the rig and opens the well', async () => {
  const { backend, transport, well } = await make();
  await backend.addTop(well.id, { role: 'official', status: 'preliminary', name: 'Top Agbada', formationKey: 'top_agbada', basis: 'GR drop', depth: { value: 10168, unit: 'ft', reference: 'MD', datum: 'KB', kind: 'logged' } });
  render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  fireEvent.click(screen.getByTestId('ws-nav-office'));
  await waitFor(() => expect(screen.getByTestId('ws-office-bit-KETA-2')).toHaveTextContent('10000 ft'));
  expect(screen.getByTestId('ws-office-readonly')).toHaveTextContent('Read only.');
  expect(screen.getByTestId('ws-office-awaiting-KETA-2')).toHaveTextContent('1 call(s) not yet final (Top Agbada, preliminary)');
  await waitFor(() => expect(screen.getByTestId('ws-office-follow-KETA-2')).toHaveTextContent(/rig: up to date/));
  transport.plant('ws_records', rigBit(well, 10050));
  await act(async () => { fireEvent.click(screen.getByTestId('ws-office-refresh')); });
  await waitFor(() => expect(screen.getByTestId('ws-office-bit-KETA-2')).toHaveTextContent('10050 ft'));
  expect(screen.getByTestId('ws-office-follow-KETA-2')).toHaveTextContent(/1 new row\(s\)/);
  // the link drops: the page says so and keeps what it holds
  transport.setOnline(false);
  await act(async () => { fireEvent.click(screen.getByTestId('ws-office-refresh')); });
  await waitFor(() => expect(screen.getByTestId('ws-office-offline')).toHaveTextContent('No connection: showing what this device holds.'));
  expect(screen.getByTestId('ws-office-bit-KETA-2')).toHaveTextContent('10050 ft');
  fireEvent.click(screen.getByTestId('ws-office-open-KETA-2'));
  await waitFor(() => expect(screen.getByTestId('ws-live')).toBeInTheDocument());
});
