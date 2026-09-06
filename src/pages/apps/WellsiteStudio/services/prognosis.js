// The prognosis snapshot (WS5, spec section 9): what the office loaded
// before drilling, versioned so the rig always knows which version and
// date it is looking at. Built online from the registry (the anchored
// well's tops, the offset wells' tops, Well Design's hole sections and
// definitive trajectory, the published pore-pressure curves) or edited
// by hand; each load is a new version, never an overwrite.

import { formationKey, offsetTopsFrom } from './tops';

export function prognosisTopsFrom(registryTops) {
  return (registryTops || []).map((t) => ({
    name: t.name, formation_key: formationKey(t.name), md_m: t.md_m, uncertainty_m: Number.isFinite(t.uncertainty_m) ? t.uncertainty_m : 15,
    unit_id: t.unit_id || null, surface_type: t.surface_type || 'formation_top', source: 'registry', registry_top_id: t.id || null,
  }));
}

/** A prognosis row from loaded sources. */
export function buildPrognosis({ wellId, version, sources, offsetWells = [], notes = null, offsetMin = 0 }) {
  return {
    well_id: wellId,
    version,
    local_offset_min: offsetMin,
    source: {
      geo_well_id: sources.geoWell ? sources.geoWell.id : null,
      offset_well_ids: offsetWells.map((w) => w.id),
      loaded_from: sources.loadedFrom || 'registry',
      design_id: sources.design ? sources.design.id : null,
    },
    tops: prognosisTopsFrom(sources.tops),
    offset_tops: offsetTopsFrom(offsetWells),
    casing_points: sources.casingPoints || [],
    hole_sections: sources.holeSections || [],
    planned_trajectory: sources.plannedTrajectory || null,
    pressure_curves: sources.pressureCurves || null,
    notes,
  };
}

/** Edit the tops of a prognosis by hand (a new version). */
export function editedPrognosis(prev, tops, { notes = null } = {}) {
  return { ...prev, id: undefined, version: (prev.version || 0) + 1, tops: tops.map((t) => ({ ...t, formation_key: t.formation_key || formationKey(t.name), source: t.source || 'manual' })), notes, source: { ...(prev.source || {}), loaded_from: 'edited' } };
}
