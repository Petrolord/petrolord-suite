// Shared correlation sections service (Stratigraphy ST2, 2026-09-06).
//
// geo_correlation_sections is the section a user builds in Well
// Correlation; Stratigraphy Studio opens and saves the SAME rows (plan
// section 3.2 decision 7), so the service lives here and both backends
// import it. Owner-only rows (app-private pattern), stamped through the
// PP0 state kind.
//
// AppUpgrade WC-U2-001 (2026-09-29): named sections. A user keeps many rows
// (the table never had a one-per-user constraint and the name column was
// always there); they stay owner-only (programme decision 2026-09-29: org
// sharing would need an RLS change and a second engineer). No schema change.
// Called with no id, loadSection and saveSection keep their old meaning (the
// newest row), which is what Stratigraphy Studio opens.

import { supabase } from '@/lib/customSupabaseClient';
import { writeStamped } from '@/lib/stateVersion';
// PP0 state kind: registered in the section kit so the harness backends open
// rows the same way (AppUpgrade WC-U1). Rows open through openSectionRow,
// writes go through writeStamped.
import { CORRELATION_SECTION_KIND, openSectionRow } from '@/components/wells/section/sectionState';
import { sectionNameProblem, DEFAULT_SECTION_NAME } from '@/components/wells/section/sectionNames';

const TABLE = 'geo_correlation_sections';

/** The caller's sections, newest first, as list rows (not opened). */
export async function listSections() {
  const { data, error } = await supabase.from(TABLE)
    .select('id, name, well_ids, updated_at, created_at').order('updated_at', { ascending: false });
  if (error) throw new Error(`Could not list sections: ${error.message}`);
  return (data || []).map((r) => ({ id: r.id, name: r.name, wellCount: (r.well_ids || []).length, updated_at: r.updated_at }));
}

/** One section by id, or the newest when no id is given. */
export async function loadSection(id = null) {
  let q = supabase.from(TABLE).select('*');
  q = id ? q.eq('id', id).limit(1) : q.order('updated_at', { ascending: false }).limit(1);
  const { data, error } = await q;
  if (error) throw new Error(`Could not load the section: ${error.message}`);
  if (id && !data?.length) throw new Error('That section no longer exists (deleted in another tab?).');
  return openSectionRow(data?.[0] || null);
}

async function insertSection(name, patch) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save sections.');
  const { data, error } = await writeStamped(CORRELATION_SECTION_KIND,
    { user_id: user.id, ...patch, name },
    (row) => supabase.from(TABLE).insert(row).select().single());
  if (error) throw new Error(`Could not save the section: ${error.message}`);
  return data;
}

async function assertNameFree(name, exceptId = null) {
  const problem = sectionNameProblem(name, await listSections(), exceptId);
  if (problem) throw new Error(problem);
}

/**
 * Save the section. With `id` the row is updated; without it the newest row
 * is updated (the pre-U2 single-section behaviour), or a first row created.
 */
export async function saveSection(patch, { id = null } = {}) {
  const existing = id ? { id } : await loadSection();
  if (existing) {
    const { data, error } = await writeStamped(CORRELATION_SECTION_KIND,
      { ...patch, updated_at: new Date().toISOString() },
      (row) => supabase.from(TABLE).update(row).eq('id', existing.id).select().single());
    if (error) throw new Error(`Could not save the section: ${error.message}`);
    return data;
  }
  return insertSection(patch.name || DEFAULT_SECTION_NAME, patch);
}

/** A new named section (optionally carrying a copy of another's state). */
export async function createSection(name, patch = {}) {
  const n = String(name ?? '').trim();
  await assertNameFree(n);
  return insertSection(n, patch);
}

export async function renameSection(id, name) {
  const n = String(name ?? '').trim();
  await assertNameFree(n, id);
  const { data, error } = await supabase.from(TABLE).update({ name: n, updated_at: new Date().toISOString() }).eq('id', id).select('id, name');
  if (error) throw new Error(`Could not rename the section: ${error.message}`);
  if (!data?.length) throw new Error('Only the owner can rename a section.');
  return data[0];
}

export async function deleteSection(id) {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id');
  if (error) throw new Error(`Could not delete the section: ${error.message}`);
  if (!data?.length) throw new Error('Only the owner can delete a section.');
}
