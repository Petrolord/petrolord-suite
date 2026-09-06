// The commit path (spec section 36): one Dexie transaction writes the row
// and its outbox entry, so a record is never in the store without being
// queued and never queued without being stored. Nothing on this path
// touches the network; the UI follows through live queries.

export const OUTBOX_STATES = Object.freeze(['pending', 'inflight', 'failed', 'rejected', 'done']);

const TABLE_OF = Object.freeze({
  records: 'ws_records', samples: 'ws_samples', sample_stages: 'ws_sample_stages', tops: 'ws_tops',
  photos: 'ws_photos', reports: 'ws_reports', signoffs: 'ws_signoffs', prognosis: 'ws_prognosis',
});

export function serverTableOf(store) { return TABLE_OF[store]; }

/** Insert one row into `store` and queue it. Returns the row. */
export async function commitRow(db, store, row, { op = 'insert', wellId = row.well_id } = {}) {
  if (!TABLE_OF[store]) throw new Error(`Unknown store ${store}.`);
  await db.transaction('rw', db[store], db.outbox, async () => {
    await db[store].add(row);
    await db.outbox.add({
      well_id: wellId, store, table: TABLE_OF[store], op, entity_id: row.id,
      status: 'pending', attempts: 0, next_attempt_at: 0, last_error: null, queued_at: Date.now(),
    });
  });
  return row;
}

/** Insert several rows across stores atomically (a sample plus its first stage, a photo plus its blobs). */
export async function commitMany(db, items) {
  const stores = new Set(items.map((i) => i.store));
  await db.transaction('rw', [...[...stores].map((s) => db[s]), db.outbox, db.blobs], async () => {
    for (const it of items) {
      await db[it.store].add(it.row);
      if (it.blobs) for (const b of it.blobs) await db.blobs.put(b);
      await db.outbox.add({
        well_id: it.wellId || it.row.well_id, store: it.store, table: TABLE_OF[it.store], op: it.op || 'insert', entity_id: it.row.id,
        status: 'pending', attempts: 0, next_attempt_at: 0, last_error: null, queued_at: Date.now(),
      });
    }
  });
  return items.map((i) => i.row);
}

/** A well-level change that is an update on the server (ws_wells settings/header/survey by an administrator). */
export async function commitWellPatch(db, wellId, patch) {
  await db.transaction('rw', db.wells, db.outbox, async () => {
    const w = await db.wells.get(wellId);
    if (!w) throw new Error('Well not found locally.');
    const next = { ...w, ...patch, updated_at: new Date().toISOString(), sync_state: 'pending' };
    await db.wells.put(next);
    await db.outbox.add({
      well_id: wellId, store: 'wells', table: 'ws_wells', op: 'update', entity_id: wellId, patch,
      status: 'pending', attempts: 0, next_attempt_at: 0, last_error: null, queued_at: Date.now(),
    });
  });
}

export async function pendingCount(db, wellId) {
  return db.outbox.where('[well_id+status]').equals([wellId, 'pending']).count();
}
