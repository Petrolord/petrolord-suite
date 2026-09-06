// Stratigraphic units registry service (Stratigraphy Studio ST0, 2026-09-06).
//
// The one service that reads and writes geo_strat_units (the stratigraphic
// column: group > formation > member > bed with ages and colours). Every
// app goes through here, the same rule wellsRegistry.js holds for wells and
// tops (Stratigraphy-PLAN.md section 4). Rows are per user, org-shareable
// read-only through the geo_surfaces RLS pattern; writes are owner-only and
// a 0-row write surfaces as an owner-only error, never a silent no-op.
//
// Tops reference a unit through geo_wells_tops.unit_id; the typed-top
// fields themselves are written by wellsRegistry (saveTop / updateTop).

import { supabase } from '@/lib/customSupabaseClient';
import { registerStateKind, openStateRow, writeStamped } from '@/lib/stateVersion';

export const STRAT_UNIT_KIND = 'strat-unit';
registerStateKind(STRAT_UNIT_KIND, { current: 1, label: 'stratigraphic unit' });

export const UNIT_COLUMNS = ['name', 'rank', 'parent_id', 'order_index', 'age_top_ma', 'age_base_ma', 'colour', 'lithology', 'notes', 'organization_id'];

const numOrNull = (v) => (v === '' || v === undefined || v === null ? null : Number(v));

/** Pick the writable columns of a unit and coerce numbers; unknown keys are dropped. */
export function unitRow(u) {
  const row = {};
  for (const k of UNIT_COLUMNS) if (u[k] !== undefined) row[k] = u[k];
  if ('order_index' in row) row.order_index = row.order_index == null || row.order_index === '' ? null : Math.trunc(Number(row.order_index));
  if ('age_top_ma' in row) row.age_top_ma = numOrNull(row.age_top_ma);
  if ('age_base_ma' in row) row.age_base_ma = numOrNull(row.age_base_ma);
  if ('parent_id' in row && !row.parent_id) row.parent_id = null;
  if ('name' in row) row.name = String(row.name || '').trim();
  return row;
}

/** Every unit visible to the caller (own plus org-shared), column order. */
export async function listUnits() {
  const { data, error } = await supabase.from('geo_strat_units')
    .select('*')
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });
  if (error) throw new Error(`Could not load the stratigraphic column: ${error.message}`);
  return (data || []).map((r) => openStateRow(STRAT_UNIT_KIND, r));
}

export async function saveUnit(unit) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to add stratigraphic units.');
  const row = unitRow(unit);
  if (!row.name) throw new Error('The unit needs a name.');
  const { data, error } = await writeStamped(STRAT_UNIT_KIND,
    { user_id: user.id, ...row },
    (r) => supabase.from('geo_strat_units').insert(r).select().single());
  if (error) throw new Error(`Could not add the unit: ${error.message}`);
  return data;
}

export async function updateUnit(unitId, patch) {
  const row = { ...unitRow(patch), updated_at: new Date().toISOString() };
  if ('name' in row && !row.name) throw new Error('The unit needs a name.');
  const { data, error } = await writeStamped(STRAT_UNIT_KIND, row,
    (r) => supabase.from('geo_strat_units').update(r).eq('id', unitId).select());
  if (error) throw new Error(`Could not update the unit: ${error.message}`);
  if (!data || !data.length) throw new Error('Only the owner can edit stratigraphic units (org sharing is read-only).');
  return data[0];
}

/** Deletes one unit. Children keep their rows with parent_id cleared
 *  (FK on delete set null); tops that named it lose the reference the
 *  same way. */
export async function deleteUnit(unit) {
  const { data, error } = await supabase.from('geo_strat_units')
    .delete().eq('id', unit.id).select('id');
  if (error) throw new Error(`Could not delete the unit: ${error.message}`);
  if (!data || !data.length) throw new Error('Only the owner can delete stratigraphic units (org sharing is read-only).');
}

/** Share or unshare every own unit with an organization (the column is
 *  shared as a whole; a half-shared column would read as gaps to a
 *  teammate). */
export async function shareColumn(organizationId) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to share the column.');
  const { error } = await supabase.from('geo_strat_units')
    .update({ organization_id: organizationId, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);
  if (error) throw new Error(`Could not ${organizationId ? 'share' : 'unshare'} the column: ${error.message}`);
}
