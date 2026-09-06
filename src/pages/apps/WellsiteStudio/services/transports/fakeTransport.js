// The harness transport (/dev/wellsite-studio and jest): no network, a
// fixed user, the seeded registry wells, and creates that succeed locally.
// The sync engine (WS6) treats it as a server that accepts everything.

import { newId } from '@/lib/wellsite/ids';

export function makeFakeTransport({ user, registryWells = [], online = true, prognosisSources = null } = {}) {
  const wsWells = new Map();
  let isOnline = online;
  // the fake server: tables of rows keyed by id with a server sequence, blobs by path, auth listeners,
  // and knobs the tests turn (fail the next call, refuse the next call, expire the token)
  const tables = new Map();
  const blobs = new Map();
  const authListeners = new Set();
  let seq = 0;
  const knobs = { failNext: 0, rejectNext: 0, authNext: 0 };
  const tableOf = (name) => { if (!tables.has(name)) tables.set(name, new Map()); return tables.get(name); };
  const netError = () => { const e = new Error('Failed to fetch'); e.status = 0; return e; };
  const check = () => {
    if (!isOnline) throw netError();
    if (knobs.failNext > 0) { knobs.failNext -= 1; throw netError(); }
    if (knobs.authNext > 0) { knobs.authNext -= 1; const e = new Error('JWT expired'); e.status = 401; throw e; }
    if (knobs.rejectNext > 0) { knobs.rejectNext -= 1; const e = new Error('new row violates row-level security policy for table'); e.code = '42501'; throw e; }
  };
  const u = user || { id: 'user-a', email: 'geologist@example.com', name: 'A. Geologist', organization_id: 'org-1', role: 'wellsite_geologist' };
  return {
    kind: 'fake',
    async currentUser() { return u; },
    online() { return isOnline; },
    setOnline(v) { isOnline = !!v; },
    async listRegistryWells() { return registryWells; },
    async listWsWells() { return [...wsWells.values()]; },
    async createWsWell(row) {
      const now = new Date().toISOString();
      const well = { ...row, created_at: now, updated_at: now, schema_version: 1 };
      const member = { id: newId(), well_id: well.id, user_id: u.id, role: 'administrator', status: 'active', added_by: u.id, created_at: now, updated_at: now };
      const entry = { well, members: [member] };
      wsWells.set(well.id, entry);
      return entry;
    },
    async pullWell(id) { check(); return wsWells.get(id) || null; },
    // ---- sync (WS6) ----
    async insertRows(table, rows) {
      check();
      const t = tableOf(table);
      const serverSeqById = {};
      for (const r of rows) {
        if (t.has(r.id)) { serverSeqById[r.id] = t.get(r.id).server_seq; continue; }  // on conflict (id) do nothing
        if (r.status === 'final' && table === 'ws_tops' && knobs.refuseFinal) { const e = new Error('new row violates row-level security policy for table "ws_tops"'); e.code = '42501'; throw e; }
        seq += 1;
        const stored = { ...r, server_seq: seq, received_at: new Date().toISOString() };
        t.set(r.id, stored);
        serverSeqById[r.id] = seq;
      }
      return { ids: rows.map((r) => r.id), serverSeqById };
    },
    async updateWell(id, patch) {
      check();
      const entry = wsWells.get(id);
      if (!entry) throw Object.assign(new Error('Only a well administrator can change the well settings.'), { code: '42501' });
      entry.well = { ...entry.well, ...patch, updated_at: new Date().toISOString() };
      return entry.well;
    },
    async pullRows(table, wellId, afterSeq, limit = 500) {
      check();
      return [...tableOf(table).values()].filter((r) => r.well_id === wellId && r.server_seq > afterSeq).sort((a, b) => a.server_seq - b.server_seq).slice(0, limit);
    },
    async pullSignoffs(wellId) { check(); return [...tableOf('ws_signoffs').values()].filter((r) => r.well_id === wellId); },
    async uploadBlob(path, blob, contentType) { check(); blobs.set(path, { size: blob.size, contentType }); return { path }; },
    onAuthEvent(cb) { authListeners.add(cb); return () => authListeners.delete(cb); },
    // ---- registry publish (WS9): the fake registry lives in memory ----
    async registryState(geoWellId) {
      check();
      const geo = registryWells.find((w) => w.id === geoWellId);
      const t = tableOf('registry_tops'); const i = tableOf('registry_intervals');
      return { ownedByMe: !!(geo && geo.user_id === u.id), tops: [...t.values()].filter((r) => r.well_id === geoWellId), intervals: [...i.values()].filter((r) => r.well_id === geoWellId), coreImages: [...tableOf('registry_core').values()].filter((r) => r.well_id === geoWellId) };
    },
    async publishToRegistry(geoWellId, { tops, replaceTopIds, intervals, replaceIntervalIds, photos }) {
      check();
      const t = tableOf('registry_tops'); const i = tableOf('registry_intervals'); const c = tableOf('registry_core');
      for (const id of replaceTopIds) t.delete(id);
      for (const id of replaceIntervalIds) i.delete(id);
      const topIds = tops.map((row) => { const id = newId(); t.set(id, { id, well_id: geoWellId, ...row }); return id; });
      const intervalIds = intervals.map((row) => { const id = newId(); i.set(id, { id, well_id: geoWellId, ...row }); return id; });
      const photoIds = photos.map(({ photo }) => { const id = newId(); c.set(id, { id, well_id: geoWellId, top_md_m: photo.md_calc_m, base_md_m: photo.md_calc_m, caption: photo.caption, storage_path: `${u.id}/${geoWellId}/core/${photo.id}.webp` }); return id; });
      return { tops: { ids: topIds, replaced: replaceTopIds.length }, intervals: { ids: intervalIds, replaced: replaceIntervalIds.length }, photos: { ids: photoIds } };
    },
    /** The fake platform countersigns anything it holds (a synthetic signature; verification is the client's business). */
    async countersign(signoffId) {
      check();
      const so = tableOf('ws_signoffs').get(signoffId);
      if (!so) return { countersigned: false, reason: 'not_found' };
      if (knobs.unconfigured) return { countersigned: false, reason: 'unconfigured' };
      const countersignature = { alg: 'ECDSA-P256-SHA256', key_id: 'fake-key', value: 'ZmFrZQ==', digest: 'fake', certificate_no: `WS-SO-${String(so.signed_at).slice(0, 4)}-${String(so.id).replace(/-/g, '').slice(0, 8).toUpperCase()}`, countersigned_by: 'fake-platform' };
      const countersigned_at = new Date().toISOString();
      tableOf('ws_signoffs').set(signoffId, { ...so, countersignature, countersigned_at });
      return { countersigned: true, countersignature, countersigned_at };
    },
    async verifyCountersign(signoffId) { check(); const so = tableOf('ws_signoffs').get(signoffId); return { valid: !!(so && so.countersignature), hash_ok: true, key_id: so && so.countersignature ? so.countersignature.key_id : null }; },
    // ---- test knobs ----
    _server: { tables, blobs, wsWells, knobs, nextSeq: () => { seq += 1; return seq; } },
    /** Plant a row on the server as if another device had pushed it. */
    plant(table, row) { seq += 1; const stored = { ...row, server_seq: seq, received_at: new Date().toISOString() }; tableOf(table).set(row.id, stored); return stored; },
    emitAuth(event) { for (const cb of authListeners) cb(event); },
    async loadPrognosisSources(geoWellId, { offsetWellIds = [] } = {}) {
      const geoWell = registryWells.find((w) => w.id === geoWellId) || null;
      const src = prognosisSources ? prognosisSources(geoWellId) : {};
      const offsets = registryWells.filter((w) => offsetWellIds.includes(w.id) || (!offsetWellIds.length && w.id !== geoWellId)).map((w) => ({ id: w.id, name: w.name, kb_m: w.kb_m, deviation: w.deviation, tops: w.tops || [] }));
      return { geoWell, tops: (geoWell && geoWell.tops) || [], offsetWells: offsets, holeSections: src.holeSections || [], casingPoints: src.casingPoints || [], plannedTrajectory: src.plannedTrajectory || null, pressureCurves: null, loadedFrom: 'fake-registry' };
    },
    _wells: wsWells,
  };
}
