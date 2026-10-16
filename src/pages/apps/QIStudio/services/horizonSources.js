// Horizons for a QI job on a volume: its own picks, then the user's picks on
// any other volume of the same lattice (QI showcase finding, 2026-10-16).
// The framework is picked on the full stack while the simultaneous inversion
// runs on the angle stacks and the maps on their products, all on one
// lattice; listing only the volume's own horizons left those steps with none.
// The seismic worker accepts the same set (worker/seismic-worker/src/horizonLattice.js).
import { sameLattice } from '../../../../../packages/engines/engines/seismolord/surveyGeometry';

/** Other volumes on the target's lattice (by the registered survey_meta), the target excluded. */
export function latticeSiblings(target, rows) {
  if (!target?.survey_meta?.il) return [];
  const t = { geometry: target.survey_meta };
  return (rows || []).filter((v) => v.id !== target.id && v.survey_meta?.il && sameLattice(t, { geometry: v.survey_meta }));
}

/**
 * The volume's own horizons first, then those picked on a sibling, named with
 * the volume they were picked on so the list says where each comes from.
 */
export function mergeLatticeHorizons(own, fromSiblings, siblings) {
  const nameOf = new Map((siblings || []).map((v) => [v.id, v.name]));
  const seen = new Set((own || []).map((h) => h.id));
  const more = (fromSiblings || []).filter((h) => !seen.has(h.id) && nameOf.has(h.volume_id))
    .map((h) => ({ ...h, picked_on: nameOf.get(h.volume_id), name: `${h.name} (on ${nameOf.get(h.volume_id)})` }));
  return [...(own || []), ...more];
}
