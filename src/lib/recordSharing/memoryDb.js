// An in-memory database that mirrors the organisation sharing migrations
// (20261002100000_suite_record_sharing.sql, 20261002110000_geo_wells_team_editing.sql)
// for the harnesses and jest: the same policies, the same guard trigger, the
// same check-out functions and the same change log, so a test with two users
// meets the refusals the real database gives. The SQL pentest
// (tools/validation/org-sharing/pentest.sql) proves the real ones.
//
//   select  the owner; a member of the organisation the record is shared with
//   insert  the owner; a shared row must carry an organisation of the writer
//   update  the owner; or a member holding the unexpired check-out when
//           colleagues can edit. Guard: stale version SR001, no check-out
//           SR002, sharing change by a non-owner SR003; stamps from the caller
//   delete  the owner
//   take / renew / release as the SECURITY DEFINER functions
//
// `applied: false` behaves as the database before the migration: no sharing
// columns, owner-only rows, no functions, no log.

import { SHARING_TABLES, LOCK_MINUTES } from './rules';

const META = ['visibility', 'org_access', 'organization_id', 'editing_by', 'editing_since', 'editing_expires',
  'version', 'updated_by', 'updated_at', 'change_note', 'user_id'];
const LOG_SKIP = [...META, 'app_build', 'engine_version', 'schema_version'];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const pgError = (code, message, details = null) => ({ code, message, details });
const RLS = (table) => pgError('42501', `new row violates row-level security policy for table "${table}"`);
const DENIED = (table) => pgError('42501', `permission denied for table ${table}`);

/**
 * @param {{
 *   members?: Object<string, { orgId: ?string, name?: string }>,  user id -> organisation and display name
 *   applied?: boolean,
 *   clock?: () => number,
 * }} opts
 */
