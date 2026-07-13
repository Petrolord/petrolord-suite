// The real backend adapter: everything CorrelationWorkstation touches
// goes through this one object, so the /dev harness swaps in
// inMemoryBackend and the whole app runs without auth or DB (the
// WDM/Petrophysics harness pattern).
//
// Wells/curves/tops come from the shared registry
// (src/lib/wellsRegistry.js — geo_wells, geo_wells_logs, geo_wells_tops
// with owner-or-org RLS). Section state is app-private
// (geo_correlation_sections, owner-only).

import { supabase } from '@/lib/customSupabaseClient';
import {
  listWells, listLogs, downloadCurve, listTops,
  saveTop, updateTop, deleteTop, propagateTop,
} from '@/lib/wellsRegistry';

async function loadSection() {
  const { data, error } = await supabase.from('geo_correlation_sections')
    .select('*').order('updated_at', { ascending: false }).limit(1);
  if (error) throw new Error(`Could not load the section: ${error.message}`);
  return data?.[0] || null;
}

async function saveSection(patch) {
  const existing = await loadSection();
  if (existing) {
    const { data, error } = await supabase.from('geo_correlation_sections')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', existing.id).select().single();
    if (error) throw new Error(`Could not save the section: ${error.message}`);
    return data;
  }
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save sections.');
  const { data, error } = await supabase.from('geo_correlation_sections')
    .insert({ user_id: user.id, name: 'Default section', ...patch })
    .select().single();
  if (error) throw new Error(`Could not save the section: ${error.message}`);
  return data;
}

export function makeRegistryBackend() {
  return {
    listWells, listLogs, downloadCurve, listTops,
    saveTop, updateTop, deleteTop, propagateTop,
    loadSection, saveSection,
  };
}
