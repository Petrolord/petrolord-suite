// WS0: the local store is the system of record. A commit writes the row
// and its outbox entry in one transaction, depth and time rules refuse
// incomplete records, and the depth-window query over the reference-well
// volume stays under budget.
import 'fake-indexeddb/auto';
import { openWellsiteDb } from '@/lib/wellsite/db';
import { makeLocalBackend } from '../services/localBackend';
import { makeFakeTransport } from '../services/transports/fakeTransport';
import { seedWellsite, SEED_REGISTRY_WELLS, SEED_USER } from '../services/seed';
import { assertBackend } from '../services/backendPort';
import { chainHeads, currentObservations } from '@/lib/wellsite/records';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

let n = 0;
function fresh() {
  const db = openWellsiteDb(`ws-test-${n += 1}`);
  const transport = makeFakeTransport({ user: SEED_USER, registryWells: SEED_REGISTRY_WELLS });
  return { db, transport, backend: makeLocalBackend({ transport, db, autoSync: false }) };
}

test('the backend satisfies the port', () => {
  expect(() => assertBackend(fresh().backend)).not.toThrow();
  expect(() => assertBackend({})).toThrow(/missing/);
});

test('seed creates the well and its opening records; the bit is at 10000 ft RT', async () => {
  const { backend } = fresh();
  const well = await seedWellsite(backend);
  expect(well.name).toBe('KETA-2');
  expect(well.header.kb_elev_m).toBe(25);
  const bit = await backend.latestRecord(well.id, 'bit_depth');
  expect(bit.depth_value).toBe(10000);
  expect(bit.depth_unit).toBe('ft');
  expect(bit.md_calc_m).toBeCloseTo(3048, 6);
  expect(bit.calc_method).toBe('minimum_curvature');
  expect(bit.survey_version).toBe('registry-1');
  expect(bit.tvd_calc_m).toBeLessThan(bit.md_calc_m);
  expect(bit.local_offset_min).toBe(60);
  expect(bit.created_by).toBe('user-a');
  expect(bit.sync_state).toBe('pending');
  const pumps = await backend.listRecords(well.id, { subtype: 'pump_rate' });
  expect(pumps.map((p) => p.payload.spm)).toEqual([60, 0, 60]);
});

test('a commit writes the row and its outbox entry together, and a refused record writes nothing', async () => {
  const { backend, db } = fresh();
  const well = await seedWellsite(backend);
  const before = await db.outbox.count();
  const { row } = await backend.addRecord(well.id, { kind: 'observation', subtype: 'note', payload: { text: 'hello' } });
  expect(await db.records.get(row.id)).toBeTruthy();
  expect(await db.outbox.count()).toBe(before + 1);
  const ob = await db.outbox.where('entity_id').equals(row.id).first();
  expect(ob).toMatchObject({ table: 'ws_records', op: 'insert', status: 'pending', well_id: well.id });
  await expect(backend.addRecord(well.id, { kind: 'observation', subtype: 'note', depth: { value: 100, unit: 'ft' } })).rejects.toThrow(/reference/);
  await expect(backend.addRecord(well.id, { kind: 'interpretation', payload: {} })).rejects.toThrow(/confidence/);
  await expect(backend.addRecord(well.id, { kind: 'decision', payload: { statement: 'x' } })).rejects.toThrow(/basis/);
  expect(await db.outbox.count()).toBe(before + 1);
});

test('versions and corrections keep every row; heads and current observations derive', async () => {
  const { backend } = fresh();
  const well = await seedWellsite(backend);
  const { row: i1 } = await backend.addRecord(well.id, { kind: 'interpretation', subtype: 'top', confidence: 'low', payload: { text: 'maybe' } });
  const { row: i2 } = await backend.addVersion(i1, { confidence: 'high', payload: { text: 'yes' } });
  expect(i2.chain_id).toBe(i1.chain_id);
  expect(i2.version_no).toBe(2);
  expect(i2.previous_version_id).toBe(i1.id);
  const chain = await backend.listRecords(well.id, { kind: 'interpretation' });
  expect(chain).toHaveLength(2);
  expect(chainHeads(chain).map((r) => r.id)).toEqual([i2.id]);
  const { row: o1 } = await backend.addRecord(well.id, { kind: 'observation', subtype: 'note', payload: { text: 'typo' } });
  const { row: o2 } = await backend.correctObservation(o1, { payload: { text: 'fixed' } });
  expect(o2.supersedes_id).toBe(o1.id);
  const notes = await backend.listRecords(well.id, { subtype: 'note' });
  expect(currentObservations(notes).map((r) => r.id)).toEqual([o2.id]);
  await expect(backend.addVersion(o1, { payload: {} })).rejects.toThrow(/immutable/);
});

test('settings patches queue as a well update and survive a refresh while pending', async () => {
  const { backend, db } = fresh();
  const well = await seedWellsite(backend);
  await backend.updateWellSettings(well.id, { rig_offset_min: 120 });
  const w = await backend.getWell(well.id);
  expect(w.settings.rig_offset_min).toBe(120);
  expect(w.settings.tour_starts_local).toEqual(['06:00', '18:00']);
  expect((await db.outbox.where('entity_id').equals(well.id).first()).op).toBe('update');
  await backend.refreshWells();
  expect((await backend.getWell(well.id)).settings.rig_offset_min).toBe(120);
  const { row } = await backend.addRecord(well.id, { kind: 'event', subtype: 'connection' });
  expect(row.local_offset_min).toBe(120);
});

test('depth-window query over 10000 observations completes within budget', async () => {
  const { backend, db } = fresh();
  const well = await seedWellsite(backend);
  const list = [];
  for (let i = 0; i < 10000; i += 1) {
    list.push({ kind: 'observation', subtype: 'gas', occurredAt: new Date(Date.parse('2026-09-01T00:00:00Z') + i * 60000).toISOString(),
      depth: { value: 5000 + i, unit: 'ft', reference: 'MD', datum: 'RT', kind: 'lagged_sample' }, payload: { total_gas: i % 100 } });
  }
  const t0 = Date.now();
  await backend.addRecords(well.id, list);
  const built = Date.now() - t0;
  const t1 = Date.now();
  const rows = await backend.listRecords(well.id, { kind: 'observation', fromMd: 9000 * 0.3048, toMd: 9100 * 0.3048 });
  const queried = Date.now() - t1;
  expect(rows.length).toBeGreaterThanOrEqual(100);
  expect(rows.length).toBeLessThanOrEqual(102);
  expect(queried).toBeLessThan(200);
  expect(await db.outbox.count()).toBeGreaterThan(10000);
  expect(built).toBeLessThan(60000);
}, 90000);
