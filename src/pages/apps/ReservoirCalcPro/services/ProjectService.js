import { saveAs } from 'file-saver';
import { supabase } from '@/lib/customSupabaseClient';

// ReservoirCalc Pro project persistence.
//
// Projects are stored in the shared `saved_quickvol_projects` table (the legacy
// volumetrics store, already unioned into get_all_my_projects), scoped per user
// by row-level security. To avoid depending on optional columns, the full
// project payload — description, version, inputs, surfaces, unit system — lives
// inside the `inputs_data` JSON blob; only `project_name` and `results_data`
// are first-class columns.
const TABLE = 'saved_quickvol_projects';

// A missing table means the migration hasn't been deployed — surface a clear,
// actionable message instead of a raw Postgres error.
export const friendlyError = (error) => {
    const msg = error?.message || '';
    const missingTable = error?.code === '42P01'
        || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist`, 'i').test(msg);
    if (missingTable) {
        return "Saving isn't set up yet — run the create_saved_quickvol_projects migration.";
    }
    return msg || 'Unexpected error.';
};

// Map a DB row → the project object the UI/context expect.
const fromRow = (row) => {
    const blob = row.inputs_data || {};
    return {
        id: row.id,
        name: row.project_name,
        description: blob.description || '',
        version: blob.version || 1,
        inputs: blob.inputs || { deterministic: {}, surfaces: [], polygons: [] },
        unitSystem: blob.unitSystem || 'field',
        calcMethod: blob.calcMethod || 'deterministic',
        inputMethod: blob.inputMethod || 'simple',
        results: row.results_data || null,
        created_at: row.created_at,
        updated_at: blob.updated_at || row.created_at,
    };
};

// Build the `inputs_data` blob from a project object.
const toBlob = (project, version) => ({
    description: project.description || '',
    version,
    inputs: project.inputs || { deterministic: {}, surfaces: [], polygons: [] },
    unitSystem: project.unitSystem || 'field',
    calcMethod: project.calcMethod || 'deterministic',
    inputMethod: project.inputMethod || 'simple',
    updated_at: new Date().toISOString(),
});

export const ProjectService = {
    /** Fetch the signed-in user's projects (RLS scopes to auth.uid()). */
    async getProjects() {
        const { data, error } = await supabase
            .from(TABLE)
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw new Error(friendlyError(error));
        return (data || []).map(fromRow);
    },

    /** Create (isNew or no id) or update a project. Returns the saved object. */
    async saveProject(projectData, isNew = false) {
        if (!projectData.user_id) throw new Error('Sign in to save projects.');

        if (isNew || !projectData.id) {
            const { data, error } = await supabase
                .from(TABLE)
                .insert([{
                    user_id: projectData.user_id,
                    project_name: projectData.name || 'Untitled Project',
                    inputs_data: toBlob(projectData, 1),
                    results_data: projectData.results || null,
                }])
                .select()
                .single();
            if (error) throw new Error(friendlyError(error));
            return fromRow(data);
        }

        const nextVersion = (projectData.version || 1) + 1;
        const { data, error } = await supabase
            .from(TABLE)
            .update({
                project_name: projectData.name || 'Untitled Project',
                inputs_data: toBlob(projectData, nextVersion),
                results_data: projectData.results || null,
            })
            .eq('id', projectData.id)
            .select()
            .single();
        if (error) throw new Error(friendlyError(error));
        return fromRow(data);
    },

    /** Delete a project by id. */
    async deleteProject(projectId) {
        const { error } = await supabase.from(TABLE).delete().eq('id', projectId);
        if (error) throw new Error(friendlyError(error));
        return true;
    },

    /** Export a project to a downloadable JSON file (client-side). */
    exportToJSON(project) {
        try {
            const exportData = {
                meta: { app: 'ReservoirCalc Pro', version: '1.0', exportDate: new Date().toISOString() },
                project,
            };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            saveAs(blob, `${(project.name || 'project').replace(/\s+/g, '_')}_v${project.version || 1}.json`);
            return true;
        } catch {
            return false;
        }
    },

    /** Import a project from a JSON file, saving it as a new project. */
    async importFromJSON(file, userId) {
        const text = await file.text();
        const json = JSON.parse(text);
        if (!json.project) throw new Error('Invalid project file format.');
        const { id, created_at, updated_at, ...projectData } = json.project;
        return this.saveProject({
            ...projectData,
            user_id: userId,
            name: `${projectData.name || 'Project'} (Imported)`,
            version: 1,
        }, true);
    },
};
