// Shared correlation sections service (Stratigraphy ST2, 2026-09-06).
//
// geo_correlation_sections is the section a user builds in Well
// Correlation; Stratigraphy Studio opens and saves the SAME rows (plan
// section 3.2 decision 7), so the service lives here and both backends
// import it. Owner-only rows (app-private pattern), stamped through the
// PP0 state kind.

import { supabase } from '@/lib/customSupabaseClient';
import { registerStateKind, openStateRow, writeStamped } from '@/lib/stateVersion';

// PP0 state kind (docs/scope/ProjectPortability-PLAN.md §4.3): version 1 is
// the current row shape; a future shape change bumps `current` and adds
// migrations[n]. Rows open through openStateRow, writes go through writeStamped.
const CORRELATION_SECTION_KIND = 'correlation-section';
registerStateKind(CORRELATION_SECTION_KIND, { current: 1, label: 'correlation section' });

export async function loadSection() {
  const { data, error } = await supabase.from('geo_correlation_sections')
    .select('*').order('updated_at', { ascending: false }).limit(1);
  if (error) throw new Error(`Could not load the section: ${error.message}`);
  return openStateRow(CORRELATION_SECTION_KIND, data?.[0] || null);
}

export async function saveSection(patch) {
  const existing = await loadSection();
  if (existing) {
    const { data, error } = await writeStamped(CORRELATION_SECTION_KIND,
      { ...patch, updated_at: new Date().toISOString() },
      (row) => supabase.from('geo_correlation_sections').update(row).eq('id', existing.id).select().single());
    if (error) throw new Error(`Could not save the section: ${error.message}`);
    return data;
  }
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save sections.');
  const { data, error } = await writeStamped(CORRELATION_SECTION_KIND,
    { user_id: user.id, name: 'Default section', ...patch },
    (row) => supabase.from('geo_correlation_sections').insert(row).select().single());
  if (error) throw new Error(`Could not save the section: ${error.message}`);
  return data;
}

