// Organisation sharing of saved records: the rules, with no I/O.
//
// One model for every Geoscience and Reservoir record table (migrations
// 20261002100000_suite_record_sharing.sql,
// 20261002110000_geo_wells_team_editing.sql and
// 20261002130000_reservoir_record_sharing.sql; design in
// docs/scope/OrgSharing-DESIGN-AND-STATUS.md):
//
//   The owner chooses per record: private, or shared with the organisation
//   where colleagues can view, or where colleagues can edit.
//   One editor at a time: a shared-edit record is taken for editing
//   (a check-out that lasts 30 minutes from the last save or renewal).
//   Every save names the version it was made from; a stale save is refused.
//   The server stamps who saved and logs who changed what.
//
// The database enforces all of it. These functions tell the UI what the
// database will say, so a control is never offered that would be refused.

export const LOCK_MINUTES = 30;

/** Tables under the sharing rules. sharedWhen: how a row says it is shared. */
export const SHARING_TABLES = {
  seismic_projects: { label: 'project', nameColumn: 'name', sharedWhen: 'visibility' },
  em_models: { label: 'model', nameColumn: 'name', sharedWhen: 'visibility' },
  saved_quickvol_projects: { label: 'project', nameColumn: 'project_name', sharedWhen: 'visibility' },
  rcp_prospects: { label: 'prospect', nameColumn: 'name', sharedWhen: 'visibility' },
  rp_projects: { label: 'project', nameColumn: 'name', sharedWhen: 'visibility' },
  geo_correlation_sections: { label: 'section', nameColumn: 'name', sharedWhen: 'visibility' },
  bf_wells: { label: 'model', nameColumn: 'name', sharedWhen: 'visibility' },
  geo_wells: { label: 'well', nameColumn: 'name', sharedWhen: 'organization_id' },
  // Reservoir round, Step 0a (migration 20261002130000_reservoir_record_sharing.sql).
  // Registered here so the store, the in-memory mirror and the .pld import
  // know these tables; each app adopts the share bar in its own round.
  saved_fluid_studio_projects: { label: 'project', nameColumn: 'project_name', sharedWhen: 'visibility' },
  saved_scal_projects: { label: 'project', nameColumn: 'project_name', sharedWhen: 'visibility' },
  saved_dca_projects: { label: 'project', nameColumn: 'project_name', sharedWhen: 'visibility' },
  saved_scenario_hub_projects: { label: 'project', nameColumn: 'project_name', sharedWhen: 'visibility' },
  saved_well_test_projects: { label: 'project', nameColumn: 'project_name', sharedWhen: 'visibility' },
  saved_waterflood_design_projects: { label: 'project', nameColumn: 'project_name', sharedWhen: 'visibility' },
  saved_vrr_projects: { label: 'project', nameColumn: 'project_name', sharedWhen: 'visibility' },
  saved_rf_projects: { label: 'project', nameColumn: 'project_name', sharedWhen: 'visibility' },
  rb_cases: { label: 'case', nameColumn: 'name', sharedWhen: 'visibility' },
  sim_cases: { label: 'case', nameColumn: 'name', sharedWhen: 'visibility' },
  // Risked Reserves Valuation U1 (migration 20261002151500_rrv_valuations.sql):
  // one saved valuation per prospect and user
  rrv_valuations: { label: 'valuation', nameColumn: 'name', sharedWhen: 'visibility' },
};

/** The columns the sharing model adds (what `sharingOf` keeps). */
export const SHARING_COLUMNS = [
  'visibility', 'organization_id', 'org_access', 'editing_by', 'editing_since', 'editing_expires',
  'version', 'updated_by', 'updated_at',
];

export const tableSpec = (table) => {
  const spec = SHARING_TABLES[table];
  if (!spec) throw new Error(`${table} is not a shared record table.`);
  return spec;
};

/** The sharing state of a row as a small object an app can keep beside its own shape. */
export function sharingOf(row) {
  if (!row) return null;
  const out = { id: row.id, user_id: row.user_id ?? null };
  for (const c of SHARING_COLUMNS) out[c] = row[c] ?? null;
  return out;
}

export function isShared(table, row) {
  if (!row || !row.organization_id) return false;
  return tableSpec(table).sharedWhen === 'organization_id' ? true : row.visibility === 'organization';
}

const ms = (t) => (t ? new Date(t).getTime() : NaN);

/**
 * What the signed-in user may do with a record right now.
 * @param {string} table
 * @param {Object} row        a row or `sharingOf(row)`
 * @param {{ userId: ?string, now?: number, available?: boolean }} ctx
 *   available false = the database has no sharing columns yet (before the
 *   migration): every record is the owner's alone, as before.
 */
