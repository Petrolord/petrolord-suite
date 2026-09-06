// WS6 sync engine on the fake server: idempotent push (a retried batch
// is harmless), backoff on a network failure, waiting on an expired
// token, a refused row isolated from the rest, photo order (row then
// blobs), pull by cursor bringing in what the office wrote, conflicts
// detected after a pull, and the state the pill shows.
import 'fake-indexeddb/auto';
import { openWellsiteDb } from '@/lib/wellsite/db';
import { drainOutbox, serverRow } from '@/lib/wellsite/sync/push';
import { pullWell } from '@/lib/wellsite/sync/pull';
import { detectConflicts } from '@/lib/wellsite/sync/conflicts';
import { classifyError, backoffMs } from '@/lib/wellsite/sync/errors';
import { makeSyncEngine } from '@/lib/wellsite/sync/engine';
import { getSyncState, syncHeadline, _resetSyncState } from '@/lib/wellsite/sync/syncStore';
import { makeLocalBackend } from '@/pages/apps/WellsiteStudio/services/localBackend';
import { makeFakeTransport } from '@/pages/apps/WellsiteStudio/services/transports/fakeTransport';
import { seedWellsite, SEED_REGISTRY_WELLS, SEED_USER } from '@/pages/apps/WellsiteStudio/services/seed';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/wellsite/photos/derive', () => ({
  derivePhotoVariants: async () => ({ thumb: { blob: new Blob(['t']), width: 32, height: 24, bytes: 1 }, working: { blob: new Blob(['w']), width: 64, height: 48, bytes: 1 }, original: null, width: 64, height: 48, sha256: 'x', contentType: 'image/webp' }),
}));

let n = 0;
async function fresh({ online = true } = {}) {
  _resetSyncState();
  const db = openWellsiteDb(`ws-sync-${n += 1}`);
  const transport = makeFakeTransport({ user: SEED_USER, registryWells: SEED_REGISTRY_WELLS, online });
  const backend = makeLocalBackend({ transport, db, autoSync: false });
  const well = await seedWellsite(backend);
  return { db, transport, backend, well };
}
const pendingOf = (db, wellId) => db.outbox.where('[well_id+status]').equals([wellId, 'pending']).count();

test('errors classify and back off', () => {
  expect(classifyError({ status: 0, message: 'Failed to fetch' })).toBe('transient');
  expect(classifyError({ status: 401 })).toBe('auth');
  expect(classifyError({ message: 'JWT expired' })).toBe('auth');
  expect(classifyError({ code: '42501', message: 'new row violates row-level security policy' })).toBe('rejected');
  expect(classifyError({ code: '23514' })).toBe('rejected');
  expect(classifyError({ status: 503 })).toBe('transient');
  expect(backoffMs(1, () => 0)).toBe(2000);
  expect(backoffMs(3, () => 0)).toBe(8000);
  expect(backoffMs(20, () => 0)).toBe(300000);
  expect(serverRow({ id: 'a', sync_state: 'pending', upload_state: 'local', server_seq: 3, x: 1 })).toEqual({ id: 'a', x: 1 });
});

test('push drains the seed in dependency order; a second push sends nothing; rows carry the server sequence', async () => {
  const { db, transport, well } = await fresh();
  const before = await pendingOf(db, well.id);
  expect(before).toBeGreaterThanOrEqual(9); // seven opening records, the programme decision, the prognosis
  const r = await drainOutbox({ db, transport, wellId: well.id });
  expect(r.pushed).toBe(before);
  expect(r.rejected).toBe(0);
  expect(await pendingOf(db, well.id)).toBe(0);
  const bit = (await db.records.where('[well_id+subtype+occurred_at]').between([well.id, 'bit_depth', ''], [well.id, 'bit_depth', '￿']).toArray())[0];
  expect(bit.sync_state).toBe('synced');
  expect(bit.server_seq).toBeGreaterThan(0);
  expect(transport._server.tables.get('ws_records').size).toBeGreaterThan(5);
  expect(transport._server.tables.get('ws_prognosis').size).toBe(1);
  const again = await drainOutbox({ db, transport, wellId: well.id });
  expect(again.pushed).toBe(0);
  const stored = transport._server.tables.get('ws_records').get(bit.id);
  expect(stored.sync_state).toBeUndefined();
});

