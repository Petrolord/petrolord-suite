// geo_wells registry persistence (Well Data Manager G1.2) — direct RLS
// calls (house pattern). Tables + policies:
// supabase/migrations/20260713100000_create_wells_registry.sql.
//
// SHARED service (moved out of the Well Data Manager app at the second
// consumer, G1.4): Seismolord's wellsService adapts these functions to
// its legacy shapes; every future geoscience app (G2 petrophysics, G3
// correlation, G4 mapping) reads the registry through here too.
//
// Sharing model (locked in WellDataManager-PLAN.md): rows are private
// by default; shareWell stamps the owner's organization_id on the WELL
// row and children inherit visibility through it; org members read,
// only the owner ever writes. RLS enforces all of this server-side —
// nothing here filters by user id.
//
// Curve samples are little-endian float32 objects in the private
// `wells` bucket at {user_id}/{well_id}/logs/{log_id}.f32 — never large
// jsonb (the Seismolord brick rule). Log ids are generated client-side
// so the storage path can be written into the metadata row atomically.
//
// jsonb payload shapes (byte-compatible with seismic_wells):
//   deviation:  [{md, inc, azi}]        md ascending (validated at import)
//   checkshots: [{tvdss_m, twt_ms}]     strictly monotonic (validated)

import { supabase } from '@/lib/customSupabaseClient';
import { wellNameKey, wellNameClashMessage } from '@/lib/wellNames';
import { PLATFORM_BUILD } from '@/lib/platformBuild';
import { isUnknownColumnError } from '@/lib/stateVersion';
import { DATUM_COLUMNS, datumInsertFields, datumPatch, datumColumnsPresent, validateDatum } from '@/lib/wellDatum';

export { wellNameKey, wellNameClashMessage };

const BUCKET = 'wells';

/**
 * WDM-U2-F01 (programme decision 2026-09-29, no migration): geo_wells
 * surface_x / surface_y are NOT NULL, so every writer refuses a missing or
 * non-numeric coordinate BEFORE the request and the raw not-null error
 * never reaches a user. Shared with the harness backend.
 * @returns {?string} the message, or null when the value is a finite number
 */
export function surfaceCoordProblem(name, value, unitLabel = null) {
  if (value === null || value === undefined || String(value).trim() === '' || !Number.isFinite(Number(value))) {
    const what = value === null || value === undefined || String(value).trim() === '' ? 'is required' : 'must be a number';
    return `${name} ${what}${unitLabel ? ` (${unitLabel})` : ''}: the registry stores a surface location for every well.`;
  }
  return null;
}

// ---- app_build stamping (Well Data Manager U2-013) --------------------------
// Every registry row this module writes says which build wrote it
// (app_build, from the PP0 registry migration 20260902120500, applied
// 2026-09-03), so a saved-state defect can be traced to a release. If an
// environment lacks the column, the write is retried once without it and
// the session stops stamping; saves never break on the stamp.

let buildColumnMissing = false;
/** Test hook. */
export function _resetBuildStamp() { buildColumnMissing = false; }
const withBuild = (payload) => {
  if (buildColumnMissing) return payload;
  const add = (r) => ({ ...r, app_build: PLATFORM_BUILD.sha });
  return Array.isArray(payload) ? payload.map(add) : add(payload);
};
/** Run a write with the stamp; on "no app_build column", once more without. */
async function writeWithBuild(payload, run) {
  const first = await run(withBuild(payload));
  if (!first?.error || buildColumnMissing || !isUnknownColumnError(first.error) || !/app_build/.test(String(first.error.message || ''))) return first;
  buildColumnMissing = true;
  return run(payload);
}

// ---- datum columns (Well Data Manager U2-007) ------------------------------
// The datum model's columns arrive with migration 20261002090000. Staging
// shares the production database, so until the owner applies it a write
// that names them is refused: the write is then repeated without them and
// the session stops sending them. Reads tell the same story from the rows
// themselves (`'depth_ref_elev_m' in row`).

let datumColumnsMissing = false;
/** Test hook. */
export function _resetDatumColumns() { datumColumnsMissing = false; }
/** True once this session has seen that the registry has no datum columns. */
export function datumColumnsKnownMissing() { return datumColumnsMissing; }
const noteDatumColumns = (rows) => {
  const first = Array.isArray(rows) ? rows[0] : rows;
  if (first && typeof first === 'object') datumColumnsMissing = !datumColumnsPresent(first);
};
const isDatumColumnError = (error) => !!error && (isUnknownColumnError(error) || error.code === 'PGRST204' || /schema cache/i.test(String(error.message || '')))
  && DATUM_COLUMNS.some((c) => String(error.message || '').includes(c));
