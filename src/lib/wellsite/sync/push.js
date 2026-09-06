// Push (WS6, spec section 37): drain the outbox to the server. Inserts
// go as batches of client-minted rows with `on conflict (id) do nothing`
// so a retried batch is harmless; a batch that the server refuses is
// retried row by row to isolate the offender, which stays local and
// visible as rejected. Photos push their metadata row first, then the
// blob variants. Well settings go as an update by an administrator.

import { classifyError, backoffMs, describeError } from './errors';
import { blobKey } from '../photos/store';

// dependency order: a stage needs its sample, a sign-off its report
export const TABLE_ORDER = Object.freeze(['ws_prognosis', 'ws_records', 'ws_samples', 'ws_sample_stages', 'ws_tops', 'ws_photos', 'ws_reports', 'ws_signoffs']);
export const LOCAL_ONLY = Object.freeze(['sync_state', 'upload_state', 'server_seq']);
export const MAX_ATTEMPTS = 40;

export function serverRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) if (!LOCAL_ONLY.includes(k)) out[k] = v;
  return out;
}

async function markDone(db, entries, serverSeqById) {
  await db.transaction('rw', db.outbox, ...[...new Set(entries.map((e) => e.store))].map((s) => db[s]), async () => {
    for (const e of entries) {
      await db.outbox.update(e.seq, { status: 'done', done_at: Date.now(), last_error: null });
      const row = await db[e.store].get(e.entity_id);
      if (row) await db[e.store].update(e.entity_id, { sync_state: 'synced', ...(serverSeqById && serverSeqById[e.entity_id] != null ? { server_seq: serverSeqById[e.entity_id] } : {}) });
    }
  });
}

async function markRetry(db, entries, err, now) {
  const kind = classifyError(err);
  for (const e of entries) {
    const attempts = (e.attempts || 0) + 1;
    if (kind === 'rejected' || attempts >= MAX_ATTEMPTS) {
      await db.outbox.update(e.seq, { status: kind === 'rejected' ? 'rejected' : 'failed', attempts, last_error: describeError(err), error_kind: kind });
      await db[e.store].update(e.entity_id, { sync_state: kind === 'rejected' ? 'rejected' : 'failed' }).catch(() => {});
    } else {
      await db.outbox.update(e.seq, { status: 'pending', attempts, next_attempt_at: now + (kind === 'auth' ? 15000 : backoffMs(attempts)), last_error: describeError(err), error_kind: kind });
    }
  }
  return kind;
}

/** Upload the blob variants of a photo after its row landed. */
async function pushPhotoBlobs(db, transport, e, row) {
  const variants = ['thumb', 'working', 'original'].filter((v) => row.variants && row.variants[v]);
  for (const v of variants) {
    const b = await db.blobs.get(blobKey(row.id, v));
    if (!b || !b.blob) continue; // not held locally (pulled from elsewhere)
    const ext = v === 'original' ? (row.variants.original.contentType || 'application/octet-stream').split('/')[1] || 'bin' : 'webp';
    await transport.uploadBlob(`${row.storage_prefix}/${v}.${ext}`, b.blob, v === 'original' ? row.variants.original.contentType : 'image/webp');
    await db.photos.update(row.id, { upload_state: v === 'original' || v === variants[variants.length - 1] ? 'complete' : v });
  }
  await db.photos.update(row.id, { upload_state: 'complete' });
}

/**
 * Drain the pending outbox for a well (or all wells).
 * @returns {{pushed:number, rejected:number, retried:number, authWait:boolean, error:string|null}}
 */
