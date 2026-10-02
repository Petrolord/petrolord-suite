// The sharing store: what an app calls. It sits on a small transport (the
// Supabase client, or the in-memory database for harnesses and jest), so the
// logic here (version tracking, refusals turned into sentences, the
// before-migration fallback) is the same code in production and in tests.
//
//   capability(table)            is the migration applied (cached)
//   context()                    { userId, organizationId }
//   trackOpened(table, row)      remember the version the editor now shows
//   update(table, id, patch, { note })   a save; sends the tracked version
//   setSharing(table, id, { shared, access })
//   take / renew / release       the check-out
//   refresh(table, id)           the row's current sharing state
//   history(table, id)           the change log, names resolved
//   names(ids)                   user id -> display name (never an email)

import { RecordConflict, messages, tableSpec, sharingOf, accessOf, COLLEAGUE } from './rules';

const parseDetail = (error) => {
  try { return JSON.parse(error?.details || 'null') || {}; } catch { return {}; }
};
const isUnknownColumn = (error) => !!error && (['42703', 'PGRST204'].includes(String(error.code))
  || /column .* does not exist|Could not find the '.*' column/i.test(String(error.message || '')));
const isMissingThing = (error) => !!error && (['42P01', 'PGRST205', 'PGRST202', '42883'].includes(String(error.code))
  || /does not exist|Could not find the (table|function)/i.test(String(error.message || '')));