const withoutDatum = (row) => { const r = { ...row }; for (const c of DATUM_COLUMNS) delete r[c]; return r; };

/**
 * The datum a new well is saved with: `w.datum` (a validated datum from the
 * editor or a confirmed LAS proposal), or a bare `w.kbM`. A missing or blank
 * KB is "not entered" (NULL), never 0.
 */
function datumOfNewWell(w) {
  if (w.datum) {
    const { datum, errors } = validateDatum(w.datum);
    if (errors.length) throw new Error(errors[0]);
    return datum;
  }
  if (w.kbM === null || w.kbM === undefined || w.kbM === '') return { refKind: null, refElevM: null };
  const v = Number(w.kbM);
  if (!Number.isFinite(v)) throw new Error('KB must be a number (metres above datum).');
  return { refKind: 'KB', refElevM: v };
}

async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('You must be signed in to use the well registry.');
  return user;
}

/** Storage object path for a log's samples — must match the bucket
 *  policies ({user_id}/{well_id}/logs/{log_id}.f32). */
export const curvePath = (userId, wellId, logId) => `${userId}/${wellId}/logs/${logId}.f32`;

// ---- wells ---------------------------------------------------------------

// The pure name rule lives in src/lib/wellNames.js (no I/O) so the harness
// backends and the .pld importer share it; re-exported below for callers.

/** Server-backed check used by saveWell and updateWell: reads the wells
 *  the caller can see (RLS: own + org-shared) and applies the rule. */
export async function assertWellNameFree(name, { exceptId = null, userId = null } = {}) {
  const { data, error } = await supabase.from('geo_wells').select('id, name, user_id');
  if (error) throw new Error(`Could not check well names: ${error.message}`);
  const msg = wellNameClashMessage(name, data || [], { exceptId, userId });
  if (msg) throw new Error(msg);
}

/**
 * @param {{name: string, uwi?: ?string, surfaceX: number, surfaceY: number,
 *   kbM?: number, tdMdM?: ?number, crs?: ?string, xyUnit?: ?string,
 *   crsProvenance?: ?Object, crsNote?: ?string, unitsNote?: ?string,
 *   deviation?: Array, checkshots?: Array}} w
 *   crs is the structured tag the coordinates are stored IN (CRS
 *   program): 'EPSG:<code>' | 'CUSTOM:<uuid>' | 'LOCAL'; null/absent =
 *   unknown placement (legacy behavior, badge in the UI). crs_note
 *   stays free-text context.
 */
const isMissingColumn = (error) => error && (error.code === 'PGRST204' || /column .* does not exist|schema cache/i.test(error.message || ''));

export async function saveWell(w) {
  for (const [n, v] of [['Surface X', w.surfaceX], ['Surface Y', w.surfaceY]]) {
    const msg = surfaceCoordProblem(n, v);
    if (msg) throw new Error(msg);
  }
  const datum = datumOfNewWell(w);
  const user = await requireUser();
  await assertWellNameFree(w.name, { userId: user.id });
  let row = {
    user_id: user.id,
    name: String(w.name).trim(),
    uwi: w.uwi || null,
    surface_x: w.surfaceX,
    surface_y: w.surfaceY,
    // kb_m mirrors the reference elevation for builds that predate the
    // datum model; 0 here only because the column is NOT NULL (the datum
    // columns say "not entered")
    kb_m: datum.refElevM ?? 0,
    ...(datumColumnsMissing ? {} : datumInsertFields(datum)),
    td_md_m: w.tdMdM ?? null,
    crs: w.crs || null,
    xy_unit: w.xyUnit || null,
    crs_provenance: w.crsProvenance || null,
    crs_note: w.crsNote || null,
    units_note: w.unitsNote || null,
    deviation: w.deviation || [],
    checkshots: w.checkshots || [],
  };
  // PT1: how the checkshots were entered (convention, KB and survey used).
  // The column arrives with migration 20260904090000; until it is applied
  // the insert retries without it so well creation never breaks.
  if (w.checkshotsProvenance) row.checkshots_provenance = w.checkshotsProvenance;
  const insert = (r) => supabase.from('geo_wells').insert(r).select().single();
  let { data, error } = await writeWithBuild(row, insert);
  if (error && !datumColumnsMissing && isDatumColumnError(error)) {
    // migration 20261002090000 not applied here yet: save the well as before
    datumColumnsMissing = true;
    row = withoutDatum(row);
    ({ data, error } = await writeWithBuild(row, insert));
  }
  if (error && row.checkshots_provenance && isMissingColumn(error)) {
    delete row.checkshots_provenance;
    ({ data, error } = await writeWithBuild(row, insert));
  }
  if (error) throw new Error(`Could not save well: ${error.message}`);
  return data;
}