export function makeSharingDb({ members = {}, applied = true, clock = null } = {}) {
  let offset = 0;
  let seq = 0;
  const nowMs = () => (clock ? clock() : Date.now()) + offset;
  const nowIso = () => new Date(nowMs()).toISOString();
  const tables = new Map();          // table -> { get, set }
  const changes = [];                // suite_record_changes
  const state = { applied };

  const attach = (table, accessor) => {
    if (!SHARING_TABLES[table]) throw new Error(`${table} is not a shared record table.`);
    tables.set(table, accessor);
  };
  const ensure = (table) => {
    if (!tables.has(table)) { let rows = []; tables.set(table, { get: () => rows, set: (r) => { rows = r; } }); }
    return tables.get(table);
  };
  const rowsOf = (table) => ensure(table).get();
  const byOrg = (table) => SHARING_TABLES[table].sharedWhen === 'organization_id';
  const isMember = (uid, org) => !!uid && !!org && members[uid]?.orgId === org;
  const shared = (table, r) => !!r.organization_id && (byOrg(table) || r.visibility === 'organization');
  const sharedEdit = (table, r) => shared(table, r) && r.org_access === 'edit';
  const live = (r) => !!r.editing_by && new Date(r.editing_expires).getTime() > nowMs();
  // geo_wells was readable by the organisation before the migration too
  const canSelect = (table, r, uid) => !!uid && (r.user_id === uid || ((state.applied || byOrg(table)) && shared(table, r) && isMember(uid, r.organization_id)));
  const colleagueOk = (table, r, uid) => sharedEdit(table, r) && isMember(uid, r.organization_id) && live(r) && r.editing_by === uid;
  const ownOk = (table, r, uid) => r.user_id === uid && (byOrg(table)
    ? (!r.organization_id || isMember(uid, r.organization_id))
    : (r.visibility === 'private' || (!!r.organization_id && isMember(uid, r.organization_id))));
  const nameOf = (table, r) => r.name ?? r.project_name ?? null;
  const expiry = () => new Date(nowMs() + LOCK_MINUTES * 60000).toISOString();

  const log = (table, r, uid, action, summary = null, fields = []) => {
    changes.push({ id: ++seq, table_name: table, record_id: r.id, organization_id: r.organization_id ?? null, owner_id: r.user_id,
      changed_by: uid, changed_at: nowIso(), action, summary, changed_fields: fields, change_count: 1 });
  };
  const logUpdated = (table, r, uid, note, fields) => {
    const last = [...changes].reverse().find((c) => c.table_name === table && c.record_id === r.id);
    if (last && last.action === 'updated' && last.changed_by === uid && nowMs() - new Date(last.changed_at).getTime() < 10 * 60000) {
      last.changed_at = nowIso(); last.change_count += 1; last.summary = note ?? last.summary;
      last.changed_fields = [...new Set([...last.changed_fields, ...fields])].sort();
    } else log(table, r, uid, 'updated', note ?? null, [...fields].sort());
  };
  const logTransition = (table, before, after, uid) => {
    const was = shared(table, before); const is = shared(table, after);
    if (is && !was) log(table, after, uid, 'shared', after.org_access === 'edit' ? 'Shared with the organisation: colleagues can edit' : 'Shared with the organisation: colleagues can view');
    else if (was && !is) log(table, { ...after, organization_id: before.organization_id }, uid, 'access_changed', 'Sharing turned off');
    else if (is && after.org_access !== before.org_access) log(table, after, uid, 'access_changed', after.org_access === 'edit' ? 'Colleagues can now edit' : 'Colleagues can now view only');
    if ((after.editing_by ?? null) !== (before.editing_by ?? null)) {
      const wasLive = !!before.editing_by && new Date(before.editing_expires).getTime() > nowMs();
      if (!after.editing_by) log(table, after, uid, 'released', uid !== before.editing_by ? 'Editing ended by the owner' : 'Finished editing');
      else if (wasLive) log(table, after, uid, 'taken_over', 'The owner took over editing');
      else log(table, after, uid, 'checked_out', 'Started editing');
    }
  };
  const write = (table, id, next) => { const acc = ensure(table); acc.set(acc.get().map((r) => (r.id === id ? next : r))); };

  // ---- the statements a client can send -------------------------------------
  function select(table, uid) {
    if (!uid) return { data: null, error: DENIED(table) };
    return { data: rowsOf(table).filter((r) => canSelect(table, r, uid)).map((r) => ({ ...r })), error: null };
  }

  function insert(table, uid, row) {
    if (!uid) return { data: null, error: DENIED(table) };
    const r = { id: row.id || `${table}-${++seq}`, created_at: nowIso(), updated_at: nowIso(), ...row };
    if (!state.applied) {
      if (r.user_id !== uid) return { data: null, error: RLS(table) };
      for (const c of ['visibility', 'org_access', 'organization_id', 'version', 'change_note', 'editing_by']) {
        if (c in row && !(byOrg(table) && c === 'organization_id')) return { data: null, error: pgError('PGRST204', `Could not find the '${c}' column of '${table}' in the schema cache`) };
      }
      ensure(table).set([r, ...rowsOf(table)]);
      return { data: { ...r }, error: null };
    }
    const note = r.change_note ?? null;
    Object.assign(r, { visibility: byOrg(table) ? undefined : (r.visibility || 'private'), org_access: r.org_access || 'view', organization_id: r.organization_id ?? null,
      version: 1, updated_by: uid, editing_by: null, editing_since: null, editing_expires: null, change_note: null });
    if (byOrg(table)) delete r.visibility;
    if (!ownOk(table, r, uid)) return { data: null, error: RLS(table) };
    ensure(table).set([r, ...rowsOf(table)]);
    log(table, r, uid, 'created', note ?? nameOf(table, r));
    return { data: { ...r }, error: null };
  }

  /** @returns {{ data: Array, error: ?Object }} data [] when the policy hides the row from the write */
  function update(table, uid, id, patch) {
    if (!uid) return { data: null, error: DENIED(table) };
    const old = rowsOf(table).find((r) => r.id === id);
    if (!state.applied) {
      for (const c of ['visibility', 'org_access', 'version', 'change_note', 'editing_by']) {
        if (c in patch) return { data: null, error: pgError('PGRST204', `Could not find the '${c}' column of '${table}' in the schema cache`) };
      }
      if (!old || old.user_id !== uid) return { data: [], error: null };
      const next = { ...old, ...patch, user_id: patch.user_id ?? old.user_id };
      if (next.user_id !== uid) return { data: null, error: RLS(table) };
      write(table, id, next);
      return { data: [{ ...next }], error: null };
    }
    if (!old || !canSelect(table, old, uid) || !(old.user_id === uid || colleagueOk(table, old, uid))) return { data: [], error: null };

    // guard trigger
    const isOwner = old.user_id === uid;
    const wasEdit = sharedEdit(table, old);
    const lockLive = live(old);
    const holds = lockLive && old.editing_by === uid;
    const next = { ...old, ...patch };
    const note = patch.change_note ?? null;
    next.change_note = null;
    next.user_id = old.user_id;
    next.editing_by = old.editing_by; next.editing_since = old.editing_since; next.editing_expires = old.editing_expires;
    const sharingChanged = !same(next.visibility, old.visibility) || !same(next.org_access, old.org_access) || !same(next.organization_id, old.organization_id);
    const fields = Object.keys(next).filter((k) => !META.includes(k) && !same(next[k], old[k]));
    const contentChanged = fields.length > 0;
    // a row put in by a fixture may lack the column: it reads as version 1
    const oldVersion = Number.isInteger(old.version) ? old.version : 1;
    if ('version' in patch && patch.version !== oldVersion) {
      return { data: null, error: pgError('SR001', 'A newer version of this record has been saved.', JSON.stringify({ version: oldVersion, updated_by: old.updated_by, updated_at: old.updated_at })) };
    }
    const lockDetail = JSON.stringify({ editing_by: old.editing_by, editing_since: old.editing_since, editing_expires: old.editing_expires });
    if (!isOwner) {
      if (sharingChanged) return { data: null, error: pgError('SR003', 'Only the owner changes how a record is shared.') };
      if (!(wasEdit && holds)) return { data: null, error: pgError('SR002', 'Take this record for editing before saving.', lockDetail) };
    } else if (contentChanged && wasEdit && lockLive && !holds) {
      return { data: null, error: pgError('SR002', 'A colleague is editing this record.', lockDetail) };
    }
    if (!sharedEdit(table, next)) { next.editing_by = null; next.editing_since = null; next.editing_expires = null; }
    else if (holds) next.editing_expires = expiry();
    if (contentChanged) { next.version = oldVersion + 1; next.updated_at = nowIso(); next.updated_by = uid; }
    else { next.version = oldVersion; next.updated_at = old.updated_at; next.updated_by = old.updated_by; }
    // with check
    if (!(ownOk(table, next, uid) || colleagueOk(table, next, uid))) return { data: null, error: RLS(table) };
    write(table, id, next);
    logTransition(table, old, next, uid);
    if (contentChanged) logUpdated(table, next, uid, note, fields.filter((f) => !LOG_SKIP.includes(f)));
    return { data: [{ ...next }], error: null };
  }

  function remove(table, uid, id) {
    if (!uid) return { data: null, error: DENIED(table) };
    const old = rowsOf(table).find((r) => r.id === id);
    if (!old || old.user_id !== uid) return { data: [], error: null };
    ensure(table).set(rowsOf(table).filter((r) => r.id !== id));
    if (state.applied) log(table, old, uid, 'deleted', nameOf(table, old));
    return { data: [{ id }], error: null };
  }

  function rpc(fn, uid, { p_table: table, p_id: id, p_take_over: takeOver = false } = {}) {
    if (!state.applied) return { data: null, error: pgError('PGRST202', `Could not find the function public.${fn} in the schema cache`) };
    if (!uid) return { data: null, error: pgError('42501', `permission denied for function ${fn}`) };
    if (!SHARING_TABLES[table]) return { data: null, error: pgError('22023', 'Not a shared record table.') };
    const r = rowsOf(table).find((x) => x.id === id);
    const isOwner = !!r && r.user_id === uid;
    const member = !!r && shared(table, r) && isMember(uid, r.organization_id);
    const ok = (extra) => ({ data: { ok: true, ...extra }, error: null });
    const no = (reason, extra = {}) => ({ data: { ok: false, reason, ...extra }, error: null });
    const setLock = (by, since, expires) => {
      const next = { ...r, editing_by: by, editing_since: since, editing_expires: expires };
      write(table, id, next);
      logTransition(table, r, next, uid);
      return next;
    };
    if (fn === 'suite_record_take') {
      if (!r || (!isOwner && !member)) return no('not_found');
      if (!sharedEdit(table, r)) return isOwner ? ok({ needed: false, version: r.version }) : no('view_only');
      if (live(r) && r.editing_by !== uid && !(takeOver && isOwner)) {
        return no('locked', { editing_by: r.editing_by, editing_since: r.editing_since, editing_expires: r.editing_expires });
      }
      const since = live(r) && r.editing_by === uid ? r.editing_since : nowIso();
      const next = setLock(uid, since, expiry());
      return ok({ needed: true, editing_by: uid, editing_since: since, editing_expires: next.editing_expires, version: r.version });
    }
    if (fn === 'suite_record_renew') {
      if (!r || !(live(r) && r.editing_by === uid)) return no('not_holder');
      if (!(isOwner || (sharedEdit(table, r) && isMember(uid, r.organization_id)))) return no('not_holder');
      const next = setLock(uid, r.editing_since, expiry());
      return ok({ needed: true, editing_by: uid, editing_since: r.editing_since, editing_expires: next.editing_expires, version: r.version });
    }
    if (fn === 'suite_record_release') {
      if (!r || !r.editing_by) return ok({ needed: false });
      if (r.editing_by !== uid && !isOwner) return no('not_holder');
      setLock(null, null, null);
      return ok({ needed: false });
    }
    return { data: null, error: pgError('PGRST202', `Could not find the function public.${fn} in the schema cache`) };
  }

  function listChanges(table, uid, id) {
    if (!state.applied) return { data: null, error: pgError('42P01', 'relation "public.suite_record_changes" does not exist') };
    if (!uid) return { data: null, error: DENIED('suite_record_changes') };
    const r = rowsOf(table).find((x) => x.id === id);
    const readable = !!r && canSelect(table, r, uid);
    return { data: changes.filter((c) => c.table_name === table && c.record_id === id && (c.owner_id === uid || readable)).map((c) => ({ ...c })).reverse(), error: null };
  }

  /**
   * geo_wells children (tops, logs, zones, intervals, core images) follow the
   * well's check-out: the owner unless a colleague holds it, or the member who holds it.
   */
  function canWriteChild(uid, wellId) { return canWriteChildOf('geo_wells', uid, wellId); }
  function logChild(uid, wellId, what, verb, n = 1) { logChildOf('geo_wells', uid, wellId, what, verb, n); }

  /**
   * The same rule for any parent record whose child tables follow its
   * check-out (rb_cases and rb_production_data, rb_run_configs, rb_runs,
   * rb_results, migration 20261002130000): the owner unless a colleague
   * holds the check-out, or the member who holds it.
   */
  function canWriteChildOf(parentTable, uid, parentId) {
    const p = rowsOf(parentTable).find((x) => x.id === parentId);
    if (!p || !uid) return false;
    if (!state.applied) return p.user_id === uid;
    const heldByOther = sharedEdit(parentTable, p) && live(p) && p.editing_by !== uid;
    return (p.user_id === uid && !heldByOther) || colleagueOk(parentTable, p, uid);
  }
  /** A statement on a child table logs one 'updated' entry on its parent ("Production data: 13 added"). */
  function logChildOf(parentTable, uid, parentId, what, verb, n = 1) {
    const p = rowsOf(parentTable).find((x) => x.id === parentId);
    if (p && state.applied) logUpdated(parentTable, p, uid, `${what.charAt(0).toUpperCase()}${what.slice(1)}: ${n} ${verb}`, [what]);
  }

  /**
   * Put existing rows in a table without logging (fixtures, rows from before
   * the migration). Missing sharing columns get the migration's defaults.
   */
  function seed(table, rows, { owner = null } = {}) {
    const acc = ensure(table);
    const filled = (rows || []).map((row) => {
      const r = { ...row, user_id: row.user_id ?? owner };
      if (!state.applied) return r;
      const d = { org_access: 'view', organization_id: null, editing_by: null, editing_since: null, editing_expires: null, version: 1, updated_by: null, change_note: null };
      if (!byOrg(table)) d.visibility = 'private';
      return { ...d, ...r };
    });
    acc.set([...acc.get(), ...filled]);
    return filled.map((r) => ({ ...r }));
  }

  return {
    attach, seed, select, insert, update, remove, rpc, listChanges, canWriteChild, logChild, canWriteChildOf, logChildOf,
    members,
    isMember,
    /** Move the clock (expiry tests). */
    advance(msDelta) { offset += msDelta; },
    now: nowMs,
    setApplied(v) { state.applied = !!v; },
    get applied() { return state.applied; },
    /** Test seams. */
    _rows: (table) => rowsOf(table).map((r) => ({ ...r })),
    _changes: () => changes.map((c) => ({ ...c })),
    /** A service write (table owner): moves a check-out's expiry without the guard. */
    _expire(table, id) { const r = rowsOf(table).find((x) => x.id === id); if (r) write(table, id, { ...r, editing_expires: new Date(nowMs() - 60000).toISOString() }); },
  };
}
