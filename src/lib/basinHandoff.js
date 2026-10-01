// Stratigraphy Studio to Basin & Charge Modeling (ST3, 2026-09-06).
//
// Builds a Basin model row (bf_wells) from a registry well's dated, typed
// tops and its lithology log through the engine (stratigraphy/
// basinLayers.js), in the exact shape Basin's own reference-basin seed
// uses, so the model opens in Basin with its stratigraphy, ages and
// erosion events pre-filled and the registry well remembered as its tie.
// The row is written through Basin's own backend (one door).

import { layersFromDatedTops } from '@/lib/stratigraphy/basinLayers';
import { makeDepthFrame } from '@/pages/apps/WellDataManager/engine/checkshots';
import { chartOf } from '@/lib/stratigraphy/ageCharts';
import { TIMESCALE_VERSION } from '@/lib/stratigraphy/timescale';

/**
 * STRAT-U1-008 (2026-09-30): a basin model's layers are vertical
 * thicknesses. Tops and interval logs are stored in MD, so on a deviated
 * well the MD differences overstated every layer below the kick-off (95 m
 * along hole was 88 m vertical on the harness KETA-2). Depths go through the
 * well's survey (makeDepthFrame, minimum curvature) to TVD before the engine
 * builds the layers; a well with no survey is vertical and said to be.
 * @returns {{ tvd: (md: number) => number, basis: 'tvd'|'md', note: string }}
 */
export function verticalDepthOf(well) {
  let frame = null;
  try { frame = makeDepthFrame({ deviation: well?.deviation, kbM: well?.kb_m, tdMdM: well?.td_md_m }); } catch { frame = null; }
  if (!frame || frame.isVertical) return { tvd: (md) => md, basis: 'md', note: `${well?.name || 'The well'} has no survey: drawn vertical, thicknesses are MD differences.` };
  return {
    tvd: (md) => { try { return frame.mdToTvdss(md).tvd; } catch { return md; } },
    basis: 'tvd',
    note: 'Layer thicknesses are vertical (TVD) through the survey; the MD of each top is kept in the layer provenance.',
  };
}

/** Basin's layer colours by lithology (its reference seed uses the first two). */
export const BASIN_LAYER_COLOUR = { sandstone: '#f4a261', shale: '#264653', limestone: '#6fa8dc', salt: '#e7d7f1', coal: '#1f1f1f' };

/** A Postgres point literal "(x,y)" or null. */
export function pointLiteral(x, y) {
  return Number.isFinite(x) && Number.isFinite(y) ? `(${x},${y})` : null;
}

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
export function buildBasinModelRow({ well, tops, intervals = [], userId, name, ageCharts = null }) {
  const td = Number(well?.td_md_m);
  const v = verticalDepthOf(well);
  const mdOf = new Map();
  const vTops = (tops || []).filter((t) => Number.isFinite(t.md_m)).map((t) => { const z = v.tvd(t.md_m); mdOf.set(z, t.md_m); return { ...t, md_m: z }; });
  const vIntervals = (intervals || []).map((r) => ({ ...r, top_md_m: v.tvd(r.top_md_m), base_md_m: v.tvd(r.base_md_m) }));
  const { layers, erosionEvents, problems: engineProblems } = layersFromDatedTops(vTops, {
    baseDepth: Number.isFinite(td) && td > 0 ? v.tvd(td) : null, intervals: vIntervals, idFor: (i) => `strat-${well.id}-${i}`,
  });
  const problems = [...engineProblems, v.note];
  const mdBack = (z) => (mdOf.has(z) ? mdOf.get(z) : null);
  // BF-U1-015: the chart each age was entered under travels with the layer,
  // so Basin can flag an age that a newer chart moved (STRAT-U2-003 stamps;
  // no stamp means entered before stamps, under ICS 2023/09)
  const sortedTops = (tops || []).filter((t) => Number.isFinite(t.md_m)).slice().sort((a, b) => a.md_m - b.md_m);
  const chartsOf = (layerName) => {
    const i = sortedTops.findIndex((t) => t.name === layerName);
    if (i < 0) return null;
    const upper = sortedTops[i]; const lower = sortedTops[i + 1] || null;
    const endField = Number.isFinite(upper.hiatus_to_ma) ? 'hiatus_to_ma' : 'age_ma';
    return {
      ageEnd: { top: upper.name, field: endField, value: upper[endField] ?? null, chart: chartOf(ageCharts, 'tops', upper.id, endField) },
      ageStart: lower ? { top: lower.name, field: 'age_ma', value: lower.age_ma ?? null, chart: chartOf(ageCharts, 'tops', lower.id, 'age_ma') } : null,
    };
  };
  const t = new Date().toISOString();
  const row = {
    id: newId(),
    user_id: userId,
    name: name || `${well.name} stratigraphy`,
    status: 'in-progress',
    // BF-U1-004: bf_wells.location_coords is a Postgres point; an {x, y}
    // object is refused ("invalid input syntax for type point"), so Send to
    // Basin failed for every well with coordinates. Write the point literal.
    location_coords: pointLiteral(well?.surface_x, well?.surface_y),
    // the KB is not the ground or sea-floor elevation Basin means here; it rides in settings
    surface_elevation: null,
    water_depth: null,
    stratigraphy: layers.map((l) => ({
      id: l.id, name: l.name, ageStart: l.ageStart, ageEnd: l.ageEnd, thickness: l.thickness, lithology: l.lithology,
      color: BASIN_LAYER_COLOUR[l.lithology] || '#94a3b8', sourceRock: l.sourceRock, agesGuessed: l.agesGuessed,
      provenance: { age_charts: l.agesGuessed ? null : chartsOf(l.name), registry_well_id: well.id, top_md_m: mdBack(l.top_md_m), base_md_m: mdBack(l.base_md_m) ?? (Number.isFinite(td) && td > 0 ? td : null), top_tvd_m: l.top_md_m, base_tvd_m: l.base_md_m, thickness_basis: v.basis, lithology_guessed: l.lithologyGuessed },
    })),
    heat_flow: { type: 'constant', value: 60, history: [{ age: 0, value: 60 }, { age: Math.max(100, ...layers.map((l) => l.ageStart)), value: 60 }] },
    erosion_events: erosionEvents.map((e) => ({ age: e.age, amount: e.amount, from_ma: e.from_ma, to_ma: e.to_ma, surface: e.surface, amountUnknown: true })),
    settings: { surfaceTemp: 15, timescale: TIMESCALE_VERSION, registryWellId: well.id, registryWellName: well.name, registryKbM: Number.isFinite(well?.kb_m) ? well.kb_m : null, fromStratigraphyStudio: t },
    calibration_data: { ro: [], temp: [] },
    scenarios: [],
    thermal_history: null,
    created_at: t,
    updated_at: t,
  };
  return { row, problems, layerCount: layers.length, datedCount: layers.filter((l) => !l.agesGuessed).length, erosionCount: erosionEvents.length };
}

