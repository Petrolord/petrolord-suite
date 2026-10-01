// BasinFlow backend pair (BF0, 2026-09-06). Every data touch of the app
// goes through one object: the registry backend wraps bf_wells (owner-
// only RLS), the in-memory backend keeps the same row shape in a list
// seeded with the oracle's reference basin so /dev/basinflow-genesis
// runs the whole app without auth or DB and the e2e can reproduce the
// golden off the screen. Row shape is bf_wells' (snake_case columns);
// the context maps it to app state.

import { supabase } from '@/lib/customSupabaseClient';
import { listWellsWithTops, listLogs, downloadCurve } from '@/lib/wellsRegistry';
import { getDepthUnit } from '@/lib/crs/settingsService';
import { listIntervals } from '@/lib/stratRegistry';

const nowIso = () => new Date().toISOString();

// ---- registry (bf_wells) -----------------------------------------------------
export function makeRegistryBackend() {
  return {
    async currentUserId() {
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id || null;
    },
    async listWells() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase.from('bf_wells').select('*')
        .eq('user_id', user.id).order('updated_at', { ascending: false });
      if (error) throw new Error(`Could not load wells: ${error.message}`);
      return data || [];
    },
    async insertWell(row) {
      const { error } = await supabase.from('bf_wells').insert([row]);
      if (error) throw new Error(`Could not create the well: ${error.message}`);
      return row;
    },
    async updateWell(id, patch) {
      const { error } = await supabase.from('bf_wells').update(patch).eq('id', id);
      if (error) throw new Error(`Could not save the well: ${error.message}`);
    },
    async deleteWell(id) {
      const { error } = await supabase.from('bf_wells').delete().eq('id', id);
      if (error) throw new Error(`Could not delete the well: ${error.message}`);
    },
    // BF2: the shared registry's wells with their tops (the stratigraphy door);
    // BF-U1-009: the dated tops (age_ma, hiatus_to_ma) and the lithology log
    // build the layers exactly as Stratigraphy Studio's Send to Basin does
    listRegistryWells: listWellsWithTops,
    listRegistryIntervals: (wellId) => listIntervals(wellId, 'lithology'),
    // BF-U2-007: the tied well's curves (Petrophysics porosity, TOC)
    listRegistryLogs: listLogs,
    downloadRegistryCurve: downloadCurve,
    // BF3: the account's Geoscience depth unit (the Mapping setting)
    getDepthUnit,
  };
}

/** One registry well with tops for the harness (BF2). */
export const REGISTRY_WELLS_DEV = [{
  id: 'reg-well-1', name: 'KETA-1', td_md_m: 4700, user_id: 'user-dev', organization_id: null, is_own: true,
  tops: [
    { id: 't1', name: 'Top Upper Shale', md_m: 0 },
    { id: 't2', name: 'Top Mid Sand', md_m: 1600 },
    { id: 't3', name: 'Top Source Shale', md_m: 2800 },
    { id: 't4', name: 'Top Base Sand', md_m: 3200 },
  ],
}];

/** BF-U1-009: a dated, deviated harness well with a lithology log (KETA-2), the
 *  Send to Basin case: the registry door builds TVD layers with their ages. */
REGISTRY_WELLS_DEV.push({
  id: 'reg-well-2', name: 'KETA-2', td_md_m: 3000, kb_m: 30, user_id: 'user-dev', organization_id: null, is_own: true,
  deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 1000, inc: 0, azi: 0 }, { md: 3000, inc: 40, azi: 90 }],
  tops: [
    { id: 'k2-t1', name: 'Top Miocene', md_m: 0, age_ma: 0, surface_type: 'sequence_boundary' },
    { id: 'k2-t2', name: 'Top Oligocene Shale', md_m: 800, age_ma: 23.03, surface_type: 'unconformity', hiatus_to_ma: 28.1 },
    { id: 'k2-t3', name: 'Top Eocene Sand', md_m: 1600, age_ma: 33.9, surface_type: 'sequence_boundary' },
    { id: 'k2-t4', name: 'Top Paleocene Source', md_m: 2400, age_ma: 56.0, surface_type: 'maximum_flooding_surface' },
    { id: 'k2-t5', name: 'Top Cretaceous', md_m: 2800, age_ma: 66.0, surface_type: 'sequence_boundary' },
  ],
});
export const REGISTRY_INTERVALS_DEV = {
  'reg-well-2': [
    { kind: 'lithology', code: 'shale', top_md_m: 800, base_md_m: 1600 },
    { kind: 'lithology', code: 'sandstone', top_md_m: 1600, base_md_m: 2400 },
    { kind: 'lithology', code: 'shale', top_md_m: 2400, base_md_m: 2800 },
  ],
};

/** BF-U2-007: KETA-2's published porosity (PHIT, v/v) and a TOC log (wt %, with
 *  the vendor null outside the source interval) for the harness. The porosity
 *  follows 0.50 exp(-0.45/km x TVD) with a small ripple: tighter at depth
 *  than the library shale, so the fit has something to say. */