test('a network failure retries with backoff; an expired token waits; a refused row is isolated and stays local', async () => {
  const { db, transport, backend, well } = await fresh();
  await drainOutbox({ db, transport, wellId: well.id });
  await backend.addRecord(well.id, { kind: 'observation', subtype: 'note', payload: { text: 'a' } });
  transport._server.knobs.failNext = 1;
  const now = Date.now();
  const r1 = await drainOutbox({ db, transport, wellId: well.id, now });
  expect(r1.pushed).toBe(0);
  expect(r1.retried).toBe(1);
  expect(r1.error).toMatch(/Failed to fetch/);
  const e = (await db.outbox.where('[well_id+status]').equals([well.id, 'pending']).toArray())[0];
  expect(e.attempts).toBe(1);
  expect(e.next_attempt_at).toBeGreaterThan(now);
  expect(e.error_kind).toBe('transient');
  expect((await drainOutbox({ db, transport, wellId: well.id, now })).pushed).toBe(0);
  transport._server.knobs.authNext = 1;
  const r2 = await drainOutbox({ db, transport, wellId: well.id, now: e.next_attempt_at + 1 });
  expect(r2.authWait).toBe(true);
  expect(await pendingOf(db, well.id)).toBe(1);
  const r3 = await drainOutbox({ db, transport, wellId: well.id, now: e.next_attempt_at + 20000 });
  expect(r3.pushed).toBe(1);
  const { row: good1 } = await backend.addRecord(well.id, { kind: 'observation', subtype: 'note', payload: { text: 'good 1' } });
  const { row: bad } = await backend.addTop(well.id, { role: 'official', status: 'final', name: 'Top X', formationKey: 'top_x', basis: 'b', depth: { value: 100, unit: 'm', reference: 'MD', datum: 'KB', kind: 'logged' } });
  const { row: good2 } = await backend.addTop(well.id, { role: 'official', status: 'preliminary', name: 'Top Y', formationKey: 'top_y', basis: 'b', depth: { value: 100, unit: 'm', reference: 'MD', datum: 'KB', kind: 'logged' } });
  transport._server.knobs.refuseFinal = true;
  const r4 = await drainOutbox({ db, transport, wellId: well.id, now: Date.now() + 400000 });
  expect(r4.rejected).toBe(1);
  expect(r4.pushed).toBe(2);
  expect((await db.tops.get(bad.id)).sync_state).toBe('rejected');
  expect((await db.tops.get(good2.id)).sync_state).toBe('synced');
  expect((await db.records.get(good1.id)).sync_state).toBe('synced');
  const rej = await db.outbox.where('[well_id+status]').equals([well.id, 'rejected']).toArray();
  expect(rej).toHaveLength(1);
  expect(rej[0].last_error).toMatch(/row-level security/);
});

test('a photo pushes its row first, then its blobs to the bucket, and reports backed up', async () => {
  const { db, transport, backend, well } = await fresh();
  await drainOutbox({ db, transport, wellId: well.id });
  const { row } = await backend.addPhoto(well.id, new File([new Uint8Array([1, 2])], 'p.jpg', { type: 'image/jpeg' }), { caption: 'c' });
  expect((await db.photos.get(row.id)).upload_state).toBe('local');
  const r = await drainOutbox({ db, transport, wellId: well.id });
  expect(r.pushed).toBe(1);
  expect((await db.photos.get(row.id)).upload_state).toBe('complete');
  expect([...transport._server.blobs.keys()].sort()).toEqual([`${row.storage_prefix}/thumb.webp`, `${row.storage_prefix}/working.webp`]);
  expect(transport._server.tables.get('ws_photos').get(row.id).variants.thumb.bytes).toBe(1);
});

test('pull brings in what the office wrote by cursor, keeps our pending rows, and finds the conflict', async () => {
  const { db, transport, backend, well } = await fresh();
  await drainOutbox({ db, transport, wellId: well.id });
  const { row: mine } = await backend.addTop(well.id, { role: 'official', status: 'preliminary', name: 'Top Agbada', formationKey: 'top_agbada', basis: 'rig', depth: { value: 10168, unit: 'ft', reference: 'MD', datum: 'RT', kind: 'logged' } });
  await drainOutbox({ db, transport, wellId: well.id });
  transport.plant('ws_tops', { ...serverRow(mine), id: 'office-top', chain_id: 'office-top', created_by: 'user-office', basis: 'office', md_calc_m: mine.md_calc_m + 2 });
  transport.plant('ws_records', { id: 'office-note', well_id: well.id, kind: 'observation', subtype: 'note', chain_id: 'office-note', version_no: 1, occurred_at: new Date().toISOString(), local_offset_min: 0, payload: { text: 'from town' }, evidence_ids: [], created_by: 'user-office', client_created_at: new Date().toISOString(), schema_version: 1 });
  const { row: pendingLocal } = await backend.addRecord(well.id, { kind: 'observation', subtype: 'note', payload: { text: 'not yet pushed' } });
  const p = await pullWell({ db, transport, wellId: well.id });
  // our own pushed rows come back and merely confirm; the two office rows are new
  expect(p.received).toBeGreaterThanOrEqual(2);
  expect(p.tables.ws_tops).toBe(2);
  expect((await db.tops.get('office-top')).sync_state).toBe('synced');
  expect((await db.records.get('office-note')).payload.text).toBe('from town');
  expect((await db.records.get(pendingLocal.id)).sync_state).toBe('pending');
  const cur = await db.cursors.get([well.id, 'ws_tops']);
  expect(cur.seq).toBeGreaterThan(0);
  expect((await pullWell({ db, transport, wellId: well.id })).received).toBe(0);
  const conflicts = await detectConflicts(db, well.id);
  expect(conflicts).toHaveLength(1);
  expect(conflicts[0]).toMatchObject({ entity: 'top', conflict: 'dual_call', subtype: 'top_agbada' });
  expect(conflicts[0].head_ids.sort()).toEqual([mine.id, 'office-top'].sort());
  expect(await db.conflicts.where('well_id').equals(well.id).count()).toBe(1);
});

