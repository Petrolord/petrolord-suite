// The registry as a package `source` (Project Portability PP1, PLAN §4.6).
//
// Reads go through the caller's own session, so row-level security decides
// what can be packaged: own rows and rows shared with the caller's
// organization, nothing else. No service role, no edge function. The
// server-side closure engine over the org-export catalog RPCs arrives with
// PP4 (organization backups), where the largest root sets need it.

import { supabase } from '@/lib/customSupabaseClient';
import { getWell, listLogs, listTops, listZones, downloadCurve } from '@/lib/wellsRegistry';
import { downloadSurfaceGrid } from '@/lib/surfacesRegistry';
import { downloadCultureFeatures } from '@/lib/cultureRegistry';
import { getUserOrgRow } from '@/lib/orgContext';
import { WELL_STATE_TABLES } from './geoscienceSpec';

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) throw new Error('Sign in to export a package.');
  return data.user.id;
}

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

    getWell: (id) => getWell(id),
    listLogs: (wellId) => listLogs(wellId),
    listTops: (wellId) => listTops(wellId),
    listZones: (wellId) => listZones(wellId),
    downloadCurve: (log) => downloadCurve(log),

    async getSurface(id) {
      const { data, error } = await supabase.from('geo_surfaces').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
    downloadSurfaceGrid: (surface) => downloadSurfaceGrid(surface),

    async getCulture(id) {
      const { data, error } = await supabase.from('geo_culture').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
    downloadCultureFeatures: (row) => downloadCultureFeatures(row),

    async getStateRow(table, id) {
      if (!WELL_STATE_TABLES.includes(table)) throw new Error(`Not a packaged state table: ${table}`);
      const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },

    /** Own rows of `table` whose well_ids overlap the given wells. */
    async listStateRowsForWells(table, wellIds) {
      if (!WELL_STATE_TABLES.includes(table)) throw new Error(`Not a packaged state table: ${table}`);
      if (!wellIds.length) return [];
      const { data, error } = await supabase.from(table).select('*').overlaps('well_ids', wellIds);
      if (error) throw error;
      return data || [];
    },

    /** A custom CRS definition from the caller's geoscience_settings.custom_defs. */
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