export function accessOf(table, row, { userId = null, now = Date.now(), available = true } = {}) {
  const isOwner = !!row && !!userId && row.user_id === userId;
  if (!row) return { available, isOwner: false, shared: false, orgAccess: 'view', lock: noLock(), canWrite: false, canTake: false, mode: 'none' };
  if (!available) return { available, isOwner, shared: false, orgAccess: 'view', lock: noLock(), canWrite: isOwner, canTake: false, mode: isOwner ? 'own-private' : 'none' };
  const shared = isShared(table, row);
  const orgAccess = row.org_access === 'edit' ? 'edit' : 'view';
  const sharedEdit = shared && orgAccess === 'edit';
  const live = !!row.editing_by && ms(row.editing_expires) > now;
  const lock = {
    by: live ? row.editing_by : null,
    since: live ? row.editing_since : null,
    expires: live ? row.editing_expires : null,
    live,
    mine: live && row.editing_by === userId,
  };
  let mode;
  if (isOwner) mode = !shared ? 'own-private' : sharedEdit ? 'own-shared-edit' : 'own-shared-view';
  else mode = sharedEdit ? 'colleague-edit' : shared ? 'colleague-view' : 'none';
  // The UI rule is one step stricter than the database for the owner: on a
  // shared-edit record everyone, the owner included, takes the record
  // before editing, so colleagues always see who is working on it.
  const canWrite = sharedEdit ? lock.mine : isOwner;
  const canTake = sharedEdit && !lock.mine && (isOwner || mode === 'colleague-edit');
  return { available, isOwner, shared, orgAccess, sharedEdit, lock, canWrite, canTake, canTakeOver: isOwner && live && !lock.mine, mode };
}
const noLock = () => ({ by: null, since: null, expires: null, live: false, mine: false });

/** A refused write, with the reason the user needs. */
export class RecordConflict extends Error {
  /** @param {'stale'|'locked'|'view_only'|'gone'|'not_owner'|'no_checkout'} kind */
  constructor(kind, message, info = {}) {
    super(message);
    this.name = 'RecordConflict';
    this.kind = kind;
    this.info = info;
  }
}
export const isRecordConflict = (e) => e instanceof RecordConflict || e?.name === 'RecordConflict';

/** "14:05" today, "2 Oct 14:05" otherwise (local time). */
export function whenText(iso, now = Date.now()) {
  if (!iso) return 'an unknown time';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'an unknown time';
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const n = new Date(now);
  if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) return hm;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${hm}`;
}

export const COLLEAGUE = 'A colleague';

/** The sentences the user reads (no em dashes, owner copy rule). */
export const messages = {
  stale: (name, at) => `${name || COLLEAGUE} saved a newer version at ${whenText(at)}. Reload, or save yours as a copy.`,
  locked: (name, since) => `Being edited by ${name || COLLEAGUE} since ${whenText(since)}. You can read it, or save a copy.`,
  viewOnly: (name) => `Shared by ${name || COLLEAGUE} for viewing. Save a copy to work on your own version.`,
  noCheckout: () => 'Start editing first: this record is shared for editing, one person at a time.',
  gone: () => 'This record is no longer shared with you, or it was deleted. Save a copy to keep your work.',
  notOwner: () => 'Only the owner changes how a record is shared.',
  noOrganisation: () => 'You are not in an organisation, so there is nobody to share with.',
  notAvailable: () => 'Sharing with your organisation is not switched on for this database yet. Records stay private until it is.',
  expired: () => 'Your editing session ended after 30 minutes without a save. Start editing again to continue.',
};

/** Own rows first, then rows colleagues shared, each in the order given. */
export function splitOwnAndShared(rows, userId) {
  const own = []; const shared = [];
  for (const r of rows || []) (r?.user_id && userId && r.user_id !== userId ? shared : own).push(r);
  return { own, shared };
}

/** "Name (copy)", "Name (copy 2)", ... not clashing with `taken` (case ignored). */
export function copyName(name, taken = []) {
  const base = String(name || 'Untitled').replace(/\s*\(copy(?: \d+)?\)\s*$/i, '').trim() || 'Untitled';
  const used = new Set((taken || []).map((t) => String(t || '').trim().toLowerCase()));
  let candidate = `${base} (copy)`;
  for (let i = 2; used.has(candidate.toLowerCase()); i += 1) candidate = `${base} (copy ${i})`;
  return candidate;
}

/** Plain words for a change-log row. */
export function describeChange(change, labels = {}) {
  const fields = Array.isArray(change?.changed_fields) ? change.changed_fields : [];
  const named = fields.map((f) => labels[f] || String(f).replace(/_/g, ' '));
  switch (change?.action) {
    case 'created': return 'Created';
    case 'deleted': return 'Deleted';
    case 'shared': return change.summary || 'Shared with the organisation';
    case 'access_changed': return change.summary || 'Changed the sharing';
    case 'checked_out': return 'Started editing';
    case 'released': return change.summary || 'Finished editing';
    case 'taken_over': return 'Took over editing (owner)';
    case 'updated': {
      const what = named.length ? `Changed ${named.join(', ')}` : 'Saved';
      const times = change.change_count > 1 ? ` (${change.change_count} saves)` : '';
      return change.summary ? `${change.summary}${named.length ? `: ${named.join(', ')}` : ''}${times}` : `${what}${times}`;
    }
    default: return change?.summary || String(change?.action || 'Changed');
  }
}
