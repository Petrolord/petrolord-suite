// BasinFlow backend pair (BF0, 2026-09-06). Every data touch of the app
// goes through one object: the registry backend wraps bf_wells (owner-
// only RLS), the in-memory backend keeps the same row shape in a list
// seeded with the oracle's reference basin so /dev/basinflow-genesis
// runs the whole app without auth or DB and the e2e can reproduce the
// golden off the screen. Row shape is bf_wells' (snake_case columns);
// the context maps it to app state.

import { supabase } from '@/lib/customSupabaseClient';

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
  };
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
    /** test seam: the stored rows */
    _rows: () => rows,
  };
}
