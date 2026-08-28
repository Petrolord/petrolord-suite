// po_* production data spine persistence (Production P1) — direct RLS
// calls (house pattern, modeled on wellsRegistry.js). Tables +
// policies: supabase/migrations/20260829120000_p1_create_po_spine.sql.
//
// SHARED service: every production app reads the spine through here —
// Surveillance (P2), Allocation (P3), the lift studios (P4-P7), the
// network solver (P11) and the intervention planner (P12).
//
// Sharing model (the geo_wells model): po_fields rows are private by
// default; shareField stamps the owner's organization_id on the FIELD
// row and children (wells, ledger, tests, deferments, allocation
// factors) inherit visibility through it; org members read, only the
// owner ever writes. RLS enforces all of this server-side — nothing
// here filters by user id.
//
// Well identity: po_wells.name is the as-imported label; geo_well_id is
// the wellsRegistry linkage. Downstream joins are by id, never name.
// Units are the ledger convention: liquids stb, gas Mscf, rates stb/d
// and Mscf/d, pressures psia (the CSV importer normalizes at the
// boundary).

import { supabase } from '@/lib/customSupabaseClient';

// Supabase rejects very large payloads; bulk writes go up in chunks.
const CHUNK = 500;

async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('You must be signed in to use production data.');
  return user;
}