export async function drainOutbox({ db, transport, wellId = null, limit = 200, now = Date.now(), onProgress = null }) {
  const result = { pushed: 0, rejected: 0, retried: 0, authWait: false, error: null };
  if (!transport.online()) return result;
  let coll = wellId ? db.outbox.where('[well_id+status]').equals([wellId, 'pending']) : db.outbox.where('status').equals('pending');
  const pending = (await coll.toArray()).filter((e) => (e.next_attempt_at || 0) <= now).sort((a, b) => a.seq - b.seq).slice(0, limit);
  if (!pending.length) return result;
  await db.outbox.bulkPut(pending.map((e) => ({ ...e, status: 'inflight' })));
  const inflight = pending.map((e) => ({ ...e, status: 'inflight' }));

  // well updates first (settings), then the tables in dependency order
  const updates = inflight.filter((e) => e.op === 'update');
  for (const e of updates) {
    try {
      const w = await db.wells.get(e.entity_id);
      await transport.updateWell(e.entity_id, e.patch || { settings: w && w.settings, header: w && w.header, survey: w && w.survey });
      await markDone(db, [e]);
      result.pushed += 1;
    } catch (err) {
      const kind = await markRetry(db, [e], err, now);
      if (kind === 'auth') { result.authWait = true; break; }
      if (kind === 'rejected') result.rejected += 1; else result.retried += 1;
    }
  }
  if (result.authWait) { await requeueInflight(db, inflight); return result; }

  for (const table of TABLE_ORDER) {
    const entries = inflight.filter((e) => e.op === 'insert' && e.table === table);
    if (!entries.length) continue;
    const rows = [];
    for (const e of entries) {
      const r = await db[e.store].get(e.entity_id);
      if (r) rows.push({ entry: e, row: serverRow(r), local: r });
    }
    if (!rows.length) { await markDone(db, entries); continue; }
    let ok = false;
    try {
      const res = await transport.insertRows(table, rows.map((x) => x.row));
      await markDone(db, rows.map((x) => x.entry), res && res.serverSeqById);
      result.pushed += rows.length;
      ok = true;
    } catch (err) {
      const kind = classifyError(err);
      if (kind === 'auth') { await markRetry(db, entries, err, now); result.authWait = true; break; }
      if (kind === 'transient' || rows.length === 1) {
        const k = await markRetry(db, entries, err, now);
        if (k === 'rejected') result.rejected += rows.length; else result.retried += rows.length;
        if (kind === 'transient') { result.error = describeError(err); break; }
        continue;
      }
      // a refused batch: row by row, so one bad row does not hold the rest
      for (const x of rows) {
        try {
          const res = await transport.insertRows(table, [x.row]);
          await markDone(db, [x.entry], res && res.serverSeqById);
          result.pushed += 1;
        } catch (e2) {
          const k = await markRetry(db, [x.entry], e2, now);
          if (k === 'rejected') result.rejected += 1; else result.retried += 1;
        }
      }
      ok = true;
    }
    if (ok && table === 'ws_photos') {
      for (const x of rows) {
        const done = await db.outbox.get(x.entry.seq);
        if (!done || done.status !== 'done') continue;
        try { await pushPhotoBlobs(db, transport, x.entry, x.local); } catch (err) {
          // the row is shared; the blobs retry through a fresh upload entry
          await db.outbox.add({ well_id: x.entry.well_id, store: 'photos', table: 'ws_photos', op: 'upload', entity_id: x.entry.entity_id, status: 'pending', attempts: 1, next_attempt_at: now + backoffMs(1), last_error: describeError(err), queued_at: now });
          result.retried += 1;
        }
      }
    }
    if (onProgress) onProgress(result);
  }
  // countersignatures: ask the platform once the sign-off row is on the server (WS8)
  for (const e of inflight.filter((x) => x.op === 'countersign')) {
    try {
      const so = await db.signoffs.get(e.entity_id);
      if (!so) { await db.outbox.update(e.seq, { status: 'done', done_at: Date.now() }); continue; }
      if (so.sync_state !== 'synced') { await db.outbox.update(e.seq, { status: 'pending', next_attempt_at: now + 2000 }); continue; }
      if (!transport.countersign) { await db.outbox.update(e.seq, { status: 'done', done_at: Date.now(), last_error: 'no countersign transport' }); continue; }
      const res = await transport.countersign(so.id);
      if (res && res.countersigned) {
        await db.signoffs.update(so.id, { countersignature: res.countersignature, countersigned_at: res.countersigned_at });
        await db.outbox.update(e.seq, { status: 'done', done_at: Date.now(), last_error: null });
        result.pushed += 1;
      } else if (res && res.reason === 'unconfigured') {
        await db.outbox.update(e.seq, { status: 'done', done_at: Date.now(), last_error: 'platform countersignature not configured' });
      } else {
        await db.outbox.update(e.seq, { status: 'rejected', last_error: (res && res.reason) || 'refused', error_kind: 'rejected' });
        result.rejected += 1;
      }
    } catch (err) {
      const k = await markRetry(db, [e], err, now);
      if (k === 'rejected') result.rejected += 1; else result.retried += 1;
    }
  }
  // pending blob uploads from earlier partial pushes
  for (const e of inflight.filter((x) => x.op === 'upload')) {
    try {
      const row = await db.photos.get(e.entity_id);
      if (row) await pushPhotoBlobs(db, transport, e, row);
      await db.outbox.update(e.seq, { status: 'done', done_at: Date.now(), last_error: null });
      result.pushed += 1;
    } catch (err) {
      const k = await markRetry(db, [e], err, now);
      if (k === 'rejected') result.rejected += 1; else result.retried += 1;
    }
  }
  await requeueInflight(db, inflight);
  return result;
}

/** Anything still marked inflight (a loop broke early) goes back to pending. */
async function requeueInflight(db, inflight) {
  for (const e of inflight) {
    const cur = await db.outbox.get(e.seq);
    if (cur && cur.status === 'inflight') await db.outbox.update(e.seq, { status: 'pending' });
  }
}
