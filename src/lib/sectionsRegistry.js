// Shared correlation sections service (Stratigraphy ST2, 2026-09-06).
//
// geo_correlation_sections is the section a user builds in Well
// Correlation; Stratigraphy Studio opens and saves the SAME rows (plan
// section 3.2 decision 7), so the service lives here and both backends
// import it. Rows are the owner's (the owner can share one with the
// organisation), stamped through the PP0 state kind.
//
// AppUpgrade WC-U2-001 (2026-09-29): named sections. A user keeps many rows
// (the table never had a one-per-user constraint and the name column was
// always there). Called with no id, loadSection and saveSection keep their
// old meaning (the user's OWN newest row), which is what Stratigraphy Studio
// opens.
//
// Organisation sharing (2026-10-02, migration 20261002100000, second engineer
// approved): the owner can share a section with the organisation, for
// viewing or for editing one person at a time (src/lib/recordSharing). The
// list then carries the sections colleagues shared; a save names the version
// the section was opened at, and a refusal comes back as a sentence. Before
// the migration is applied every call behaves as it did.

import { supabase } from '@/lib/customSupabaseClient';
import { writeStamped } from '@/lib/stateVersion';
// PP0 state kind: registered in the section kit so the harness backends open
// rows the same way (AppUpgrade WC-U1). Rows open through openSectionRow,
// writes go through writeStamped.
import { CORRELATION_SECTION_KIND, openSectionRow } from '@/components/wells/section/sectionState';
import { sectionNameProblem, DEFAULT_SECTION_NAME } from '@/components/wells/section/sectionNames';
import { supabaseSharingStore, SHARING_COLUMNS } from '@/lib/recordSharing';

const TABLE = 'geo_correlation_sections';

const sharing = () => supabaseSharingStore();
async function currentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}
const conflictOr = (error, prefix) => (error.name === 'RecordConflict' ? error.message : `${prefix}: ${error.message}`);

/**
 * The sections the caller can open, newest first, as list rows (not opened):
 * their own, and those colleagues shared with the organisation. Each row
 * carries its owner and sharing state (visibility, access, check-out, last
 * author) once the sharing migration is applied.
 */
export async function listSections() {
  const { available } = await sharing().capability(TABLE);
  const cols = ['id', 'name', 'well_ids', 'updated_at', 'created_at', 'user_id', ...(available ? SHARING_COLUMNS.filter((c) => c !== 'updated_at') : [])];
  const { data, error } = await supabase.from(TABLE).select(cols.join(', ')).order('updated_at', { ascending: false });
  if (error) throw new Error(`Could not list sections: ${error.message}`);
  return (data || []).map((r) => ({ ...r, wellCount: (r.well_ids || []).length, well_ids: undefined }));
}

/** One section by id, or the caller's own newest when no id is given. */
export async function loadSection(id = null) {
  let q = supabase.from(TABLE).select('*');
  if (id) q = q.eq('id', id).limit(1);
  else {
    const uid = await currentUserId();
    if (!uid) return openSectionRow(null);
    q = q.eq('user_id', uid).order('updated_at', { ascending: false }).limit(1);
  }
  const { data, error } = await q;
  if (error) throw new Error(`Could not load the section: ${error.message}`);
  if (id && !data?.length) throw new Error('That section no longer exists, or it is no longer shared with you.');
  // saves from here carry the version this editor now shows
  if (data?.[0]) sharing().trackOpened(TABLE, data[0]);
  return openSectionRow(data?.[0] || null);
}

async function insertSection(name, patch) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save sections.');
  const { data, error } = await writeStamped(CORRELATION_SECTION_KIND,
    { user_id: user.id, ...patch, name },
    (row) => supabase.from(TABLE).insert(row).select().single());
  if (error) throw new Error(`Could not save the section: ${error.message}`);
  sharing().trackOpened(TABLE, data);
  return data;
}

async function assertNameFree(name, exceptId = null) {
  // names are unique among the caller's own sections
  const uid = await currentUserId();
  const problem = sectionNameProblem(name, (await listSections()).filter((r) => !r.user_id || r.user_id === uid), exceptId);
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
      (row) => sharing().update(TABLE, existing.id, row, { note: 'Section saved' }));
    if (error) throw new Error(conflictOr(error, 'Could not save the section'));
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
  // a rename is not a content save of the open editor: it does not move the
  // version the editor will save from unless it was current
  const { data, error } = await supabase.from(TABLE).update({ name: n, updated_at: new Date().toISOString() }).eq('id', id).select('*');
  if (error) throw new Error(`Could not rename the section: ${error.message}`);
  if (!data?.length) throw new Error('Only the owner can rename a section.');
  const tracked = sharing().trackedVersion(TABLE, id);
  if (tracked != null && Number.isInteger(data[0].version) && data[0].version === tracked + 1) sharing().trackOpened(TABLE, data[0]);
  return { id: data[0].id, name: data[0].name };
}

export async function deleteSection(id) {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id');
  if (error) throw new Error(`Could not delete the section: ${error.message}`);
  if (!data?.length) throw new Error('Only the owner can delete a section.');
}