function chunked(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

// ---- fields ---------------------------------------------------------------

/** Own fields + fields shared with the caller's organizations (RLS
 *  filters; is_own drives the UI's badges). */
export async function listFields() {
  const [{ data, error }, { data: { user } }] = await Promise.all([
    supabase.from('po_fields').select('*').order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ]);
  if (error) throw new Error(`Could not load fields: ${error.message}`);
  return (data || []).map((f) => ({ ...f, is_own: !!user && f.user_id === user.id }));
}

/** @param {{name: string, description?: ?string}} f */
export async function saveField(f) {
  const user = await requireUser();
  const { data, error } = await supabase.from('po_fields')
    .insert({ user_id: user.id, name: f.name, description: f.description || null })
    .select().single();
  if (error) throw new Error(`Could not save field: ${error.message}`);
  return data;
}

/** Owner-only updates (RLS rejects everyone else). */
export async function updateField(fieldId, patch) {
  const { data, error } = await supabase.from('po_fields')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', fieldId).select();
  if (error) throw new Error(`Could not update field: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can edit this field (org sharing is read-only).');
  }
  return data[0];
}

/** Delete a field and everything under it (FK cascade). */
export async function deleteField(fieldId) {
  const { data, error } = await supabase.from('po_fields')
    .delete().eq('id', fieldId).select('id');
  if (error) throw new Error(`Could not delete field: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can delete this field (org sharing is read-only).');
  }
}

/** Share a field (and all its production data) read-only with an
 *  organization the owner belongs to. RLS re-checks membership. */
export async function shareField(fieldId, organizationId) {
  if (!organizationId) throw new Error('Pick the organization to share with.');
  return updateField(fieldId, { organization_id: organizationId });
}

/** Back to private. Org members lose read access immediately. */
export async function unshareField(fieldId) {
  return updateField(fieldId, { organization_id: null });
}

// ---- wells ----------------------------------------------------------------

export async function listPoWells(fieldId) {
  const { data, error } = await supabase.from('po_wells')
    .select('*').eq('field_id', fieldId).order('name', { ascending: true });
  if (error) throw new Error(`Could not load wells: ${error.message}`);
  return data || [];
}

/** @param {{name: string, uwi?: ?string, wellType?: string}} w */
export async function addPoWell(fieldId, w) {
  const user = await requireUser();
  const { data, error } = await supabase.from('po_wells')
    .insert({
      user_id: user.id,
      field_id: fieldId,
      name: w.name,
      uwi: w.uwi || null,
      well_type: w.wellType || 'producer',
    })
    .select().single();
  if (error) throw new Error(`Could not add well: ${error.message}`);
  return data;
}

export async function updatePoWell(wellId, patch) {
  const { data, error } = await supabase.from('po_wells')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', wellId).select();
  if (error) throw new Error(`Could not update well: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can edit wells (org sharing is read-only).');
  }
  return data[0];
}

export async function deletePoWell(wellId) {
  const { data, error } = await supabase.from('po_wells')
    .delete().eq('id', wellId).select('id');
  if (error) throw new Error(`Could not delete well: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can delete wells (org sharing is read-only).');
  }
}

/** Set (or clear, with null) a well's wellsRegistry link. */
export async function linkWellToRegistry(poWellId, geoWellId) {
  return updatePoWell(poWellId, { geo_well_id: geoWellId || null });
}

/** Apply suggestRegistryLinks output (utils/production/registryLink.js)
 *  after the user confirms it. Per-well so one bad row doesn't fail the
 *  batch; returns the applied count. */
export async function applyRegistryLinks(suggestions) {
  let applied = 0;
  for (const s of suggestions || []) {
    await linkWellToRegistry(s.poWellId, s.geoWellId);
    applied += 1;
  }
  return applied;
}

/**
 * Resolve importer well labels to po_wells rows, creating the missing
 * ones (importer support). Returns Map<name, row>. Existing names match
 * exactly (the unique key is (field_id, name) — labels are preserved
 * as imported).
 */
export async function ensurePoWells(fieldId, names) {
  const user = await requireUser();
  const wanted = [...new Set((names || []).map((n) => String(n).trim()).filter(Boolean))];
  const existing = await listPoWells(fieldId);
  const byName = new Map(existing.map((w) => [w.name, w]));

  const missing = wanted.filter((n) => !byName.has(n));
  for (const batch of chunked(missing)) {
    const { data, error } = await supabase.from('po_wells')
      .insert(batch.map((name) => ({ user_id: user.id, field_id: fieldId, name })))
      .select();
    if (error) throw new Error(`Could not create wells: ${error.message}`);
    (data || []).forEach((w) => byName.set(w.name, w));
  }
  return byName;
}

// ---- daily ledger ---------------------------------------------------------

/**
 * Import parseDailyProductionCSV rows for a field: resolves/creates the
 * wells, then upserts on (well_id, prod_date) — re-importing a
 * corrected file overwrites in place, chunked. Duplicate (well, date)
 * rows within the file collapse last-wins (Postgres upserts reject a
 * key touched twice in one statement); the count comes back so the UI
 * can say so. Returns {wells, upserted, duplicatesCollapsed}.
 */
export async function importDailyProduction(fieldId, rows) {
  const user = await requireUser();
  const wells = await ensurePoWells(fieldId, rows.map((r) => r.well));
  const byKey = new Map();
  rows.forEach((r) => byKey.set(`${r.well}\u0000${r.date}`, r));
  const duplicatesCollapsed = rows.length - byKey.size;
  const payload = [...byKey.values()].map((r) => ({
    user_id: user.id,
    well_id: wells.get(r.well).id,
    prod_date: r.date,
    oil_stb: r.oil_stb,
    water_stb: r.water_stb,
    gas_mscf: r.gas_mscf,
    winj_stb: r.winj_stb,
    ginj_mscf: r.ginj_mscf,
    hours_on: r.hours_on ?? null,
    source: 'csv',
    updated_at: new Date().toISOString(),
  }));
  let upserted = 0;
  for (const batch of chunked(payload)) {
    const { data, error } = await supabase.from('po_daily_production')
      .upsert(batch, { onConflict: 'well_id,prod_date' })
      .select('id');
    if (error) throw new Error(`Could not import production rows: ${error.message}`);
    upserted += (data || []).length;
  }
  return { wells: wells.size, upserted, duplicatesCollapsed };
}

/**
 * Read a field's ledger, well names attached, date-ascending.
 * @param {{wellId?: string, from?: string, to?: string}} [opts]
 */
export async function getDailyProduction(fieldId, opts = {}) {
  let q = supabase.from('po_daily_production')
    .select('*, po_wells!inner(id, name, field_id, well_type, geo_well_id)')
    .eq('po_wells.field_id', fieldId)
    .order('prod_date', { ascending: true });
  if (opts.wellId) q = q.eq('well_id', opts.wellId);
  if (opts.from) q = q.gte('prod_date', opts.from);
  if (opts.to) q = q.lte('prod_date', opts.to);
  const { data, error } = await q;
  if (error) throw new Error(`Could not load production data: ${error.message}`);
  return (data || []).map(({ po_wells: w, ...row }) => ({ ...row, well: w }));
}

// ---- well tests -----------------------------------------------------------

/** Import parseWellTestCSV rows; wells resolved/created like the
 *  ledger. Plain inserts (tests are point records, not keyed). */
export async function importWellTests(fieldId, tests) {
  const user = await requireUser();
  const wells = await ensurePoWells(fieldId, tests.map((t) => t.well));
  const payload = tests.map((t) => ({
    user_id: user.id,
    well_id: wells.get(t.well).id,
    test_date: t.date,
    duration_hours: t.duration_hours,
    oil_rate_stbd: t.oil_rate_stbd,
    water_rate_stbd: t.water_rate_stbd,
    gas_rate_mscfd: t.gas_rate_mscfd,
    thp_psia: t.thp_psia,
    choke_64ths: t.choke_64ths,
  }));
  let inserted = 0;
  for (const batch of chunked(payload)) {
    const { data, error } = await supabase.from('po_well_tests')
      .insert(batch).select('id');
    if (error) throw new Error(`Could not import well tests: ${error.message}`);
    inserted += (data || []).length;
  }
  return { wells: wells.size, inserted };
}

/** Every test in a field, well names attached, newest first — the P3
 *  QC view (listWellTests stays the per-well read). */
export async function listFieldWellTests(fieldId) {
  const { data, error } = await supabase.from('po_well_tests')
    .select('*, po_wells!inner(id, name, field_id, well_type)')
    .eq('po_wells.field_id', fieldId)
    .order('test_date', { ascending: false });
  if (error) throw new Error(`Could not load well tests: ${error.message}`);
  return (data || []).map(({ po_wells: w, ...row }) => ({ ...row, well: w }));
}

export async function listWellTests(wellId) {
  const { data, error } = await supabase.from('po_well_tests')
    .select('*').eq('well_id', wellId).order('test_date', { ascending: false });
  if (error) throw new Error(`Could not load well tests: ${error.message}`);
  return data || [];
}

/** QC verdict + edits from the P3 studio (owner-only via RLS). */
export async function updateWellTest(testId, patch) {
  const { data, error } = await supabase.from('po_well_tests')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', testId).select();
  if (error) throw new Error(`Could not update well test: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can edit well tests (org sharing is read-only).');
  }
  return data[0];
}

export async function deleteWellTest(testId) {
  const { data, error } = await supabase.from('po_well_tests')
    .delete().eq('id', testId).select('id');
  if (error) throw new Error(`Could not delete well test: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can delete well tests (org sharing is read-only).');
  }
}

// ---- deferments -----------------------------------------------------------

export const DEFERMENT_CATEGORIES = [
  'well', 'reservoir', 'surface_facility', 'export',
  'planned_maintenance', 'weather', 'regulatory', 'other',
];

/** @param {{startDate: string, endDate?: ?string, category: string,
 *   cause?: ?string, oilDeferredStb?: number, waterDeferredStb?: number,
 *   gasDeferredMscf?: number, comment?: ?string}} d */
export async function saveDeferment(wellId, d) {
  const user = await requireUser();
  const { data, error } = await supabase.from('po_deferments')
    .insert({
      user_id: user.id,
      well_id: wellId,
      start_date: d.startDate,
      end_date: d.endDate || null,
      category: d.category,
      cause: d.cause || null,
      oil_deferred_stb: d.oilDeferredStb ?? 0,
      water_deferred_stb: d.waterDeferredStb ?? 0,
      gas_deferred_mscf: d.gasDeferredMscf ?? 0,
      comment: d.comment || null,
    })
    .select().single();
  if (error) throw new Error(`Could not save deferment: ${error.message}`);
  return data;
}

/** A field's deferment events, newest first, well names attached. */
export async function listDeferments(fieldId) {
  const { data, error } = await supabase.from('po_deferments')
    .select('*, po_wells!inner(id, name, field_id)')
    .eq('po_wells.field_id', fieldId)
    .order('start_date', { ascending: false });
  if (error) throw new Error(`Could not load deferments: ${error.message}`);
  return (data || []).map(({ po_wells: w, ...row }) => ({ ...row, well: w }));
}

export async function updateDeferment(defermentId, patch) {
  const { data, error } = await supabase.from('po_deferments')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', defermentId).select();
  if (error) throw new Error(`Could not update deferment: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can edit deferments (org sharing is read-only).');
  }
  return data[0];
}

export async function deleteDeferment(defermentId) {
  const { data, error } = await supabase.from('po_deferments')
    .delete().eq('id', defermentId).select('id');
  if (error) throw new Error(`Could not delete deferment: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can delete deferments (org sharing is read-only).');
  }
}

// ---- allocation factors ---------------------------------------------------

/** Upsert one well-month's factors (period 'YYYY-MM-01'); written by
 *  the P3 Allocation Studio. */
export async function upsertAllocationFactor(wellId, periodMonth, factors) {
  const user = await requireUser();
  const { data, error } = await supabase.from('po_allocation_factors')
    .upsert({
      user_id: user.id,
      well_id: wellId,
      period_month: periodMonth,
      oil_factor: factors.oil ?? 1,
      water_factor: factors.water ?? 1,
      gas_factor: factors.gas ?? 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'well_id,period_month' })
    .select().single();
  if (error) throw new Error(`Could not save allocation factors: ${error.message}`);
  return data;
}

export async function listAllocationFactors(fieldId) {
  const { data, error } = await supabase.from('po_allocation_factors')
    .select('*, po_wells!inner(id, name, field_id)')
    .eq('po_wells.field_id', fieldId)
    .order('period_month', { ascending: false });
  if (error) throw new Error(`Could not load allocation factors: ${error.message}`);
  return (data || []).map(({ po_wells: w, ...row }) => ({ ...row, well: w }));
}


// ---- field totals (P3: the measurement allocation starts from) ------------

/** A field's metered totals, date-ascending (the allocation basis). */
export async function getFieldTotals(fieldId, opts = {}) {
  let q = supabase.from('po_field_totals')
    .select('*').eq('field_id', fieldId)
    .order('total_date', { ascending: true });
  if (opts.from) q = q.gte('total_date', opts.from);
  if (opts.to) q = q.lte('total_date', opts.to);
  const { data, error } = await q;
  if (error) throw new Error(`Could not load field totals: ${error.message}`);
  return data || [];
}

/**
 * Import parseFieldTotalsCSV rows. Upsert on (field_id, total_date), so
 * a corrected meter file overwrites in place; in-file duplicate dates
 * collapse last-wins and are counted (Postgres rejects a key touched
 * twice in one statement).
 * @returns {{upserted: number, duplicatesCollapsed: number}}
 */
export async function importFieldTotals(fieldId, rows) {
  const user = await requireUser();
  const byDate = new Map();
  (rows || []).forEach((r) => byDate.set(r.date, r));
  const duplicatesCollapsed = (rows || []).length - byDate.size;
  const payload = [...byDate.values()].map((r) => ({
    user_id: user.id,
    field_id: fieldId,
    total_date: r.date,
    oil_stb: r.oil_stb,
    water_stb: r.water_stb,
    gas_mscf: r.gas_mscf,
    source: 'csv',
    updated_at: new Date().toISOString(),
  }));
  let upserted = 0;
  for (const batch of chunked(payload)) {
    const { data, error } = await supabase.from('po_field_totals')
      .upsert(batch, { onConflict: 'field_id,total_date' })
      .select('id');
    if (error) throw new Error(`Could not import field totals: ${error.message}`);
    upserted += (data || []).length;
  }
  return { upserted, duplicatesCollapsed };
}

export async function saveFieldTotal(fieldId, t) {
  const user = await requireUser();
  const { data, error } = await supabase.from('po_field_totals')
    .upsert({
      user_id: user.id,
      field_id: fieldId,
      total_date: t.date,
      oil_stb: t.oil_stb ?? 0,
      water_stb: t.water_stb ?? 0,
      gas_mscf: t.gas_mscf ?? 0,
      source: t.source || 'manual',
      comment: t.comment || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'field_id,total_date' })
    .select().single();
  if (error) throw new Error(`Could not save field total: ${error.message}`);
  return data;
}

export async function deleteFieldTotal(totalId) {
  const { data, error } = await supabase.from('po_field_totals')
    .delete().eq('id', totalId).select('id');
  if (error) throw new Error(`Could not delete field total: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can delete field totals (org sharing is read-only).');
  }
}

// ---- allocation write-backs (P3) ------------------------------------------

/** Bulk upsert of allocation factors (monthlyFactors output), chunked.
 *  Returns the row count written. */
export async function upsertAllocationFactors(rows) {
  const user = await requireUser();
  const payload = (rows || []).map((r) => ({
    user_id: user.id,
    well_id: r.wellId,
    period_month: r.periodMonth,
    oil_factor: r.factors?.oil ?? 1,
    water_factor: r.factors?.water ?? 1,
    gas_factor: r.factors?.gas ?? 1,
    updated_at: new Date().toISOString(),
  }));
  let written = 0;
  for (const batch of chunked(payload)) {
    const { data, error } = await supabase.from('po_allocation_factors')
      .upsert(batch, { onConflict: 'well_id,period_month' })
      .select('id');
    if (error) throw new Error(`Could not save allocation factors: ${error.message}`);
    written += (data || []).length;
  }
  return written;
}

/**
 * Write allocated volumes into the daily ledger (allocatedLedgerRows
 * output), stamped source 'allocation'. This OVERWRITES the (well,
 * date) rows it touches — it is the deliberate "book the allocation"
 * step, never a side effect of running one.
 */
export async function writeAllocatedProduction(rows) {
  const user = await requireUser();
  const byKey = new Map();
  (rows || []).forEach((r) => byKey.set(`${r.wellId} ${r.date}`, r));
  const payload = [...byKey.values()].map((r) => ({
    user_id: user.id,
    well_id: r.wellId,
    prod_date: r.date,
    oil_stb: Math.max(0, r.oil_stb || 0),
    water_stb: Math.max(0, r.water_stb || 0),
    gas_mscf: Math.max(0, r.gas_mscf || 0),
    hours_on: Number.isFinite(r.hours_on) ? r.hours_on : null,
    source: 'allocation',
    updated_at: new Date().toISOString(),
  }));
  let written = 0;
  for (const batch of chunked(payload)) {
    const { data, error } = await supabase.from('po_daily_production')
      .upsert(batch, { onConflict: 'well_id,prod_date' })
      .select('id');
    if (error) throw new Error(`Could not write allocated volumes: ${error.message}`);
    written += (data || []).length;
  }
  return written;
}

// ---- well models (P6.5) ---------------------------------------------------
//
// The well's OWN description -- trajectory, fluid, temperature, inflow
// and completion -- shared by every production studio that needs one.
// Before this, the gas lift, ESP and rod pump studios each stored their
// own copy inside their own design payloads, so one well could be
// described three ways and the P3 nodal cross-check of well tests had
// nothing to check against.
//
// A design still keeps the DUTY it was run at. What lives here is only
// what belongs to the well itself. See src/utils/production/wellModel.js
// for where that line is drawn and why.

/**
 * The current model for one well, or null when it has none.
 * A well without a model is an ordinary state, not an error: the spine
 * has always known wells before it knew what they do.
 */
export async function getWellModel(wellId) {
  if (!wellId) return null;
  const { data, error } = await supabase.from('po_well_models')
    .select('*')
    .eq('well_id', wellId)
    .maybeSingle();
  if (error) throw new Error(`Could not load the well model: ${error.message}`);
  return data || null;
}

/** Every model in a field, well attached, for pickers. */
export async function listFieldWellModels(fieldId) {
  const { data, error } = await supabase.from('po_well_models')
    .select('*, po_wells!inner(id, name, field_id, well_type)')
    .eq('po_wells.field_id', fieldId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Could not load well models: ${error.message}`);
  return (data || []).map(({ po_wells: w, ...row }) => ({ ...row, well: w }));
}

/**
 * Save the current model for a well. One model per well, so this
 * overwrites rather than accumulating revisions; the unique key on
 * well_id is what makes "what does this well do" have one answer.
 */
export async function upsertWellModel(wellId, modelData, notes = null) {
  const user = await requireUser();
  if (!wellId) throw new Error('A well model has to belong to a well on the spine.');
  const { data, error } = await supabase.from('po_well_models')
    .upsert({
      user_id: user.id,
      well_id: wellId,
      model_data: modelData,
      notes,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'well_id' })
    .select()
    .single();
  if (error) throw new Error(`Could not save the well model: ${error.message}`);
  return data;
}

/** Remove a well's model. The well and its production stay. */
export async function deleteWellModel(wellId) {
  const { error } = await supabase.from('po_well_models').delete().eq('well_id', wellId);
  if (error) throw new Error(`Could not delete the well model: ${error.message}`);
}
