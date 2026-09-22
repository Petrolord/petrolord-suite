// Production dependencies for the v4 background import (importJobs.js):
// Supabase rows and Storage, the OPFS spool and the conversion worker.
// Importing this module installs them; the UI imports it once.

import { supabase } from '@/lib/customSupabaseClient';
import { getProjectCrs, setProjectCrs } from '@/lib/crs/settingsService';
import { crsDisplayName, crsUnit } from '@/lib/crs';
import { UNKNOWN } from '@/lib/crs/tags';
import { volumeDir } from '../engine/manifest';
import { hasNativeDeflateRaw } from '../engine/brickCodecV4';
import { fileFingerprint, ingestRecord } from './ingestResume';
import { planCrs } from './ingestCrs';
import { SEISMIC_BUCKET, assertQuota } from './seismicStorage';
import { supabaseStorageClient } from './seismicStorageClient';
import {
  hasOpfs, opfsSpool, listOpfsSpools, removeOpfsSpool, spoolSpaceAvailable,
} from './brickSpool';
import { conversionBudgetBytes } from './conversionV4';
import { deflatePoolSize } from './deflatePool';
import { newConvertWorker } from './convertWorkerFactory';
import { setImportJobsFactory, V4_STATUS } from './importJobs';

/** The ingest pipeline marker on survey_meta.ingest for v4 rows. */
export const V4_PIPELINE = 'v4';

async function currentUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('You must be signed in to import seismic data.');
  return user.id;
}

/**
 * Can this browser run the v4 import for a file this size? The spool
 * needs about the SEG-Y's size of local disk (float32 copy compressed
 * plus the display copy); without OPFS, deflate-raw or the space, the
 * import uses the v1 path (uploads while converting, no local copy).
 * @param {number} fileSize
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function v4ImportSupport(fileSize) {
  if (typeof Worker === 'undefined') return { ok: false, reason: 'no-worker' };
  if (!hasOpfs()) return { ok: false, reason: 'no-opfs' };
  if (!hasNativeDeflateRaw()) return { ok: false, reason: 'no-deflate' };
  const free = await spoolSpaceAvailable();
  if (free != null && free < fileSize) return { ok: false, reason: 'no-space', free };
  return { ok: true };
}

/** Register the row (status 'converting'), mirroring ingestVolume's
 *  identity and CRS decisions so v4 rows carry the same record. */
async function prepare({ file, mapping, nativeCrs, name }) {
  const userId = await currentUserId();
  const volumeId = crypto.randomUUID();
  const displayName = name || file.name;
  await assertQuota(file.size);
  const fingerprint = await fileFingerprint(file);
  const project = await getProjectCrs();
  const customDefs = project.customDefs;
  const crsPlan = planCrs(nativeCrs, project.tag);
  const ingestRec = ingestRecord(fingerprint, mapping, file, {
    native: crsPlan.nativeTag,
    project: crsPlan.projectTag,
  });
  ingestRec.pipeline = V4_PIPELINE;
  const { error } = await supabase.from('seismic_volumes')
    .insert({
      id: volumeId,
      user_id: userId,
      name: displayName,
      storage_path: volumeDir(userId, volumeId),
      status: V4_STATUS.CONVERTING,
      crs: crsPlan.storeTag,
      survey_meta: { ingest: ingestRec },
    })
    .select().single();
  if (error) throw new Error(`Could not register volume: ${error.message}`);
  if (crsPlan.autoSetProject && crsPlan.projectTag !== UNKNOWN) {
    await setProjectCrs({
      tag: crsPlan.projectTag,
      name: crsDisplayName(crsPlan.projectTag, customDefs),
      xyUnit: crsUnit(crsPlan.projectTag, customDefs),
      allowWithData: true,
    });
  }
  return { volumeId, userId, name: displayName, ingestRec, crsPlan, customDefs };
}

async function updateRow(volumeId, patch) {
  const { data, error } = await supabase.from('seismic_volumes')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', volumeId)
    .select().single();
  if (error) throw new Error(`Could not update the volume: ${error.message}`);
  return data;
}

async function getRow(volumeId) {
  const { data, error } = await supabase.from('seismic_volumes')
    .select('id,status,name').eq('id', volumeId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

let nextId = 1;

/** Run the conversion worker; resolves the conversion record. */
function convert({ file, scan, volumeId, onProgress, cancelToken }) {
  const worker = newConvertWorker();
  const id = nextId++;
  const deviceMemory = typeof navigator !== 'undefined' ? navigator.deviceMemory : null;
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : null;
  return new Promise((resolve, reject) => {
    const poll = setInterval(() => {
      if (cancelToken.cancelled) worker.postMessage({ type: 'cancel', id });
    }, 250);
    const settle = (fn, v) => { clearInterval(poll); worker.terminate(); fn(v); };
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') onProgress(msg);
      else if (msg.type === 'convert:done') settle(resolve, msg.record);
      else if (msg.type === 'error') settle(reject, new Error(msg.message));
    };
    worker.onerror = (e) => settle(reject, new Error(e.message || 'The conversion worker stopped.'));
    worker.postMessage({
      type: 'convert',
      id,
      file,
      scan,
      volumeId,
      memoryBudgetBytes: conversionBudgetBytes(deviceMemory),
      poolSize: deflatePoolSize(cores),
    });
  });
}

function onBeforeUnload(isPending) {
  const handler = (e) => {
    if (!isPending()) return undefined;
    e.preventDefault();
    // Chrome needs returnValue set; the browser shows its own wording
    e.returnValue = '';
    return '';
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}

setImportJobsFactory(() => ({
  prepare,
  updateRow,
  getRow,
  openSpool: opfsSpool,
  listSpools: listOpfsSpools,
  removeSpool: removeOpfsSpool,
  convert,
  storage: supabaseStorageClient(supabase, SEISMIC_BUCKET),
  onBeforeUnload,
}));

export {
  getImportJobs, useImportJobs, JOB_PHASE, V4_STATUS, isOpenableVolume,
} from './importJobs';
