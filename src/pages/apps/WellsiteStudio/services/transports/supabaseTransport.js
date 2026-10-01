// The real transport: the online-only edges of Wellsite Studio against
// Supabase (registry wells through src/lib/wellsRegistry.js, ws_wells and
// ws_well_members directly since they are this app's own tables). The
// record sync (push, pull) arrives in WS6 on the same object.

import { supabase } from '@/lib/customSupabaseClient';
import { listWells as listRegistry, listTops as listRegistryTops, getWell as getRegistryWell, saveTop as saveRegistryTop, deleteTop as deleteRegistryTop, updateTop as updateRegistryTop, updateWellData as updateRegistryWellData, updateWell as updateRegistryWell } from '@/lib/wellsRegistry';
import { listIntervals as listRegistryIntervals, saveInterval as saveRegistryInterval, deleteInterval as deleteRegistryInterval, listCoreImages, uploadCoreImage } from '@/lib/stratRegistry';
import { writeStamped, registerStateKind } from '@/lib/stateVersion';
import { getGeometry, getDefinitiveTrajectory } from '@/pages/apps/TorqueDragStudio/services/tdApi';

export const WS_WELL_KIND = 'ws-well';
registerStateKind(WS_WELL_KIND, { current: 1, label: 'wellsite well' });

