// Server attribute volumes (QI programme Q0b). The derived row is registered
// exactly as the browser route registers it (registerAttributeVolume), then
// the seismic worker computes it with the same engine code (attribute_volume
// job). The worker runs on the user's own volumes; a colleague's shared
// volume is computed in the browser.
import { enqueueJob } from '@/lib/qiService';
import { registerAttributeVolume } from './attributeJobService';
import { derivedStorageBytes } from './attributeSurveyMeta';
import { deleteVolume } from './volumesService';

const GiB = 1024 ** 3;

/** Derived size from which the dialog chooses the server by default. */
export const SERVER_ATTRIBUTE_SUGGEST_BYTES = 1 * GiB;

/**
 * @param {{parentManifest: Object, isOwnVolume: boolean}} p
 * @returns {{offer: boolean, preferred: boolean}}
 */
export function serverAttributeAdvice({ parentManifest, isOwnVolume }) {
  if (!isOwnVolume || !parentManifest) return { offer: false, preferred: false };
  let bytes = 0;
  try { bytes = derivedStorageBytes(parentManifest); } catch { return { offer: false, preferred: false }; }
  return { offer: true, preferred: bytes >= SERVER_ATTRIBUTE_SUGGEST_BYTES };
}

/**
 * @returns {Promise<{jobId: string, volumeId: string}>}
 */
export async function startServerAttribute({ parent, parentManifest, attribute, name }, deps = {}) {
  const register = deps.register || registerAttributeVolume;
  const enqueue = deps.enqueue || enqueueJob;
  const remove = deps.remove || deleteVolume;
  const { row, volumeId } = await register({ parent, parentManifest, attribute, name });
  try {
    const jobId = await enqueue('attribute_volume', {
      volume_id: volumeId,
      parent_volume_id: parent.id,
      name: row?.name, // display only (the Jobs dock title)
      attribute: { name: attribute.name, params: attribute.params ?? {}, ...(attribute.north ? { north: attribute.north } : {}) },
    });
    return { jobId, volumeId };
  } catch (e) {
    // no job will ever fill the row: take it back out
    try { await remove(row); } catch { /* best effort */ }
    throw e;
  }
}
