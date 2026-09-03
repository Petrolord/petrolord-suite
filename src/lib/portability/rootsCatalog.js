// Root candidates for the export dialog (Project Portability PP3a).
//
// Lists what the caller can pick as a package root for the PP3a families,
// under the caller's own session (row-level security decides visibility).
// These are pickers, not gates: any query error resolves to an empty list.

import { supabase } from '@/lib/customSupabaseClient';
import { SAVED_PROJECT_TABLES } from './familiesCore';

/** "saved_well_test_projects" -> "well test" */
export const appLabel = (table) => String(table).replace(/^saved_/, '').replace(/_projects$/, '').replace(/_/g, ' ');

const rowsOf = async (query) => {
  try {
    const { data, error } = await query;
    if (error) return [];
    return data || [];
  } catch (e) {
    return [];
  }
};

async function listSavedProjects() {
  const results = await Promise.allSettled(SAVED_PROJECT_TABLES.map(async (t) => {
    const rows = await rowsOf(supabase.from(t).select('id, project_name, updated_at'));
    return rows.map((r) => ({ id: r.id, name: r.project_name || `Project ${String(r.id).slice(0, 8)}`, table: t, subtitle: appLabel(t), updatedAt: r.updated_at || null }));
  }));
  return results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .map(({ updatedAt, ...rest }) => rest);
}

/**
 * @param {'po_field'|'epe_case'|'epe_assumption_set'|'sim_case'|'saved_project'} kind
 * @returns {Promise<Array<{ id: string, name: string, table?: string, subtitle?: string, organization_id?: string|null }>>}
 */
export async function listRootCandidates(kind) {
  switch (kind) {
    case 'po_field': {
      const rows = await rowsOf(supabase.from('po_fields').select('id, name, organization_id').order('name'));
      return rows.map((r) => ({ id: r.id, name: r.name, organization_id: r.organization_id ?? null }));
    }
    case 'epe_case': {
      const rows = await rowsOf(supabase.from('epe_cases').select('id, case_name, description').order('case_name'));
      return rows.map((r) => ({ id: r.id, name: r.case_name, subtitle: r.description || 'economics case' }));
    }
    case 'epe_assumption_set': {
      const rows = await rowsOf(supabase.from('epe_assumption_sets').select('id, name').order('name'));
      return rows.map((r) => ({ id: r.id, name: r.name || `Assumption set ${String(r.id).slice(0, 8)}`, subtitle: 'assumption set' }));
    }
    case 'sim_case': {
      const rows = await rowsOf(supabase.from('sim_cases').select('id, name, deck_source').order('name'));
      return rows.map((r) => ({ id: r.id, name: r.name, subtitle: r.deck_source || null }));
    }
    case 'saved_project':
      return listSavedProjects();
    default:
      return [];
  }
}