const KETA2_TVD = (md) => (md <= 1000 ? md : 1000 + (md - 1000) * 0.94);
export const REGISTRY_LOGS_DEV = {
  'reg-well-2': [
    { id: 'k2-phit', well_id: 'reg-well-2', mnemonic: 'PHIT', unit: 'V/V', start_md_m: 100, step_m: 10, n_samples: 286, provenance: { computed: true, engine: 'petrophysics-studio' } },
    { id: 'k2-toc', well_id: 'reg-well-2', mnemonic: 'TOC', unit: '%', start_md_m: 100, step_m: 10, n_samples: 286, provenance: {} },
  ],
};
export function registryCurveDev(log) {
  const out = new Float32Array(log.n_samples);
  for (let i = 0; i < log.n_samples; i++) {
    const md = log.start_md_m + i * log.step_m;
    if (log.mnemonic === 'PHIT') out[i] = 0.5 * Math.exp(-0.00045 * KETA2_TVD(md)) + 0.01 * Math.sin(i / 3);
    else out[i] = md >= 2400 && md < 2800 ? 5 + 0.5 * Math.sin(i / 2) : -999.25;
  }
  return out;
}

// ---- in-memory (harness, jest) -------------------------------------------------
/** The oracle's reference basin (test-data/basinflow/goldens.json
 *  reference_basin.project) as a saved bf_wells row: four layers, a
 *  Type II source, a variable heat-flow history, one erosion event
 *  and a 15 C surface. Present-day Ro of the Source Shale is the
 *  golden's last maturity sample. */
export const REFERENCE_BASIN_WELL_NAME = 'Reference Basin (oracle)';

const KEROGEN_REF = {
  aFactor: 1e13,
  potentials: [0, 0, 0, 0, 0, 0, 0.01, 0.05, 0.11, 0.17, 0.22, 0.19, 0.13, 0.07, 0.03, 0.02, 0, 0, 0, 0],
};

export function referenceBasinRow(userId = 'user-dev') {
  const t = nowIso();
  return {
    id: 'bf-well-ref',
    user_id: userId,
    name: REFERENCE_BASIN_WELL_NAME,
    status: 'in-progress',
    location_coords: null,
    surface_elevation: null,
    water_depth: null,
    stratigraphy: [
      { id: 'upper_shale', name: 'Upper Shale', ageStart: 80, ageEnd: 20, thickness: 1600, lithology: 'shale', color: '#264653', sourceRock: { isSource: false, toc: 0, hi: 0, kerogen: 'type2' } },
      { id: 'mid_sand', name: 'Mid Sand', ageStart: 120, ageEnd: 80, thickness: 1200, lithology: 'sandstone', color: '#f4a261', sourceRock: { isSource: false, toc: 0, hi: 0, kerogen: 'type2' } },
      { id: 'source_shale', name: 'Source Shale', ageStart: 140, ageEnd: 120, thickness: 400, lithology: 'shale', color: '#264653', sourceRock: { isSource: true, toc: 4, hi: 500, kerogen: KEROGEN_REF } },
      { id: 'base_sand', name: 'Base Sand', ageStart: 150, ageEnd: 140, thickness: 1500, lithology: 'sandstone', color: '#f4a261', sourceRock: { isSource: false, toc: 0, hi: 0, kerogen: 'type2' } },
    ],
    heat_flow: { type: 'variable', value: 60, history: [{ age: 150, value: 80 }, { age: 100, value: 70 }, { age: 50, value: 65 }, { age: 0, value: 60 }] },
    erosion_events: [{ age: 10, amount: 600 }],
    settings: { surfaceTemp: 15 },
    calibration_data: { ro: [], temp: [] },
    scenarios: [],
    thermal_history: null,
    created_at: t,
    updated_at: t,
  };
}

const STORE_KEY = 'bf.dev.wells.v1';

export function makeInMemoryBackend({ persist = true } = {}) {
  const load = () => {
    if (persist) {
      try {
        const raw = window.sessionStorage.getItem(STORE_KEY);
        if (raw) return JSON.parse(raw);
      } catch { /* jsdom or private mode */ }
    }
    return [referenceBasinRow()];
  };
  let rows = load();
  const save = () => {
    if (!persist) return;
    try { window.sessionStorage.setItem(STORE_KEY, JSON.stringify(rows)); } catch { /* keep in memory */ }
  };
  return {
    async currentUserId() { return 'user-dev'; },
    async listWells() { return rows.map((r) => ({ ...r })).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)); },
    async insertWell(row) { rows = [{ ...row }, ...rows]; save(); return row; },
    async updateWell(id, patch) {
      const at = rows.findIndex((r) => r.id === id);
      if (at < 0) throw new Error('Unknown well.');
      rows[at] = { ...rows[at], ...patch };
      save();
    },
    async deleteWell(id) { rows = rows.filter((r) => r.id !== id); save(); },
    async listRegistryWells() { return REGISTRY_WELLS_DEV.map((w) => ({ ...w, tops: w.tops.map((t) => ({ ...t })) })); },
    async listRegistryIntervals(wellId) { return (REGISTRY_INTERVALS_DEV[wellId] || []).map((r) => ({ ...r })); },
    async listRegistryLogs(wellId) { return (REGISTRY_LOGS_DEV[wellId] || []).map((r) => ({ ...r })); },
    async downloadRegistryCurve(log) { return registryCurveDev(log); },
    // the fixture is SI so the oracle-anchored e2e reads metres by default
    async getDepthUnit() { return 'm'; },
    /** test seam: the stored rows */
    _rows: () => rows,
  };
}