/**
 * Owner edit of the well's own data after creation (PT1): the surface
 * location, KB, TD, the deviation survey and the checkshot table,
 * validated BEFORE the patch (the registry's only guard, since
 * updateWell is a raw patch). Callers convert typed checkshots through
 * the welldata engine first and pass the stored rows plus their
 * provenance.
 *
 * PT8 (2026-09-05): surfaceX / surfaceY join the editable set. They are
 * world coordinates already expressed in the well's own CRS, so nothing
 * is transformed here — the guard is only that a value is a finite
 * number; null clears the coordinate.
 */
export async function updateWellData(wellId, {
  surfaceX, surfaceY, kbM, tdMdM, deviation, checkshots, checkshotsProvenance,
} = {}) {
  const patch = {};
  for (const [name, value, col] of [['Surface X', surfaceX, 'surface_x'], ['Surface Y', surfaceY, 'surface_y']]) {
    if (value === undefined) continue;
    const msg = surfaceCoordProblem(name, value);
    if (msg) throw new Error(msg);
    patch[col] = Number(value);
  }
  if (kbM !== undefined) {
    // Kept for callers that only know a KB. The datum door is
    // updateWellDatum; this states the same elevation as a kelly bushing
    // so the stated value and kb_m never disagree.
    const v = Number(kbM);
    if (!Number.isFinite(v)) throw new Error('KB must be a number (metres above datum).');
    patch.kb_m = v;
    if (!datumColumnsMissing) { patch.depth_ref_kind = 'KB'; patch.depth_ref_elev_m = v; }
  }
  if (tdMdM !== undefined) {
    if (tdMdM === null) patch.td_md_m = null;
    else {
      const v = Number(tdMdM);
      if (!(v > 0)) throw new Error('TD must be a positive number (m MD).');
      patch.td_md_m = v;
    }
  }
  if (deviation !== undefined) {
    const stations = (deviation || []).map((d) => ({ md: Number(d.md), inc: Number(d.inc), azi: Number(d.azi) }));
    if (stations.length === 1) throw new Error('A deviation survey needs at least 2 stations (or none for a vertical well).');
    for (let i = 0; i < stations.length; i++) {
      const st = stations[i];
      if (![st.md, st.inc, st.azi].every(Number.isFinite)) throw new Error(`Station ${i + 1}: MD, inclination and azimuth must be numbers.`);
      if (st.inc < 0 || st.inc > 180) throw new Error(`Station ${i + 1}: inclination ${st.inc}° is outside 0–180°.`);
      if (i && !(st.md > stations[i - 1].md)) throw new Error(`Station ${i + 1}: MD ${st.md} does not increase (previous station is at ${stations[i - 1].md}).`);
    }
    patch.deviation = stations;
  }
  if (checkshots !== undefined) {
    const rows = validateStoredCheckshotsShape(checkshots);
    patch.checkshots = rows;
  }
  if (checkshotsProvenance !== undefined) patch.checkshots_provenance = checkshotsProvenance;
  if (!Object.keys(patch).length) throw new Error('Nothing to update.');
  const update = (p) => supabase.from('geo_wells').update(p).eq('id', wellId).select().single();
  let { data, error } = await writeWithBuild({ ...patch, updated_at: new Date().toISOString() }, update);
  if (error && 'depth_ref_elev_m' in patch && isDatumColumnError(error)) {
    datumColumnsMissing = true;
    delete patch.depth_ref_kind;
    delete patch.depth_ref_elev_m;
    ({ data, error } = await writeWithBuild({ ...patch, updated_at: new Date().toISOString() }, update));
  }
  if (error && 'checkshots_provenance' in patch && isMissingColumn(error)) {
    delete patch.checkshots_provenance;
    ({ data, error } = await writeWithBuild({ ...patch, updated_at: new Date().toISOString() }, update));
  }
  if (error) throw new Error(`Could not update well data: ${error.message}`);
  return data;
}