/**
 * BF-U1-005: what Send to Basin writes over a model it made before. The
 * layers, ages, thicknesses and erosion surfaces come from the well again;
 * what the modeller set in Basin is kept: per layer (matched by name, then
 * by position) the source rock (TOC, HI, kerogen), the thermal and
 * compaction properties and the colour, and per erosion surface a thickness
 * typed in Basin. Before, the update replaced the layers wholesale, so a
 * re-send turned the source rock off and zeroed every typed erosion amount
 * although the status said they were kept.
 * @returns {{ stratigraphy: Array, erosion_events: Array, kept: { sources: number, properties: number, erosion: number } }}
 */
export function mergeBasinUpdate(existing, row) {
  const old = Array.isArray(existing?.stratigraphy) ? existing.stratigraphy : [];
  const byName = new Map(old.map((l) => [l.name, l]));
  const kept = { sources: 0, properties: 0, erosion: 0 };
  const stratigraphy = (row.stratigraphy || []).map((l, i) => {
    const prev = byName.get(l.name) || (old.length === row.stratigraphy.length ? old[i] : null);
    if (!prev) return l;
    const out = { ...l };
    if (prev.sourceRock?.isSource) { out.sourceRock = { ...prev.sourceRock }; kept.sources += 1; }
    if (prev.thermal || prev.compaction) {
      if (prev.lithology === l.lithology) {
        if (prev.thermal) out.thermal = { ...prev.thermal };
        if (prev.compaction) out.compaction = { ...prev.compaction };
        kept.properties += 1;
      }
    }
    if (prev.color) out.color = prev.color;
    return out;
  });
  const oldEvents = Array.isArray(existing?.erosion_events) ? existing.erosion_events : [];
  const erosion_events = (row.erosion_events || []).map((e) => {
    const prev = oldEvents.find((o) => (e.surface && o.surface === e.surface) || (Number(o.age) === Number(e.age) && Number(o.to_ma) === Number(e.to_ma)));
    if (prev && Number(prev.amount) > 0) { kept.erosion += 1; return { ...e, amount: Number(prev.amount), amountUnknown: false }; }
    return e;
  });
  // erosion events the modeller added in Basin by hand (no surface) stay
  for (const o of oldEvents) if (!o.surface && Number(o.amount) > 0 && !erosion_events.some((e) => Number(e.age) === Number(o.age))) { erosion_events.push({ ...o }); kept.erosion += 1; }
  return { stratigraphy, erosion_events, kept };
}
