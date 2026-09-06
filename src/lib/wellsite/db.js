// Wellsite Studio local database (plan section 4, spec section 36). The
// system of record on the rig: every user action commits here first, the
// UI reads from here, and the sync engine (WS6) drains the outbox to the
// ws_* tables and pulls what others wrote. Dexie over IndexedDB: compound
// indexes for the depth-window and time-window queries the views make,
// multi-store transactions so a row and its outbox entry land together,
// live queries so the screen follows the store.
//
// Every hot index starts with well_id. Blobs (photo variants) sit in
// their own store, never indexed by content. Rows carry the platform
// stamp (schema_version, app_build) like every registry row, and a
// local-only sync_state.
//
// This is deliberately the ONE app in the Suite whose local store is not
// a cache: field records cannot be recomputed from anything else.

import Dexie from 'dexie';

export const DB_NAME = 'petrolord-wellsite';
export const DB_VERSION = 1;

export const STORES = {
  wells: 'id, geo_well_id, organization_id, updated_at',
  members: 'id, well_id, [well_id+user_id]',
  prognosis: 'id, [well_id+version]',
  records: 'id, [well_id+kind+md_calc_m], [well_id+kind+occurred_at], [well_id+subtype+occurred_at], [well_id+chain_id], previous_version_id, supersedes_id, sample_id, [well_id+sync_state]',
  samples: 'id, [well_id+sample_no], [well_id+md_calc_m]',
  sample_stages: 'id, [sample_id+stage], [well_id+at_utc], sample_id',
  tops: 'id, [well_id+formation_key], [well_id+chain_id], previous_version_id',
  photos: 'id, [well_id+captured_at], [well_id+md_calc_m], sample_id, record_id',
  blobs: 'key, photo_id',
  reports: 'id, [well_id+kind+report_date], [well_id+chain_id]',
  signoffs: 'id, report_id, [well_id+signed_at]',
  outbox: '++seq, status, [well_id+status], entity_id, next_attempt_at',
  cursors: '[well_id+table]',
  conflicts: 'id, well_id, chain_id',
  meta: 'key',
};

/** Open (or create) the local database. One instance per page; tests pass a name. */
export function openWellsiteDb(name = DB_NAME) {
  const db = new Dexie(name);
  db.version(DB_VERSION).stores(STORES);
  return db;
}

let shared = null;
export function wellsiteDb() {
  if (!shared) shared = openWellsiteDb();
  return shared;
}
export function _resetWellsiteDb() { shared = null; }

/** Ask the browser to keep this origin's data out of eviction; returns the granted flag. */
export async function persistStorage() {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persist) return null;
    const already = await navigator.storage.persisted();
    if (already) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}

export async function storageEstimate() {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) return null;
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? null, quota: e.quota ?? null };
  } catch { return null; }
}