/**
 * Save a well's datum (depth reference kind and elevation, environment,
 * ground level or water depth, vertical datum, unit): THE door for every
 * app that corrects it (Well Data Manager Header, Wellsite Config).
 *
 * With the datum columns every field is saved and the change record is
 * appended to datum_changes. Before the migration only the elevation can be
 * kept (in kb_m), the record is merged into crs_provenance, and `dropped`
 * names what was not saved so the caller can say so.
 *
 * @param {Object} well the registry row as loaded (decides which side of the migration it is on)
 * @param {Object} next a datum (metres); validated here
 * @param {{record?: ?Object, checkshots?: Array, checkshotsProvenance?: ?Object}} [opts]
 *   record: datumChangeRecord(...) entry; checkshots: the table re-derived
 *   through the new elevation, saved in the same write
 * @returns {Promise<{row: Object, dropped: string[], columns: boolean}>}
 */
export async function updateWellDatum(well, next, { record = null, checkshots, checkshotsProvenance } = {}) {
  if (!well || !well.id) throw new Error('Pick the well whose depth reference is being set.');
  const checked = validateDatum(next);
  if (checked.errors.length) throw new Error(checked.errors[0]);
  const extra = {};
  if (checkshots !== undefined) extra.checkshots = validateStoredCheckshotsShape(checkshots);
  if (checkshotsProvenance !== undefined) extra.checkshots_provenance = checkshotsProvenance;
  const update = (p) => supabase.from('geo_wells').update(p).eq('id', well.id).select();
  let built = datumPatch(well, checked.datum, { record, columns: datumColumnsPresent(well) && !datumColumnsMissing });
  let { data, error } = await writeWithBuild({ ...built.patch, ...extra, updated_at: new Date().toISOString() }, update);
  if (error && built.columns && isDatumColumnError(error)) {
    datumColumnsMissing = true;
    built = datumPatch(well, checked.datum, { record, columns: false });
    ({ data, error } = await writeWithBuild({ ...built.patch, ...extra, updated_at: new Date().toISOString() }, update));
  }
  if (error) throw new Error(`Could not save the depth reference: ${error.message}`);
  if (!data || !data.length) throw new Error('Only the owner can change the depth reference of this well (organisation sharing is read-only).');
  return { row: data[0], dropped: built.dropped, columns: built.columns };
}

/** Stored-core shape check shared with the harness backend (the full
 *  conversion lives in the welldata checkshots engine). */
export function validateStoredCheckshotsShape(rows) {
  if (!Array.isArray(rows)) throw new Error('Checkshots must be a list of rows.');
  if (rows.length === 1) throw new Error('A checkshot table needs at least 2 rows (or none).');
  const out = rows.map((r, i) => {
    const tvdss = Number(r?.tvdss_m);
    const twt = Number(r?.twt_ms);
    if (!Number.isFinite(tvdss) || !Number.isFinite(twt)) throw new Error(`Row ${i + 1}: checkshot depth and time must be numbers.`);
    const o = { tvdss_m: tvdss, twt_ms: twt };
    if (r.md_m !== undefined && r.md_m !== null && Number.isFinite(Number(r.md_m))) o.md_m = Number(r.md_m);
    return o;
  });
  for (let i = 1; i < out.length; i++) {
    if (!(out[i].tvdss_m > out[i - 1].tvdss_m) || !(out[i].twt_ms > out[i - 1].twt_ms)) {
      throw new Error(`Row ${i + 1}: checkshots must strictly increase in depth and time. Fix the table rather than let the app re-sort it.`);
    }
  }
  return out;
}

/** Own wells + wells shared with the caller's organizations (RLS does
 *  the filtering; is_own is derived for the tree's badges). */
export async function listWells() {
  const [{ data, error }, { data: { user } }] = await Promise.all([
    supabase.from('geo_wells').select('*').order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ]);
  if (error) throw new Error(`Could not load wells: ${error.message}`);
  noteDatumColumns(data);
  return (data || []).map((w) => ({ ...w, is_own: !!user && w.user_id === user.id }));
}

/** listWells + each well's tops embedded in one query (Seismolord's
 *  viewers consume wells with tops attached). Tops come back in the
 *  registry row shape ({name, md_m, ...}), MD-ascending. */
