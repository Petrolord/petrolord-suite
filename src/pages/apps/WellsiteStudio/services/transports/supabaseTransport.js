// The real transport: the online-only edges of Wellsite Studio against
// Supabase (registry wells through src/lib/wellsRegistry.js, ws_wells and
// ws_well_members directly since they are this app's own tables). The
// record sync (push, pull) arrives in WS6 on the same object.

import { supabase } from '@/lib/customSupabaseClient';
import { listWells as listRegistry, listTops as listRegistryTops, getWell as getRegistryWell, saveTop as saveRegistryTop, deleteTop as deleteRegistryTop } from '@/lib/wellsRegistry';
import { listIntervals as listRegistryIntervals, saveInterval as saveRegistryInterval, deleteInterval as deleteRegistryInterval, listCoreImages, uploadCoreImage } from '@/lib/stratRegistry';
import { writeStamped, registerStateKind } from '@/lib/stateVersion';

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
        const { data: geom } = await supabase.from('wp_wellbore_geometry').select('hole_sections').eq('wellbore_id', wb.id).maybeSingle();
        holeSections = (geom && geom.hole_sections) || [];
        const { data: d } = await supabase.from('wp_designs').select('id, stations, revision').eq('wellbore_id', wb.id).eq('status', 'definitive').limit(1).maybeSingle();
        if (d) { design = { id: d.id, revision: d.revision }; plannedTrajectory = d.stations || null; }
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
    async publishToRegistry(geoWellId, { tops, replaceTopIds, intervals, replaceIntervalIds, photos }) {
      const existingTops = await listRegistryTops(geoWellId);
      for (const t of existingTops.filter((x) => replaceTopIds.includes(x.id))) await deleteRegistryTop(t);
      const topIds = [];
      for (const row of tops) { const saved = await saveRegistryTop(geoWellId, { name: row.name, mdM: row.md_m, interpreter: row.interpreter, surface_type: row.surface_type, confidence: row.confidence, unit_id: row.unit_id, notes: row.notes }); topIds.push(saved.id); }
      const existingIntervals = await listRegistryIntervals(geoWellId, 'lithology');
      for (const i of existingIntervals.filter((x) => replaceIntervalIds.includes(x.id))) await deleteRegistryInterval(i);
      const intervalIds = [];
      for (const row of intervals) { const saved = await saveRegistryInterval(geoWellId, row); intervalIds.push(saved.id); }
      const photoIds = [];
      for (const { photo, blob } of photos) {
        const file = new File([blob], `${photo.id}.webp`, { type: 'image/webp' });
        const saved = await uploadCoreImage(geoWellId, file, { top_md_m: photo.md_calc_m, base_md_m: photo.md_calc_m, caption: photo.caption || `Wellsite photo ${photo.id}`, width: photo.variants.working.w, height: photo.variants.working.h });
        photoIds.push(saved.id);
      }
      return { tops: { ids: topIds, replaced: replaceTopIds.length }, intervals: { ids: intervalIds, replaced: replaceIntervalIds.length }, photos: { ids: photoIds } };
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
