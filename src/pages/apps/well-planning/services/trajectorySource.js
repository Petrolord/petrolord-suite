// The working trajectory of a wellbore for the Drilling module (tester fix
// 2026-09-07). Every downstream studio (Torque & Drag, Casing & Tubing,
// Cementing, Hydraulics, Well Control, Completion, Geomechanics,
// Perforation, Stimulation, Well Cost & Time, Well Integrity) used to read
// ONLY the definitive design's station cache, so a well whose design was
// saved but never promoted with Set definitive showed its name and nothing
// else. This resolver keeps the definitive design as the plan of record and
// falls back, in order, to what the well actually has, and says which.
//
// Order: definitive design -> actual survey composite (runs flagged
// is_in_definitive) -> the latest saved draft design -> the bridged registry
// well's deviation survey -> nothing. Stations are {md, inc, azi} in metres
// with grid azimuths on every path (design cache, survey computed cache,
// geo_wells deviation are all stored that way). Pure; the API layer fetches.

import { compositeStations } from './surveyUtils';

export const TRAJECTORY_SOURCES = Object.freeze(['definitive', 'actual', 'draft', 'registry', 'none']);

const usable = (stations) => Array.isArray(stations) && stations.length >= 2;
const clean = (stations) => stations.map((s) => ({ md: Number(s.md), inc: Number(s.inc), azi: Number(s.azi) }))
  .filter((s) => Number.isFinite(s.md) && Number.isFinite(s.inc) && Number.isFinite(s.azi));

/** Grid stations of a survey run: the computed cache, else the raw stations. */
export const surveyGridStations = (run) => (usable(run?.computed) ? run.computed : (run?.stations || []));

/** The latest draft design with a station cache: highest revision, then most recently updated. */
export function latestDraftWithStations(designs) {
  return (designs || [])
    .filter((d) => d.status === 'draft' && usable(d.stations))
    .sort((a, b) => (b.revision || 0) - (a.revision || 0) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0] || null;
}

/**
 * Resolve the trajectory a downstream studio should use.
 * @param {Object} p
 * @param {Object} p.wellbore wp_wellbores row
 * @param {Array} [p.designs] wp_designs rows of the wellbore (any status)
 * @param {Array} [p.surveys] wp_surveys rows of the wellbore
 * @param {Object} [p.geoWell] bridged geo_wells row ({deviation}) when linked
 * @returns {{design: Object|null, stations: Array, source: string, label: string, note: string}}
 */
export function resolveTrajectory({ wellbore, designs = [], surveys = [], geoWell = null }) {
  const definitive = (designs || []).find((d) => d.status === 'definitive');
  if (definitive && usable(definitive.stations)) {
    const stations = clean(definitive.stations);
    return {
      design: definitive, stations, source: 'definitive',
      label: `${definitive.name} r${definitive.revision} (definitive), ${stations.length} stations`,
      note: '',
    };
  }
  const composite = compositeStations((surveys || []).filter((s) => s.is_in_definitive).map((s) => ({ stations: surveyGridStations(s) })));
  if (usable(composite)) {
    const stations = clean(composite);
    return {
      design: null, stations, source: 'actual',
      label: `Actual survey composite, ${stations.length} stations`,
      note: definitive
        ? 'The definitive design has no saved stations; the actual survey composite is used.'
        : 'No definitive design; the actual survey composite from Well Design Studio is used.',
    };
  }
  const draft = latestDraftWithStations(designs);
  if (draft) {
    const stations = clean(draft.stations);
    return {
      design: draft, stations, source: 'draft',
      label: `${draft.name} r${draft.revision} (draft, not yet definitive), ${stations.length} stations`,
      note: 'This design has not been set definitive in Well Design Studio. It is used here as the latest saved plan; promote it with Set definitive (design menu in the tree) to make it the plan of record.',
    };
  }
  if (geoWell && usable(geoWell.deviation)) {
    const stations = clean(geoWell.deviation);
    if (usable(stations)) {
      return {
        design: null, stations, source: 'registry',
        label: `Registry survey of ${geoWell.name || 'the linked well'}, ${stations.length} stations`,
        note: 'No design or survey in Well Design Studio; the deviation survey of the linked registry well (Well Data Manager) is used.',
      };
    }
  }
  const hasDesign = (designs || []).length > 0;
  return {
    design: definitive || null, stations: [], source: 'none',
    label: 'No trajectory',
    note: hasDesign
      ? 'The designs on this wellbore have no saved stations. Open the design in Well Design Studio, solve it and click Save design; then Set definitive from the design menu.'
      : 'This wellbore has no design yet. In Well Design Studio add a design from the wellbore menu, solve it, Save design, then Set definitive.',
  };
}

/** Header facts for the details panel, in metres. */
export function trajectorySummary(stations) {
  if (!usable(stations)) return null;
  const last = stations[stations.length - 1];
  let maxInc = 0;
  for (const s of stations) if (s.inc > maxInc) maxInc = s.inc;
  return { stationCount: stations.length, tdMdM: last.md, maxIncDeg: maxInc, firstMdM: stations[0].md };
}