export async function listWellsWithTops() {
  const [{ data, error }, { data: { user } }] = await Promise.all([
    supabase.from('geo_wells')
      .select('*, geo_wells_tops(id, name, md_m, interpreter, surface_type, unit_id, confidence, age_ma, hiatus_to_ma)')
      .order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ]);
  if (error) throw new Error(`Could not load wells: ${error.message}`);
  return (data || []).map(({ geo_wells_tops: tops, ...w }) => ({
    ...w,
    is_own: !!user && w.user_id === user.id,
    tops: (tops || []).slice().sort((a, b) => a.md_m - b.md_m),
  }));
}

// ---- registry-wide reads (Well Data Manager U2-005 / U2-006) --------------
// One query per child table for every well the caller can see (RLS does the
// filtering), paged past PostgREST's 1,000-row cap, so the inventory and the
// cross-well tops sheet never issue one request per well.

const PAGE_ROWS = 1000;
async function selectAllRows(table, columns, what) {
  const out = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await supabase.from(table).select(columns)
      .order('id', { ascending: true }).range(from, from + PAGE_ROWS - 1);
    if (error) throw new Error(`Could not load ${what}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < PAGE_ROWS) return out;
  }
}

/** Log metadata (no samples) of every visible well: the inventory's input. */
export async function listAllLogMeta() {
  return selectAllRows('geo_wells_logs',
    'id, well_id, mnemonic, unit, description, start_md_m, stop_md_m, step_m, n_samples, null_count, source_file, provenance, storage_path, created_at',
    'log inventory');
}

/** Every top of every visible well (the cross-well tops sheet). */
export async function listAllTops() {
  return selectAllRows('geo_wells_tops', '*', 'tops');
}

export async function getWell(wellId) {
  const { data, error } = await supabase.from('geo_wells')
    .select('*').eq('id', wellId).single();
  if (error) throw new Error(`Could not load well: ${error.message}`);
  noteDatumColumns(data);
  return data;
}

/** Owner-only header/survey updates (RLS rejects everyone else). */
export async function updateWell(wellId, patch) {
  for (const [n, col] of [['Surface X', 'surface_x'], ['Surface Y', 'surface_y']]) {
    if (patch && col in patch) { const msg = surfaceCoordProblem(n, patch[col]); if (msg) throw new Error(msg); }
  }
  if (patch && patch.name !== undefined) {
    const user = await requireUser();
    await assertWellNameFree(patch.name, { exceptId: wellId, userId: user.id });
    patch = { ...patch, name: String(patch.name).trim() };
  }
  const { data, error } = await writeWithBuild({ ...patch, updated_at: new Date().toISOString() },
    (p) => supabase.from('geo_wells').update(p).eq('id', wellId).select().single());
  if (error) throw new Error(`Could not update well: ${error.message}`);
  return data;
}

/** Delete a well, its children (FK cascade) and its curve objects.
 *  Storage first: after the row is gone the path policies still allow
 *  the owner's delete, but a failed storage pass would otherwise leave
 *  orphans with no metadata pointing at them. */
export async function deleteWell(well) {
  const user = await requireUser();
  const prefix = `${user.id}/${well.id}/logs`;
  const { data: objects } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (objects && objects.length) {
    const { error: rmError } = await supabase.storage.from(BUCKET)
      .remove(objects.map((o) => `${prefix}/${o.name}`));
    if (rmError) throw new Error(`Could not delete the well's log data: ${rmError.message}`);
  }
  // .select() so an RLS-filtered delete (not the owner: org-shared
  // read-only rows) surfaces as an error instead of a silent no-op
  const { data, error } = await supabase.from('geo_wells')
    .delete().eq('id', well.id).select('id');
  if (error) throw new Error(`Could not delete well: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can delete this well (org sharing is read-only).');
  }
}

// ---- org sharing ---------------------------------------------------------

/** Share a well (and everything under it) read-only with an
 *  organization the owner belongs to. RLS re-checks membership. */
export async function shareWell(wellId, organizationId) {
  if (!organizationId) throw new Error('Pick the organization to share with.');
  return updateWell(wellId, { organization_id: organizationId });
}

/** Back to private. Org members lose read access immediately. */
export async function unshareWell(wellId) {
  return updateWell(wellId, { organization_id: null });
}

// ---- zones (normalized, Petrophysics Studio G2.2) -------------------------
// geo_wells_zones: visibility inherits the well row; writes owner-only
// (RLS). `properties` is the PUBLISHED petrophysical summary jsonb —
// written only by an explicit publish action, never by recompute.

export async function listZones(wellId) {
  const { data, error } = await supabase.from('geo_wells_zones')
    .select('*').eq('well_id', wellId).order('top_md_m', { ascending: true });
  if (error) throw new Error(`Could not load zones: ${error.message}`);
  return data || [];
}

/** @param {{name: string, topMdM: number, baseMdM: number}} z */
export async function saveZone(wellId, z) {
  // PT8: `fromTops` records which tops drew the edges, so a later top move
  // re-cuts exactly this zone. It rides in properties, which the publish
  // path merges rather than replaces.
  const properties = z.fromTops ? { from_tops: z.fromTops } : {};
  const { data, error } = await writeWithBuild({ well_id: wellId, name: z.name, top_md_m: z.topMdM, base_md_m: z.baseMdM, properties },
    (r) => supabase.from('geo_wells_zones').insert(r).select().single());
  if (error) throw new Error(`Could not save zone: ${error.message}`);
  return data;
}

export async function updateZone(zoneId, patch) {
  const { data, error } = await writeWithBuild({ ...patch, updated_at: new Date().toISOString() },
    (p) => supabase.from('geo_wells_zones').update(p).eq('id', zoneId).select());
  if (error) throw new Error(`Could not update zone: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can edit zones (org sharing is read-only).');
  }
  return data[0];
}

