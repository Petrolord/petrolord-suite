// The registry as a package `source` (Project Portability PP1, generic since
// PP3).
//
// Reads go through the caller's own session, so row-level security decides
// what can be packaged: own rows and rows shared with the caller's
// organization, nothing else. No service role, no edge function. The
// server-side closure engine over the org-export catalog RPCs arrives with
// PP4 (organization backups), where the largest root sets need it.
//
// Generic interface (collect.js): currentUser, getRow, listChildren,
// downloadBlob, listBlobs. Geoscience hook methods: listStateRowsForWells,
// getCustomCrs.

import { supabase } from '@/lib/customSupabaseClient';
import { getUserOrgRow } from '@/lib/orgContext';
import { tableSpec } from './familySpec';
import { WELL_STATE_TABLES } from './geoscienceSpec';

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) throw new Error('Sign in to export a package.');
  return data.user.id;
}

const LIST_PAGE = 1000;

export function makeSupabaseSource() {
  let userCache = null;
  return {
    async currentUser() {
      if (userCache) return userCache;
      const id = await currentUserId();
      let organization_id = null;
      let organization_name = null;
      try {
        const org = await getUserOrgRow(id);
        organization_id = org?.organization_id || null;
        if (organization_id) {
          const { data } = await supabase.from('organizations').select('name').eq('id', organization_id).maybeSingle();
          organization_name = data?.name || null;
        }
      } catch (e) { /* no org: private account */ }
      userCache = { id, organization_id, organization_name };
      return userCache;
    },

    async getRow(table, id) {
      const spec = tableSpec(table);
      if (!spec || spec.synthetic) throw new Error(`Not a packaged table: ${table}`);
      const { data, error } = await supabase.from(table).select('*').eq(spec.pk || 'id', id).maybeSingle();
      if (error) throw error;
      return data;
    },

    async listChildren(table, column, parentId) {
      if (!tableSpec(table)) throw new Error(`Not a packaged table: ${table}`);
      const out = [];
      for (let from = 0; ; from += LIST_PAGE) {
        const { data, error } = await supabase.from(table).select('*').eq(column, parentId).range(from, from + LIST_PAGE - 1);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < LIST_PAGE) break;
      }
      return out;
    },

    async downloadBlob(bucket, path) {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error) throw new Error(`Could not download ${bucket}/${path}: ${error.message}`);
      return new Uint8Array(await data.arrayBuffer());
    },

    /** Every object under a prefix, recursively. */
    async listBlobs(bucket, prefix) {
      const out = [];
      const walk = async (dir) => {
        for (let offset = 0; ; offset += LIST_PAGE) {
          const { data, error } = await supabase.storage.from(bucket).list(dir, { limit: LIST_PAGE, offset });
          if (error) throw new Error(`Could not list ${bucket}/${dir}: ${error.message}`);
          for (const e of data || []) {
            const full = dir ? `${dir}/${e.name}` : e.name;
            if (e.id === null || e.metadata == null) await walk(full); // folder
            else out.push({ path: full, size: e.metadata?.size ?? null });
          }
          if (!data || data.length < LIST_PAGE) break;
        }
      };
      await walk(prefix.replace(/\/$/, ''));
      return out;
    },

    // ---- Geoscience hooks ----
    async listStateRowsForWells(table, wellIds) {
      if (!WELL_STATE_TABLES.includes(table)) throw new Error(`Not a packaged state table: ${table}`);
      if (!wellIds.length) return [];
      const { data, error } = await supabase.from(table).select('*').overlaps('well_ids', wellIds);
      if (error) throw error;
      return data || [];
    },

    async getCustomCrs(id) {
      const { data, error } = await supabase.from('geoscience_settings').select('custom_defs').maybeSingle();
      if (error || !data?.custom_defs) return null;
      const defs = data.custom_defs;
      if (Array.isArray(defs)) return defs.find((d) => String(d?.id).toLowerCase() === id) || null;
      if (defs && typeof defs === 'object') {
        const hit = defs[id] || Object.values(defs).find((d) => String(d?.id).toLowerCase() === id);
        return hit ? { id, ...hit } : null;
      }
      return null;
    },
  };
}
