// Which horizons may guide a worker job on a volume (QI showcase finding,
// 2026-10-16). An interpreter picks the framework on the full stack and runs
// the simultaneous inversion on the near, mid and far stacks, or maps a
// property volume derived from one of them. Those volumes share the full
// stack's lattice, so its horizons fit them cell for cell; requiring the
// horizon to sit on the job's own volume left the low-frequency model with
// no horizons at all. A horizon is accepted when it is the user's own and was
// picked on the job's volume or on any of the user's volumes on the same
// lattice (the zone_maps rule, now shared).
import { sameLattice } from '../../../packages/engines/engines/seismolord/surveyGeometry.js';

/**
 * @param {{id: string, user_id: string, volume_id: string, name: string}|null} h the horizon row
 * @param {{uid: string, volumeId: string, manifest: Object, rowOf: (id: string) => Promise<Object|null>,
 *   readManifest: (path: string) => Promise<Object>}} ctx
 * @returns {Promise<null | {stage: string, message: string}>} why it cannot be used, or null
 */
export async function horizonLatticeProblem(h, { uid, volumeId, manifest, rowOf, readManifest }) {
  if (!h || h.user_id !== uid) return { stage: 'not_found', message: 'A chosen horizon was not found in your account.' };
  if (h.volume_id === volumeId) return null;
  const hv = await rowOf(h.volume_id);
  if (!hv || hv.user_id !== uid) return { stage: 'not_found', message: `The volume horizon ${h.name} was picked on is not in your account.` };
  if (!sameLattice(await readManifest(`${hv.storage_path}/manifest.json`), manifest)) {
    return { stage: 'validate_failed', message: `Horizon ${h.name} was picked on a volume with another lattice.` };
  }
  return null;
}