export async function deleteZone(zone) {
  const { data, error } = await supabase.from('geo_wells_zones')
    .delete().eq('id', zone.id).select('id');
  if (error) throw new Error(`Could not delete zone: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can delete zones (org sharing is read-only).');
  }
}

// ---- tops (normalized) ---------------------------------------------------

export async function listTops(wellId) {
  const { data, error } = await supabase.from('geo_wells_tops')
    .select('*').eq('well_id', wellId).order('md_m', { ascending: true });
  if (error) throw new Error(`Could not load tops: ${error.message}`);
  return data || [];
}

/** Replace a well's tops wholesale — imports are all-or-nothing, same
 *  as the Seismolord import dialogs. */
export async function replaceTops(wellId, tops) {
  const { error: delError } = await supabase.from('geo_wells_tops')
    .delete().eq('well_id', wellId);
  if (delError) throw new Error(`Could not clear existing tops: ${delError.message}`);
  if (!tops.length) return [];
  const { data, error } = await writeWithBuild(tops.map((t) => topRow(wellId, { ...t, mdM: t.md ?? t.md_m ?? t.mdM })),
    (rows) => supabase.from('geo_wells_tops').insert(rows).select());
  if (error) throw new Error(`Could not save tops: ${error.message}`);
  return data;
}

// Per-top CRUD (Well Correlation G3) — the correlation UI picks and
// drag-edits individual tops rather than replacing the whole set. All
// owner-only via the existing geo_wells_tops RLS (no policy change); a
// 0-row write surfaces as an owner-only error instead of a silent
// no-op, exactly like deleteWell.
//
// Typed surfaces (Stratigraphy Studio ST0, migration 20260906180000): a
// top may also carry surface_type (Catuneanu code, default formation_top),
// unit_id (geo_strat_units), confidence (high|medium|low), age_ma and
// notes. Absent fields are left to the column defaults, so every caller
// that never heard of them keeps working unchanged.

export const STRAT_TOP_FIELDS = ['surface_type', 'unit_id', 'confidence', 'age_ma', 'notes', 'hiatus_to_ma'];

/** The insert row of a top: name, md_m, interpreter plus any typed-surface field given. */
export function topRow(wellId, top) {
  const row = { well_id: wellId, name: top.name, md_m: top.mdM, interpreter: top.interpreter || null };
  for (const k of STRAT_TOP_FIELDS) {
    if (top[k] === undefined) continue;
    if (k === 'age_ma' || k === 'hiatus_to_ma') row[k] = top[k] === '' || top[k] === null ? null : Number(top[k]);
    else row[k] = top[k] === '' ? null : top[k];
  }
  return row;
}

/** @param {{name: string, mdM: number, interpreter?: ?string, surface_type?: string, unit_id?: ?string, confidence?: ?string, age_ma?: ?number, notes?: ?string}} top */
export async function saveTop(wellId, top) {
  const { data, error } = await writeWithBuild(topRow(wellId, top),
    (r) => supabase.from('geo_wells_tops').insert(r).select().single());
  if (error) throw new Error(`Could not add top: ${error.message}`);
  return data;
}

export async function updateTop(topId, patch) {
  const row = { ...patch, updated_at: new Date().toISOString() };
  if (patch.mdM !== undefined) { row.md_m = patch.mdM; delete row.mdM; }
  for (const k of ['age_ma', 'hiatus_to_ma']) if (patch[k] !== undefined) row[k] = patch[k] === '' || patch[k] === null ? null : Number(patch[k]);
  for (const k of ['unit_id', 'confidence', 'notes']) if (row[k] === '') row[k] = null;
  const { data, error } = await writeWithBuild(row, (r) => supabase.from('geo_wells_tops').update(r).eq('id', topId).select());
  if (error) throw new Error(`Could not update top: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can edit tops (org sharing is read-only).');
  }
  return data[0];
}

