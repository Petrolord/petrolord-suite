// Async loaders for offset wells, shared by the Anti-collision tab, the
// Design tab 3D scene and the Design plots "Offsets" overlay. Nothing
// here throws: failures come back as notes the caller renders inline.
// Cancellation is cooperative: pass isCancelled and the loops stop
// fetching as soon as it returns true.

import { listWells } from '@/lib/wellsRegistry';
import { listDesigns, listAcRuns } from './wpApi';
import { pickOffsetDesign, assembleOffsetCandidates } from './offsetFrame';

/**
 * Picked design (definitive, else latest with stations) for each of
 * the site's other wellbores. Sequential fetch is fine at pad scale.
 * @returns {Promise<{map: Object<string, object|null>, failed: string[], cancelled: boolean}>}
 */
export async function loadSiteOffsetDesigns(wellbores, excludeId, { isCancelled = () => false } = {}) {
  const map = {};
  const failed = [];
  for (const w of (wellbores || []).filter((x) => x.id !== excludeId)) {
    if (isCancelled()) return { map, failed, cancelled: true };
    try {
      map[w.id] = pickOffsetDesign(await listDesigns(w.id));
    } catch (e) {
      map[w.id] = null;
      failed.push(w.name || w.id);
    }
  }
  return { map, failed, cancelled: isCancelled() };
}

/**
 * Everything the plots overlay needs: offset candidates (site wellbores
 * plus same-CRS registry wells), and the offset ids of the design's
 * latest saved anti-collision run (the persisted selection).
 * @returns {Promise<{candidates, savedRunIds, notes: string[], cancelled: boolean}>}
 */
export async function loadOffsetCandidates({
  wellbore, wellbores, siteCrs = null, designId = null, isCancelled = () => false,
}) {
  const notes = [];
  const { map, failed, cancelled } = await loadSiteOffsetDesigns(wellbores, wellbore?.id, { isCancelled });
  if (cancelled) return { candidates: [], savedRunIds: null, notes, cancelled: true };
  if (failed.length) notes.push(`Could not read the designs of ${failed.join(', ')}.`);
  let geoWells = [];
  try {
    geoWells = await listWells();
  } catch (e) {
    notes.push(`Registry wells could not be loaded (${e.message}); only this site's wellbores are shown.`);
  }
  if (isCancelled()) return { candidates: [], savedRunIds: null, notes, cancelled: true };
  let savedRunIds = null;
  if (designId) {
    try {
      const runs = await listAcRuns(designId);
      const latest = Array.isArray(runs) && runs.length ? runs[0] : null;
      if (latest && Array.isArray(latest.offsets)) savedRunIds = latest.offsets.map((o) => o.id);
    } catch (e) { /* no saved runs is a normal state */ }
  }
  const candidates = assembleOffsetCandidates({
    wellbores, designsByWellbore: map, geoWells, wellbore, siteCrs,
  });
  return { candidates, savedRunIds, notes, cancelled: isCancelled() };
}
