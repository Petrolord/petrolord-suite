// QRA Studio persistence (Process Safety PS3): ps_qra_studies.
//
// A QRA study belongs to the ORGANIZATION, because a safety study is a
// shared engineering record: the people who revalidate it are rarely the
// people who wrote it. That is the difference from the saved_<app>_projects
// convention (one owner per row), and why this service exists instead of
// createSavedProjectsService.
//
// The same interface as that service (list, save, load, remove), so the
// studio kit's useSavedProjects hook drives it unchanged. Row scoping is the
// database's job (RLS through is_org_member, migration
// 20260921100000_ps3_qra_studies.sql); the organization filter here is the
// second fence and the one that picks the right organization for a member of
// several.
//
// Every row is written stamped and opened through src/lib/stateVersion.js
// (Project Portability PP0), so a study saved by a newer build is refused by
// an older one with a message rather than misread.
import { supabase } from '@/lib/customSupabaseClient';
import { registerStateKind, openState, writeStamped } from '@/lib/stateVersion';

export const QRA_STUDIES_TABLE = 'ps_qra_studies';
export const QRA_STUDY_KIND = 'ps-qra-study';
export const QRA_STUDIES_MIGRATION = '20260921100000_ps3_qra_studies';

registerStateKind(QRA_STUDY_KIND, { current: 1, migrations: {}, label: 'QRA study' });

export const NO_ORG_MESSAGE = 'QRA studies are saved to your organization. Join or select an organization to save one.';

/**
 * @param {() => (string|null)} getOrgId the caller's current organization id
 */
export function createQraStudiesService(getOrgId) {
  const orgId = () => {
    const id = getOrgId();
    if (!id) throw new Error(NO_ORG_MESSAGE);
    return id;
  };

  return {
    /** The organization's studies, most recently touched first. */
    async list() {
      const { data, error } = await supabase
        .from(QRA_STUDIES_TABLE)
        .select('id, name, created_at, updated_at, created_by')
        .eq('organization_id', orgId())
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        name: r.name,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        createdBy: r.created_by,
      }));
    },

    /**
     * Upsert the whole study under its stable id. created_by and created_at
     * are never sent: the database fills them on insert and a trigger keeps
     * them on update, so saving someone else's study does not take it over.
     */
    async save(id, payload) {
      const org = orgId();
      const { error } = await writeStamped(QRA_STUDY_KIND, {
        id,
        organization_id: org,
        name: (payload?.name || '').trim() || 'Untitled study',
        payload,
        updated_at: new Date().toISOString(),
      }, (row) => supabase.from(QRA_STUDIES_TABLE).upsert(row));
      if (error) throw error;
      return { success: true };
    },

    /** One study's payload, or null when it is not there. */
    async load(id) {
      const { data, error } = await supabase
        .from(QRA_STUDIES_TABLE)
        .select('*')
        .eq('id', id)
        .eq('organization_id', orgId())
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { row } = openState(QRA_STUDY_KIND, data);
      return row?.payload ?? null;
    },

    /**
     * Delete one study. Only its author or an organization owner or admin
     * may (RLS). A refused delete touches no row and returns no error from
     * PostgREST, so the deleted rows are read back and an empty result is
     * reported as the refusal it is.
     */
    async remove(id) {
      const { data, error } = await supabase
        .from(QRA_STUDIES_TABLE)
        .delete()
        .eq('id', id)
        .eq('organization_id', orgId())
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Only the author of a study or an organization owner or admin can delete it.');
      }
      return { success: true };
    },
  };
}