export async function deleteTop(top) {
  const { data, error } = await supabase.from('geo_wells_tops')
    .delete().eq('id', top.id).select('id');
  if (error) throw new Error(`Could not delete top: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can delete tops (org sharing is read-only).');
  }
}

/**
 * Propagate a named top to several owned wells at a given MD (v1
 * correlation: seed the same top across the section, user drags to
 * correct — no auto-correlation). Skips a well that already has the
 * top (idempotent re-propagate); RLS drops silently-unowned wells, and
 * the caller learns which succeeded from the returned rows.
 * @param {string} name @param {Array<{wellId: string, mdM: number}>} targets
 * @param {{interpreter?: ?string, confidence?: ?string}} [attrs] pick attributes on every new row (WC-U2-010; existing columns)
 */
export async function propagateTop(name, targets, attrs = {}) {
  if (!targets.length) return [];
  const created = [];
  for (const t of targets) {
    const existing = await listTops(t.wellId);
    if (existing.some((x) => x.name === name)) continue;
    // per-well so one RLS-blocked well doesn't fail the whole batch
    const { data, error } = await writeWithBuild(topRow(t.wellId, { name, mdM: t.mdM, ...attrs }),
      (r) => supabase.from('geo_wells_tops').insert(r).select());
    if (error) throw new Error(`Could not propagate "${name}": ${error.message}`);
    if (data && data.length) created.push(data[0]);
  }
  return created;
}

// ---- logs (metadata rows + f32 curve objects) ------------------------------

export async function listLogs(wellId) {
  const { data, error } = await supabase.from('geo_wells_logs')
    .select('*').eq('well_id', wellId).order('created_at', { ascending: true });
  if (error) throw new Error(`Could not load logs: ${error.message}`);
  return data || [];
}

/**
 * Persist one prepared log (engine/lasImport.js prepareLogs shape):
 * upload the f32 samples, then insert the metadata row pointing at
 * them; a failed insert removes the fresh object so nothing orphans.
 */
export async function saveLog(wellId, log) {
  const user = await requireUser();
  const logId = crypto.randomUUID();
  const path = curvePath(user.id, wellId, logId);

  const { error: upError } = await supabase.storage.from(BUCKET)
    .upload(path, new Blob([log.data.buffer], { type: 'application/octet-stream' }), {
      contentType: 'application/octet-stream',
      upsert: false,
    });
  if (upError) throw new Error(`Could not upload curve ${log.mnemonic}: ${upError.message}`);

  const { data, error } = await writeWithBuild({
      id: logId,
      well_id: wellId,
      mnemonic: log.mnemonic,
      description: log.description || null,
      unit: log.unit || null,
      start_md_m: log.startMdM,
      stop_md_m: log.stopMdM,
      step_m: log.stepM,
      n_samples: log.nSamples,
      null_count: log.nullCount,
      source_file: log.provenance?.source_file || null,
      provenance: log.provenance || {},
      storage_path: path,
    }, (r) => supabase.from('geo_wells_logs').insert(r).select().single());
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw new Error(`Could not save log ${log.mnemonic}: ${error.message}`);
  }
  return data;
}

/** All prepared logs of one LAS import, sequentially — clear first
 *  failure beats a shotgun of half-written curves.
 *  U2-013: onProgress({done, total, mnemonic}) before each curve and at the
 *  end; cancel.cancelled = true stops before the next curve and throws a
 *  LogsStoppedError carrying the curves already saved (they stay). */
export async function saveLogs(wellId, logs, { onProgress = null, cancel = null } = {}) {
  const saved = [];
  for (let i = 0; i < logs.length; i++) {
    if (cancel?.cancelled) throw new LogsStoppedError(saved, logs.length);
    onProgress?.({ done: i, total: logs.length, mnemonic: logs[i].mnemonic });
    saved.push(await saveLog(wellId, logs[i]));
  }
  onProgress?.({ done: logs.length, total: logs.length, mnemonic: null });
  return saved;
}

/** Thrown by saveLogs when the user stops an import part-way. */
export class LogsStoppedError extends Error {
  constructor(saved, total) {
    super(`Import stopped after ${saved.length} of ${total} curves. The ${saved.length} saved stay on the well; delete them on the Logs tab if you do not want them.`);
    this.name = 'LogsStoppedError';
    this.saved = saved;
    this.total = total;
  }
}

export async function deleteLog(log) {
  const { error: rmError } = await supabase.storage.from(BUCKET).remove([log.storage_path]);
  if (rmError) throw new Error(`Could not delete curve data: ${rmError.message}`);
  const { error } = await supabase.from('geo_wells_logs').delete().eq('id', log.id);
  if (error) throw new Error(`Could not delete log: ${error.message}`);
}

/**
 * Rewrite one stored curve in place (same log id and storage path) with
 * new samples and a metadata patch: the WDM-U2-010 reorient of curves an
 * earlier release stored bottom-up. Owner-only (storage and row RLS). The
 * object is replaced first; if the row update then fails, the original
 * samples are put back so object and row never disagree.
 * @param {Object} log registry row @param {Float32Array} data @param {Object} patch
 */
export async function rewriteLogSamples(log, data, patch, { original = null } = {}) {
  if (data.length !== Number(log.n_samples)) {
    throw new Error(`Curve ${log.mnemonic}: ${data.length} samples, the row says ${log.n_samples}.`);
  }
  const blob = (arr) => new Blob([Float32Array.from(arr).buffer], { type: 'application/octet-stream' });
  const { error: upError } = await supabase.storage.from(BUCKET)
    .update(log.storage_path, blob(data), { contentType: 'application/octet-stream', upsert: true });
  if (upError) throw new Error(`Could not rewrite curve ${log.mnemonic}: ${upError.message}`);
  const { data: rows, error } = await writeWithBuild(patch, (p) => supabase.from('geo_wells_logs').update(p).eq('id', log.id).select());
  if (error || !rows || !rows.length) {
    if (original) {
      await supabase.storage.from(BUCKET)
        .update(log.storage_path, blob(original), { contentType: 'application/octet-stream', upsert: true }).catch(() => {});
    }
    throw new Error(error ? `Could not update log ${log.mnemonic}: ${error.message}`
      : 'Only the owner can change logs (org sharing is read-only).');
  }
  return rows[0];
}

/**
 * Correct a stored curve's unit label without touching its samples
 * (PETRO-U2-001: a Petrel NPHI in percent labelled v/v, a density with no
 * unit). Owner-only by RLS. The change is recorded in the row's provenance
 * so every reader can see the label was corrected, from what, and when.
 * @param {Object} log registry row @param {string} unit
 */
export async function updateLogUnit(log, unit, { byApp = null } = {}) {
  const provenance = {
    ...(log.provenance || {}),
    unit_corrected: { from: log.unit ?? null, to: unit, at: new Date().toISOString(), by_app: byApp },
  };
  const { data: rows, error } = await writeWithBuild({ unit, provenance }, (p) => supabase.from('geo_wells_logs').update(p).eq('id', log.id).select());
  if (error) throw new Error(`Could not update the unit of ${log.mnemonic}: ${error.message}`);
  if (!rows || !rows.length) throw new Error('Only the owner can change logs (org sharing is read-only).');
  return rows[0];
}

/** Fetch one curve's samples. Works for org-shared wells too — the
 *  storage read policy resolves the owning well from the path. */
export async function downloadCurve(log) {
  const { data, error } = await supabase.storage.from(BUCKET).download(log.storage_path);
  if (error) throw new Error(`Could not download curve ${log.mnemonic}: ${error.message}`);
  const buf = await data.arrayBuffer();
  if (buf.byteLength !== log.n_samples * 4) {
    throw new Error(`Curve ${log.mnemonic}: object is ${buf.byteLength} bytes but the `
      + `metadata says ${log.n_samples} float32 samples — re-import the log.`);
  }
  return new Float32Array(buf);
}
