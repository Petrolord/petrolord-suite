// The registry as an import `sink` (Project Portability PP2, PLAN §4.5).
//
// Everything runs under the caller's own session: storage uploads land
// under the caller's uid prefix (the buckets' RLS proves tenancy by the
// first path segment) and rows insert with user_id = caller, so row-level
// security, not this module, decides what the caller may create. The
// pld_import_* tables are best effort: when they are absent the import
// still runs, without resume, and the summary says so.

import { supabase } from '@/lib/customSupabaseClient';
import { getUserOrgRow } from '@/lib/orgContext';

const isMissingRelation = (error) => error && (String(error.code) === '42P01' || /relation .* does not exist|Could not find the table/i.test(String(error.message || '')));

export function makeSupabaseSink() {
  let userCache = null;
  let jobsAvailable = true;
  return {
    async currentUser() {
      if (userCache) return userCache;
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user?.id) throw new Error('Sign in to import a package.');
      const id = data.user.id;
      let organization_id = null;
      try { organization_id = (await getUserOrgRow(id))?.organization_id || null; } catch (e) { /* private account */ }
      userCache = { id, organization_id };
      return userCache;
    },

    /** Own wells for duplicate warnings. */
    /** Every well the importer can see (RLS: own + org-shared), with the
     *  owner id so planImport can word a clash correctly. The name rule
     *  spans all of them; the database index covers the own half. */
    async listMyWells() {
      const { data, error } = await supabase.from('geo_wells').select('id, name, uwi, user_id');
      if (error) return [];
      return data || [];
    },

    async createJob(job) {
      if (!jobsAvailable) return null;
      const { data, error } = await supabase.from('pld_import_jobs').insert(job).select('id').single();
      if (error) {
        if (isMissingRelation(error)) { jobsAvailable = false; return null; }
        throw new Error(`Could not record the import job: ${error.message}`);
      }
      return data.id;
    },
    async updateJob(jobId, patch) {
      if (!jobsAvailable || !jobId) return;
      const { error } = await supabase.from('pld_import_jobs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', jobId);
      if (error && !isMissingRelation(error)) throw new Error(`Could not update the import job: ${error.message}`);
    },
    async listItems(jobId) {
      if (!jobsAvailable || !jobId) return [];
      const { data, error } = await supabase.from('pld_import_items').select('table_name, old_id, new_id').eq('job_id', jobId);
      if (error) { if (isMissingRelation(error)) { jobsAvailable = false; return []; } throw error; }
      return data || [];
    },
    async recordItems(jobId, items) {
      if (!jobsAvailable || !jobId || !items.length) return;
      const { error } = await supabase.from('pld_import_items').upsert(items, { onConflict: 'job_id,table_name,old_id', ignoreDuplicates: true });
      if (error && !isMissingRelation(error)) throw new Error(`Could not record imported ids: ${error.message}`);
    },
    async listJobs() {
      const { data, error } = await supabase.from('pld_import_jobs').select('id, package_name, package_id, status, rows_planned, rows_written, blobs_planned, blobs_written, error, created_at, finished_at').order('created_at', { ascending: false }).limit(50);
      if (error) { if (isMissingRelation(error)) return []; throw error; }
      return data || [];
    },

    /** Merge custom CRS definitions into the caller's geoscience_settings.custom_defs (ids preserved, existing kept). */
    async mergeCustomCrs(defs) {
      const who = await this.currentUser();
      const { data, error } = await supabase.from('geoscience_settings').select('id, custom_defs').eq('user_id', who.id).maybeSingle();
      if (error) throw new Error(`Could not read your coordinate system settings: ${error.message}`);
      const current = (data?.custom_defs && typeof data.custom_defs === 'object' && !Array.isArray(data.custom_defs)) ? data.custom_defs : {};
      const merged = { ...current };
      for (const d of defs) { const { id, ...def } = d; if (!(id in merged)) merged[id] = def; }
      if (data) {
        const { error: e2 } = await supabase.from('geoscience_settings').update({ custom_defs: merged, updated_at: new Date().toISOString() }).eq('id', data.id);
        if (e2) throw new Error(`Could not save the imported coordinate systems: ${e2.message}`);
      } else {
        const { error: e3 } = await supabase.from('geoscience_settings').insert({ user_id: who.id, custom_defs: merged });
        if (e3) throw new Error(`Could not save the imported coordinate systems: ${e3.message}`);
      }
    },

    async uploadBlob(bucket, path, bytes, contentType) {
      const { error } = await supabase.storage.from(bucket).upload(path, new Blob([bytes], { type: contentType }), { contentType, upsert: false });
      if (error) throw new Error(`Could not upload ${path} to ${bucket}: ${error.message}`);
    },
    async removeBlob(bucket, path) {
      await supabase.storage.from(bucket).remove([path]);
    },

    async insertRows(table, rows) {
      const { error } = await supabase.from(table).insert(rows);
      if (error) throw new Error(`Could not write ${table}: ${error.message}`);
    },
  };
}