export function makeSupabaseTransport() {
  return {
    kind: 'supabase',
    async currentUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: m } = await supabase.from('organization_members').select('organization_id, role, full_name').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
      return { id: user.id, email: user.email, name: m?.full_name || user.email, organization_id: m?.organization_id || null, org_role: m?.role || null };
    },
    online() { return typeof navigator === 'undefined' ? true : navigator.onLine; },
    async listRegistryWells() { return listRegistry(); },
    async listWsWells() {
      const { data: wells, error } = await supabase.from('ws_wells').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      const ids = (wells || []).map((w) => w.id);
      let members = [];
      if (ids.length) {
        const { data: m, error: me } = await supabase.from('ws_well_members').select('*').in('well_id', ids);
        if (me) throw me;
        members = m || [];
      }
      return (wells || []).map((well) => ({ well, members: members.filter((m) => m.well_id === well.id) }));
    },
    async createWsWell(row) {
      const { data, error } = await writeStamped(WS_WELL_KIND, row, (r) => supabase.from('ws_wells').insert(r).select().single());
      if (error) throw new Error(error.message);
      const { data: members } = await supabase.from('ws_well_members').select('*').eq('well_id', data.id);
      return { well: data, members: members || [] };
    },
    async updateWsWell(id, patch) {
      const { data, error } = await supabase.from('ws_wells').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select();
      if (error) throw new Error(error.message);
      if (!data || !data.length) throw new Error('Only a well administrator can change the well settings.');
      return data[0];
    },
    // ---- membership: ws_well_members insert/update are admin-only under RLS; nothing is ever deleted ----
    async listOrgPeople(organizationId) {
      const { data, error } = await supabase.from('organization_members').select('user_id, full_name, email').eq('organization_id', organizationId).eq('status', 'active');
      if (error) throw new Error(error.message);
      return (data || []).filter((r) => r.user_id).map((r) => ({ user_id: r.user_id, name: r.full_name || r.email || r.user_id, email: r.email || null }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async insertMember(row) {
      const { data, error } = await supabase.from('ws_well_members').insert(row).select();
      if (error) throw new Error(error.code === '42501' ? 'Only a well administrator can add members.' : error.message);
      return data[0];
    },
    async updateMember(id, patch) {
      const { data, error } = await supabase.from('ws_well_members').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select();
      if (error) throw new Error(error.message);
      if (!data || !data.length) throw new Error('Only a well administrator can change members.');
      return data[0];
    },
    /** The registry sources of a prognosis: the well's own tops, offset wells' tops and surveys, Well Design geometry and trajectory. */
    async loadPrognosisSources(geoWellId, { offsetWellIds = [] } = {}) {
      const geoWell = await getRegistryWell(geoWellId);
      const tops = await listRegistryTops(geoWellId);
      const offsetWells = [];
      for (const id of offsetWellIds) {
        const w = await getRegistryWell(id).catch(() => null);
        if (!w) continue;
        offsetWells.push({ id: w.id, name: w.name, kb_m: w.kb_m, deviation: w.deviation, tops: await listRegistryTops(id).catch(() => []) });
      }
      let holeSections = [];
      let plannedTrajectory = null;
      let design = null;
      const { data: wb } = await supabase.from('wp_wellbores').select('id').eq('geo_well_id', geoWellId).limit(1).maybeSingle();
      if (wb) {
        // Resolved through the shared Drilling lookup (tester fix 2026-09-08):
        // the saved spine row, else the Casing & Tubing programme.
        // WS-U1-018: the shared resolver (definitive, actual surveys, latest draft, registry), as every
        // Drilling studio reads it since #433; a design never set definitive left the prognosis without one
        const traj = await getDefinitiveTrajectory(wb.id).catch(() => null);
        const geom = await getGeometry(wb.id, { trajectory: traj }).catch(() => null);
        holeSections = (geom && geom.hole_sections) || [];
        if (traj && Array.isArray(traj.stations) && traj.stations.length >= 2) {
          design = { id: traj.design ? traj.design.id : null, revision: traj.design ? traj.design.revision : null, source: traj.source, label: traj.label };
          plannedTrajectory = traj.stations;
        }
      }
      return { geoWell, tops, offsetWells, holeSections, casingPoints: holeSections.filter((h) => h.cased).map((h) => ({ md_m: h.to_md_m, description: h.description || null })), plannedTrajectory, pressureCurves: null, design, loadedFrom: 'registry' };
    },
    // ---- sync (WS6) ----
    /** Idempotent batch insert: on conflict (id) do nothing (PostgREST resolution=ignore-duplicates). */
    async insertRows(table, rows) {
      const { data, error } = await supabase.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: true }).select('id, server_seq');
      if (error) throw error;
      const serverSeqById = {};
      for (const r of data || []) serverSeqById[r.id] = r.server_seq;
      return { ids: rows.map((r) => r.id), serverSeqById };
    },
    async updateWell(id, patch) { return this.updateWsWell(id, patch); },
    async pullRows(table, wellId, afterSeq, limit = 500) {
      const { data, error } = await supabase.from(table).select('*').eq('well_id', wellId).gt('server_seq', afterSeq).order('server_seq', { ascending: true }).limit(limit);
      if (error) throw error;
      return data || [];
    },
    async pullSignoffs(wellId) {
      const { data, error } = await supabase.from('ws_signoffs').select('*').eq('well_id', wellId);
      if (error) throw error;
      return data || [];
    },
    async uploadBlob(path, blob, contentType) {
      const { error } = await supabase.storage.from('wellsite').upload(path, blob, { upsert: true, contentType });
      if (error) throw error;
      return { path };
    },
    /** The platform countersignature of a sign-off (edge function ws-sign). Never throws for a plain refusal. */
    async countersign(signoffId) {
      const { data, error } = await supabase.functions.invoke('ws-sign', { body: { action: 'countersign', signoff_id: signoffId } });
      if (error) throw error;
      return data;
    },
    async verifyCountersign(signoffId) {
      const { data, error } = await supabase.functions.invoke('ws-sign', { body: { action: 'verify', signoff_id: signoffId } });
      if (error) throw error;
      return data;
    },
    // ---- registry publish (WS9): through the registry services, never direct table calls ----
    async registryState(geoWellId) {
      const { data: { user } } = await supabase.auth.getUser();
      const geo = await getRegistryWell(geoWellId);
      const [tops, intervals, coreImages] = await Promise.all([listRegistryTops(geoWellId), listRegistryIntervals(geoWellId, 'lithology'), listCoreImages(geoWellId).catch(() => [])]);
      return { ownedByMe: !!(geo && user && geo.user_id === user.id), tops, intervals, coreImages };
    },
    // ---- U2-009: the rig survey to the registry, through the existing registry writer (owner only under RLS) ----
    async registryWell(geoWellId) {
      const { data: { user } } = await supabase.auth.getUser();
      const geo = await getRegistryWell(geoWellId);
      return { id: geo.id, name: geo.name, deviation: geo.deviation || [], crs_provenance: geo.crs_provenance || null, ownedByMe: !!(user && geo.user_id === user.id) };
    },
    async writeRegistrySurvey(geoWellId, { stations, provenance }) {
      const before = await getRegistryWell(geoWellId);
      const saved = await updateRegistryWellData(geoWellId, { deviation: stations });
      // where the survey came from rides in the well's provenance object beside the CRS provenance
      let provenanceSaved = true; let provenanceError = null;
      try { await updateRegistryWell(geoWellId, { crs_provenance: { ...(before.crs_provenance || {}), deviation: provenance } }); } catch (e) { provenanceSaved = false; provenanceError = e.message; }
      return { stations: (saved.deviation || []).length, provenanceSaved, provenanceError };
    },
    /** U2-010: the registry port the staged publish runs on, through the registry services (never direct table calls). */
    registryOps(geoWellId) {
      return {
        insertTop: (row) => saveRegistryTop(geoWellId, { name: row.name, mdM: row.md_m, interpreter: row.interpreter, surface_type: row.surface_type, confidence: row.confidence, unit_id: row.unit_id, age_ma: row.age_ma, hiatus_to_ma: row.hiatus_to_ma, notes: row.notes }),
        deleteTop: (row) => deleteRegistryTop(row),
        renameTop: (row, name, notes) => updateRegistryTop(row.id, { name, notes }),
        insertInterval: (row) => saveRegistryInterval(geoWellId, row),
        deleteInterval: (row) => deleteRegistryInterval(row),
        async uploadPhoto({ photo, blob }) {
          const file = new File([blob], `${photo.id}.webp`, { type: 'image/webp' });
          return uploadCoreImage(geoWellId, file, { top_md_m: photo.md_calc_m, base_md_m: photo.md_calc_m, caption: photo.caption || `Wellsite photo ${photo.id}`, width: photo.variants.working.w, height: photo.variants.working.h });
        },
      };
    },
    onAuthEvent(cb) {
      const { data } = supabase.auth.onAuthStateChange((event) => cb(event));
      return () => { try { data.subscription.unsubscribe(); } catch { /* already gone */ } };
    },
    async pullWell(id) {
      const { data: well, error } = await supabase.from('ws_wells').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!well) return null;
      const { data: members } = await supabase.from('ws_well_members').select('*').eq('well_id', id);
      return { well, members: members || [] };
    },
  };
}
