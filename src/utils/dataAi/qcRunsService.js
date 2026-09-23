// Data Quality Studio persistence (Data & AI D1): dai_qc_runs.
//
// A QC run belongs to the ORGANIZATION: a data quality record is read by the
// people who later use the data, rarely by the person who ran the check.
// The same interface as createSavedProjectsService (list, save, load,
// remove), so the studio kit's useSavedProjects hook drives it unchanged;
// the shape and rules are ps_lopa_studies' (PS1, lopaStudiesService.js).
// Row scoping is the database's job (RLS through is_org_member, migration
// 20260923130000_d1_dai_qc_runs.sql); the organization filter here is the
// second fence and picks the right organization for a member of several.
//
// Rows are written stamped and opened through src/lib/stateVersion.js, so a
// run saved by a newer build is refused by an older one with a message.
import { supabase } from '@/lib/customSupabaseClient';
import { registerStateKind, openState, writeStamped } from '@/lib/stateVersion';

export const QC_RUNS_TABLE = 'dai_qc_runs';
export const QC_RUN_KIND = 'dai-qc-run';
export const QC_RUNS_MIGRATION = '20260923130000_d1_dai_qc_runs';

registerStateKind(QC_RUN_KIND, { current: 1, migrations: {}, label: 'QC run' });

export const NO_ORG_MESSAGE = 'QC runs are saved to your organization. Join or select an organization to save one.';

/**
 * @param {() => (string|null)} getOrgId the caller's current organization id
 */
export function createQcRunsService(getOrgId) {
  const orgId = () => {
    const id = getOrgId();
    if (!id) throw new Error(NO_ORG_MESSAGE);
    return id;
  };

  return {
    /** The organization's runs, most recently touched first. */
    async list() {
      const { data, error } = await supabase
        .from(QC_RUNS_TABLE)
        .select('id, name, source, summary, created_at, updated_at, created_by')
        .eq('organization_id', orgId())
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        name: r.name,
        source: r.source,
        summary: r.summary,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        createdBy: r.created_by,
      }));
    },

    /**
     * Upsert the whole run under its stable id. created_by and created_at
     * are never sent: the database fills them on insert and a trigger keeps
     * them on update.
     */
    async save(id, payload) {
      const org = orgId();
      const { error } = await writeStamped(QC_RUN_KIND, {
        id,
        organization_id: org,
        name: (payload?.name || '').trim() || 'Untitled QC run',
        source: payload?.source || null,
        payload,
        summary: payload?.summary || null,
        updated_at: new Date().toISOString(),
      }, (row) => supabase.from(QC_RUNS_TABLE).upsert(row));
      if (error) throw error;
      return { success: true };
    },

    /** One run's payload, or null when it is not there. */
    async load(id) {
      const { data, error } = await supabase
        .from(QC_RUNS_TABLE)
        .select('*')
        .eq('id', id)
        .eq('organization_id', orgId())
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { row } = openState(QC_RUN_KIND, data);
      return row?.payload ?? null;
    },

    /**
     * Delete one run. Only its author or an organization owner or admin may
     * (RLS). A refused delete touches no row and returns no error from
     * PostgREST, so the deleted rows are read back and an empty result is
     * reported as the refusal it is.
     */
    async remove(id) {
      const { data, error } = await supabase
        .from(QC_RUNS_TABLE)
        .delete()
        .eq('id', id)
        .eq('organization_id', orgId())
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Only the author of a QC run or an organization owner or admin can delete it.');
      }
      return { success: true };
    },
  };
}