test('the engine: offline it counts and waits; online it pushes, pulls and publishes the headline', async () => {
  const { db, transport, backend, well } = await fresh();
  transport.setOnline(false); // the link drops after the well was set up
  const engine = makeSyncEngine({ db, transport, wellIdOf: () => well.id, intervalMs: 3600000 });
  await engine.flush('test');
  let s = getSyncState();
  expect(s.online).toBe(false);
  expect(s.pending).toBeGreaterThanOrEqual(9);
  expect(syncHeadline(s)).toMatchObject({ state: 'offline' });
  transport.setOnline(true);
  await engine.flush('online');
  s = getSyncState();
  expect(s.pending).toBe(0);
  expect(s.phase).toBe('idle');
  expect(s.lastSyncUtc).toBeTruthy();
  expect(syncHeadline(s)).toMatchObject({ state: 'synchronised', text: 'shared' });
  await backend.addRecord(well.id, { kind: 'observation', subtype: 'note', payload: { text: 'x' } });
  await engine.refreshCounts(well.id);
  expect(syncHeadline(getSyncState())).toMatchObject({ state: 'pending', text: '1 to share' });
  transport._server.knobs.rejectNext = 1;
  await engine.flush('again');
  expect(syncHeadline(getSyncState())).toMatchObject({ state: 'failed', text: '1 refused' });
  await engine.retryRejected(well.id);
  expect(syncHeadline(getSyncState()).state).toBe('synchronised');
  engine.stop();
});

test('WS8: a sign-off pushes its row, then the platform countersigns it on the next pass; unconfigured is stated, never blocking', async () => {
  const { db, transport, backend, well } = await fresh();
  await drainOutbox({ db, transport, wellId: well.id });
  const report = await backend.saveReport(well.id, { kind: 'handover', reportDate: '2026-09-07', periodStart: '2026-09-07T05:00:00.000Z', periodEnd: '2026-09-07T17:00:00.000Z', templateId: 'petrolord-handover', canonical: { kind: 'handover', sections: [] }, contentHash: 'sha256:abc', generatedAt: '2026-09-07T17:00:00.000Z' });
  const so = await backend.addSignoff(well.id, report, { role: 'administrator', statement: 'ok' });
  expect((await db.outbox.where('entity_id').equals(so.id).toArray()).map((e) => e.op).sort()).toEqual(['countersign', 'insert']);
  const r1 = await drainOutbox({ db, transport, wellId: well.id });
  // the insert lands in this pass; the countersign op ran after it in the same pass
  expect(r1.pushed).toBeGreaterThanOrEqual(2);
  const signed = await db.signoffs.get(so.id);
  expect(signed.sync_state).toBe('synced');
  expect(signed.countersignature).toMatchObject({ key_id: 'fake-key', certificate_no: expect.stringMatching(/^WS-SO-2026-[0-9A-F]{8}$/) });
  expect(signed.countersigned_at).toBeTruthy();
  expect(await db.outbox.where('[well_id+status]').equals([well.id, 'pending']).count()).toBe(0);
  // unconfigured platform: the sign-off stands, the op completes with the reason
  transport._server.knobs.unconfigured = true;
  const so2 = await backend.addSignoff(well.id, report, { role: 'administrator', statement: 'again' });
  await drainOutbox({ db, transport, wellId: well.id });
  const e2 = (await db.outbox.where('entity_id').equals(so2.id).toArray()).find((e) => e.op === 'countersign');
  expect(e2.status).toBe('done');
  expect(e2.last_error).toBe('platform countersignature not configured');
  expect((await db.signoffs.get(so2.id)).countersignature).toBeNull();
});
