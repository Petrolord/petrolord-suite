// Stratigraphy Studio to Basin & Charge Modeling (ST3, 2026-09-06).
//
// Builds a Basin model row (bf_wells) from a registry well's dated, typed
// tops and its lithology log through the engine (stratigraphy/
// basinLayers.js), in the exact shape Basin's own reference-basin seed
// uses, so the model opens in Basin with its stratigraphy, ages and
// erosion events pre-filled and the registry well remembered as its tie.
// The row is written through Basin's own backend (one door).

import { layersFromDatedTops } from '@/lib/stratigraphy/basinLayers';

/** Basin's layer colours by lithology (its reference seed uses the first two). */
export const BASIN_LAYER_COLOUR = { sandstone: '#f4a261', shale: '#264653', limestone: '#6fa8dc', salt: '#e7d7f1', coal: '#1f1f1f' };

const newId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * @param {Object} p
 * @param {{id, name, td_md_m?, surface_x?, surface_y?, kb_m?}} p.well
 * @param {Array} p.tops the well's tops with surface_type, age_ma, hiatus_to_ma
 * @param {Array} [p.intervals] the well's interval rows (lithology kind is used)
 * @param {string} p.userId
 * @param {string} [p.name] model name, defaults to "<well> stratigraphy"
 * @returns {{ row: Object, problems: string[], layerCount: number, datedCount: number, erosionCount: number }}
 */
export function buildBasinModelRow({ well, tops, intervals = [], userId, name }) {
  const td = Number(well?.td_md_m);
  const { layers, erosionEvents, problems } = layersFromDatedTops(tops || [], {
    baseDepth: Number.isFinite(td) && td > 0 ? td : null, intervals, idFor: (i) => `strat-${well.id}-${i}`,
  });
  const t = new Date().toISOString();
  const row = {
    id: newId(),
    user_id: userId,
    name: name || `${well.name} stratigraphy`,
    status: 'in-progress',
    location_coords: Number.isFinite(well?.surface_x) && Number.isFinite(well?.surface_y) ? { x: well.surface_x, y: well.surface_y } : null,
    surface_elevation: Number.isFinite(well?.kb_m) ? well.kb_m : null,
    water_depth: null,
    stratigraphy: layers.map((l) => ({
      id: l.id, name: l.name, ageStart: l.ageStart, ageEnd: l.ageEnd, thickness: l.thickness, lithology: l.lithology,
      color: BASIN_LAYER_COLOUR[l.lithology] || '#94a3b8', sourceRock: l.sourceRock, agesGuessed: l.agesGuessed,
      provenance: { registry_well_id: well.id, top_md_m: l.top_md_m, base_md_m: l.base_md_m, lithology_guessed: l.lithologyGuessed },
    })),
    heat_flow: { type: 'constant', value: 60, history: [{ age: 0, value: 60 }, { age: Math.max(100, ...layers.map((l) => l.ageStart)), value: 60 }] },
    erosion_events: erosionEvents.map((e) => ({ age: e.age, amount: e.amount, from_ma: e.from_ma, to_ma: e.to_ma, surface: e.surface, amountUnknown: true })),
    settings: { surfaceTemp: 15, registryWellId: well.id, registryWellName: well.name, fromStratigraphyStudio: t },
    calibration_data: { ro: [], temp: [] },
    scenarios: [],
    thermal_history: null,
    created_at: t,
    updated_at: t,
  };
  return { row, problems, layerCount: layers.length, datedCount: layers.filter((l) => !l.agesGuessed).length, erosionCount: erosionEvents.length };
}