export function makeSharingStore(transport) {
  const caps = new Map();       // table -> { available, at }
  const versions = new Map();   // `${table}:${id}` -> version the editor shows
  const nameCache = new Map();
  const key = (table, id) => `${table}:${id}`;

  async function capability(table) {
    tableSpec(table);
    const hit = caps.get(table);
    // a "not yet" answer is asked again after a minute, so the controls
    // appear soon after the owner applies the migration
    if (hit && (hit.available || Date.now() - hit.at < 60000)) return { available: hit.available };
    let available = false;
    try { available = !!(await transport.probe(table)); } catch { available = false; }
    caps.set(table, { available, at: Date.now() });
    return { available };
  }

  async function context() {
    const u = await transport.user();
    return { userId: u?.id || null, organizationId: u?.organizationId || null };
  }

  async function names(ids) {
    const want = [...new Set((ids || []).filter(Boolean))];
    const missing = want.filter((id) => !nameCache.has(id));
    if (missing.length) {
      let found = {};
      try { found = (await transport.names(missing)) || {}; } catch { found = {}; }
      for (const id of missing) nameCache.set(id, found[id] || null);
    }
    const out = {};
    for (const id of want) out[id] = nameCache.get(id) || COLLEAGUE;
    return out;
  }
  const nameOf = async (id) => (id ? (await names([id]))[id] : COLLEAGUE);

  function trackOpened(table, row) {
    if (row?.id && Number.isInteger(row.version)) versions.set(key(table, row.id), row.version);
    else if (row?.id) versions.delete(key(table, row.id));
  }
  const trackedVersion = (table, id) => versions.get(key(table, id)) ?? null;

  async function conflictFrom(table, id, error) {
    const d = parseDetail(error);
    if (error.code === 'SR001') {
      // the user's own other tab is the common case
      const me = (await context()).userId;
      return new RecordConflict('stale', messages.stale(d.updated_by && d.updated_by === me ? 'You' : await nameOf(d.updated_by), d.updated_at), d);
    }
    if (error.code === 'SR002') {
      if (d.editing_by && d.editing_expires && new Date(d.editing_expires).getTime() > Date.now()) {
        return new RecordConflict('locked', messages.locked(await nameOf(d.editing_by), d.editing_since), d);
      }
      return new RecordConflict('no_checkout', messages.noCheckout(), d);
    }
    if (error.code === 'SR003') return new RecordConflict('not_owner', messages.notOwner());
    return null;
  }

  /** Why a write touched no row: read the row as the user sees it now. */
  async function whyNoRow(table, id) {
    const [row, ctx] = await Promise.all([transport.getSharing(table, id).catch(() => null), context()]);
    if (!row) return new RecordConflict('gone', messages.gone());
    const a = accessOf(table, row, { userId: ctx.userId });
    if (a.isOwner) return new RecordConflict('gone', messages.gone());
    if (!a.sharedEdit) return new RecordConflict('view_only', messages.viewOnly(await nameOf(row.user_id)), row);
    if (a.lock.live && !a.lock.mine) return new RecordConflict('locked', messages.locked(await nameOf(a.lock.by), a.lock.since), row);
    return new RecordConflict('no_checkout', a.lock.live ? messages.noCheckout() : messages.expired(), row);
  }

  /**
   * Save. Same shape as a PostgREST call: { data: row | null, error }.
   * With the migration applied the save carries the version the editor was
   * opened at and an optional summary for the change log; a refusal comes
   * back as a RecordConflict whose message is ready to show.
   * Before the migration it is the plain update the app always made.
   */
  async function update(table, id, patch, { note = null, select = '*' } = {}) {
    const { available } = await capability(table);
    const body = { ...patch };
    const v = trackedVersion(table, id);
    if (available) {
      if (v != null) body.version = v;
      if (note) body.change_note = String(note).slice(0, 500);
    } else {
      delete body.version; delete body.change_note;
    }
    const { data, error } = await transport.update(table, id, body, { select });
    if (error) {
      if (available && isUnknownColumn(error)) {
        // the answer changed under us (schema cache): once more, the old way
        caps.set(table, { available: false, at: Date.now() });
        return update(table, id, patch, { select });
      }
      return { data: null, error: (await conflictFrom(table, id, error)) || error };
    }
    if (!data || !data.length) {
      if (!available) return { data: null, error: { code: 'PGRST116', message: 'The record was not found, or it belongs to someone else.' } };
      return { data: null, error: await whyNoRow(table, id) };
    }
    if (available && Number.isInteger(data[0].version)) versions.set(key(table, id), data[0].version);
    return { data: data[0], error: null };
  }

  /** Owner only. shared false = private. access 'view' | 'edit'. */
  async function setSharing(table, id, { shared, access = 'view' }) {
    const { available } = await capability(table);
    if (!available) throw new Error(messages.notAvailable());
    const ctx = await context();
    if (shared && !ctx.organizationId) throw new Error(messages.noOrganisation());
    const byOrg = tableSpec(table).sharedWhen === 'organization_id';
    const patch = shared
      ? { ...(byOrg ? {} : { visibility: 'organization' }), organization_id: ctx.organizationId, org_access: access === 'edit' ? 'edit' : 'view' }
      : { ...(byOrg ? {} : { visibility: 'private' }), organization_id: null, org_access: 'view' };
    const { data, error } = await transport.update(table, id, patch, { select: '*' });
    if (error) throw (await conflictFrom(table, id, error)) || new Error(`Could not change the sharing: ${error.message}`);
    if (!data || !data.length) throw new RecordConflict('not_owner', messages.notOwner());
    return sharingOf(data[0]);
  }

  async function rpc(fn, table, id, extra = {}) {
    const { available } = await capability(table);
    if (!available) return { ok: false, reason: 'not_available' };
    const { data, error } = await transport.rpc(fn, { p_table: table, p_id: id, ...extra });
    if (error) {
      if (isMissingThing(error)) return { ok: false, reason: 'not_available' };
      throw new Error(`Could not update the editing status: ${error.message}`);
    }
    return data || { ok: false, reason: 'not_found' };
  }
  /**
   * Take the record for editing. On success `stale` says whether the content
   * moved on since this editor opened it (reload before editing).
   */
  async function take(table, id, { takeOver = false } = {}) {
    const res = await rpc('suite_record_take', table, id, { p_take_over: !!takeOver });
    const v = trackedVersion(table, id);
    if (res.ok) return { ...res, stale: v != null && Number.isInteger(res.version) && res.version !== v };
    if (res.reason === 'locked') return { ...res, message: messages.locked(await nameOf(res.editing_by), res.editing_since) };
    if (res.reason === 'view_only') return { ...res, message: messages.viewOnly(null) };
    if (res.reason === 'not_found') return { ...res, message: messages.gone() };
    if (res.reason === 'not_available') return { ...res, message: messages.notAvailable() };
    return res;
  }
  const renew = (table, id) => rpc('suite_record_renew', table, id);
  const release = (table, id) => rpc('suite_record_release', table, id).catch(() => ({ ok: false }));

  async function refresh(table, id) {
    const { available } = await capability(table);
    if (!available) return null;
    return sharingOf(await transport.getSharing(table, id));
  }

  async function history(table, id, { limit = 50 } = {}) {
    const { available } = await capability(table);
    if (!available) return [];
    const { data, error } = await transport.changes(table, id, limit);
    if (error) {
      if (isMissingThing(error)) return [];
      throw new Error(`Could not load the history: ${error.message}`);
    }
    const who = await names((data || []).map((c) => c.changed_by));
    return (data || []).map((c) => ({ ...c, changed_by_name: c.changed_by ? who[c.changed_by] : 'Petrolord' }));
  }

  return {
    capability, context, names, trackOpened, trackedVersion, update, setSharing, take, renew, release, refresh, history,
    /** Test seam: forget what was learnt about the database. */
    _reset() { caps.clear(); versions.clear(); nameCache.clear(); },
  };
}

/** A transport over the in-memory database, acting as one user. */
export function memoryTransport(db, userId) {
  let me = userId;
  return {
    as(id) { me = id; },
    async user() { return me ? { id: me, organizationId: db.members[me]?.orgId || null } : null; },
    async probe() { return db.applied; },
    async getSharing(table, id) { return (db.select(table, me).data || []).find((r) => r.id === id) || null; },
    async update(table, id, body) { return db.update(table, me, id, body); },
    async rpc(fn, args) { return db.rpc(fn, me, args); },
    async changes(table, id, limit) { const r = db.listChanges(table, me, id); return r.error ? r : { data: r.data.slice(0, limit), error: null }; },
    async names(ids) {
      const out = {};
      const myOrg = db.members[me]?.orgId;
      for (const id of ids) {
        // organization_members is readable inside one's own organisation only
        if (id === me || (myOrg && db.members[id]?.orgId === myOrg)) out[id] = db.members[id]?.name || null;
      }
      return out;
    },
  };
}
