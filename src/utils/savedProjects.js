// Shared saved-projects persistence factory (Studio shell kit, W1 of the
// Waterflood Design Studio program — docs/scope/WaterfloodDesignStudio-STATUS.md).
//
// Every Studio-shell app persists whole-project payloads to its own
// `saved_<app>_projects` table (owner-scoped RLS): the full input state is
// stored as `inputs_data`; results are a pure function of inputs and are
// recomputed on load, never duplicated server-side. This module is the single
// implementation of that convention — extracted verbatim from the DCA
// persistence (`saved_dca_projects`, R1), which now delegates here.
import { supabase } from '@/lib/customSupabaseClient';

export function createSavedProjectsService(tableName, { signInMessage = 'Sign in to save projects.' } = {}) {
  const currentUserId = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user?.id) throw new Error(signInMessage);
    return data.user.id;
  };

  return {
    /** List the caller's projects, most recently touched first. */
    async list() {
      const { data, error } = await supabase
        .from(tableName)
        .select('id, project_name, created_at, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        name: r.project_name,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    },

    /** Upsert the full project payload under its stable project id. */
    async save(projectId, projectData) {
      const userId = await currentUserId();
      const { error } = await supabase.from(tableName).upsert({
        id: projectId,
        user_id: userId,
        project_name: projectData?.name || 'Untitled project',
        inputs_data: projectData,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return { success: true };
    },

    /** Load one project's payload (null when it does not exist). */
    async load(projectId) {
      const { data, error } = await supabase
        .from(tableName)
        .select('inputs_data')
        .eq('id', projectId)
        .maybeSingle();
      if (error) throw error;
      return data?.inputs_data ?? null;
    },

    /** Delete one project. */
    async remove(projectId) {
      const { error } = await supabase.from(tableName).delete().eq('id', projectId);
      if (error) throw error;
      return { success: true };
    },
  };
}

export const exportProjectAsJSON = (projectData) => {
  try {
    const json = JSON.stringify(projectData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectData.name || 'project'}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

export const importProjectFromJSON = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.id || !data.name) throw new Error('Invalid project structure');
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
};
