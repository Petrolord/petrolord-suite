// Pull (WS6): what others wrote, by the server-assigned sequence per
// table, into the local store as synced rows. Rows are immutable, so a
// put never loses anything; a local pending row is by definition not yet
// on the server and cannot be returned. Wells, members and sign-offs
// (the one table whose rows change after insert, by the countersigning
// function) are pulled whole for the well.

import { TABLE_ORDER } from './push';

const STORE_OF = Object.freeze({
  ws_prognosis: 'prognosis', ws_records: 'records', ws_samples: 'samples', ws_sample_stages: 'sample_stages',
  ws_tops: 'tops', ws_photos: 'photos', ws_reports: 'reports', ws_signoffs: 'signoffs',
});

export async function pullWell({ db, transport, wellId, pageSize = 500 }) {
  const result = { received: 0, tables: {} };
  if (!transport.online()) return result;
  for (const table of TABLE_ORDER) {
    const store = STORE_OF[table];
    const cur = await db.cursors.get([wellId, table]);
    let after = cur ? cur.seq : 0;
    for (;;) {
      const rows = await transport.pullRows(table, wellId, after, pageSize);
      if (!rows || !rows.length) break;
      const toPut = [];
      for (const r of rows) {
        const local = await db[store].get(r.id);
        // never regress a local row that is mid-push; otherwise the server copy is the truth
        if (local && local.sync_state === 'inflight') continue;
        toPut.push({ ...local, ...r, sync_state: 'synced', ...(store === 'photos' ? { upload_state: (local && local.upload_state) || 'remote' } : {}) });
        after = Math.max(after, r.server_seq || 0);
      }
      if (toPut.length) await db[store].bulkPut(toPut);
      result.received += toPut.length;
      result.tables[table] = (result.tables[table] || 0) + toPut.length;
      await db.cursors.put({ well_id: wellId, table, seq: after, pulled_at: Date.now() });
      if (rows.length < pageSize) break;
    }
  }
  // well, members, sign-offs whole
  const w = await transport.pullWell(wellId);
  if (w && w.well) {
    const local = await db.wells.get(wellId);
    if (!local || local.sync_state !== 'pending') await db.wells.put({ ...w.well, sync_state: 'synced' });
    await db.transaction('rw', db.members, async () => {
      await db.members.where('well_id').equals(wellId).delete();
      for (const m of w.members || []) await db.members.put(m);
    });
  }
  if (transport.pullSignoffs) {
    const so = await transport.pullSignoffs(wellId);
    for (const r of so || []) await db.signoffs.put({ ...r, sync_state: 'synced' });
  }
  return result;
}
