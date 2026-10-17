// Production wiring of the import with no upload (localImport.js): the row
// through prepareV4Row with the local location, the conversion worker writing
// into this computer's workspace, the source hash in its own worker, the
// cloud manifest, the replica row and the previews. Also the list of local
// imports the status bar shows.

import { useSyncExternalStore } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { defaultRegistry } from '@/lib/localWorkspace/registry';
import { openLocalVolume, removeLocalVolume, checkLocalSpace } from '@/lib/localWorkspace/workspace';
import { upsertReplica } from '@/lib/localWorkspace/cloud';
import { hashFileInWorker } from '@/lib/localWorkspace/hashFile';
import {
  getLocalState, localReady, refreshLocalState, ensureDevice, uploadPreviewsFor,
} from '@/lib/localWorkspace/runtime';
import { currentProjectId } from '@/lib/projects/projectScope';
import { prepareV4Row, convert } from './importJobsRuntime';
import { runLocalImport, localImportBytes } from './localImport';
import { publishConversionProgress, clearConversionProgress } from '../sources/conversionProgress';

const jobs = new Map();
const listeners = new Set();
let snapshot = [];
const emit = () => { snapshot = [...jobs.values()].map((j) => ({ ...j })); for (const l of listeners) l(); };
const setJob = (id, patch) => { jobs.set(id, { ...(jobs.get(id) || {}), ...patch }); emit(); };
export const subscribeLocalImports = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getLocalImports = () => snapshot;
export function useLocalImports() {
  return useSyncExternalStore(subscribeLocalImports, getLocalImports, getLocalImports);
}
export function dismissLocalImport(id) { jobs.delete(id); emit(); }

async function updateRow(volumeId, patch) {
  const { data, error } = await supabase.from('seismic_volumes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', volumeId).select().single();
  if (error) throw new Error(`Could not update the volume: ${error.message}`);
  return data;
}

/** Can a local import start here now? {ok, reason} */
export async function localImportReady(bytes) {
  const s = await refreshLocalState();
  if (!s.schemaReady) return { ok: false, reason: 'Keeping seismic on this computer is not switched on for this server yet.' };
  if (!s.support.any) return { ok: false, reason: s.support.advice };
  if (!s.workspace) return { ok: false, reason: 'Choose a folder for local seismic first (Local workspace).', needsSetup: true };
  if (!localReady(s)) return { ok: false, reason: 'Allow the browser to use your workspace folder again (Local workspace).', needsPermission: true };
  const space = await checkLocalSpace(localImportBytes(bytes), s.workspace);
  if (!space.ok) return { ok: false, reason: space.message };
  return { ok: true, note: space.message };
}

/**
 * Start a local import (the dialog closes at once; the status bar follows it).
 * @returns {Promise<{done: Promise<Object>}>}
 */
export async function startLocalImport({ file, mapping, scan, nativeCrs = null, name = null, crop = null, vertical = null, traceDelay = null, onDone = () => {} }) {
  const cancelToken = { cancelled: false };
  const tmp = `pending-${Date.now()}`;
  setJob(tmp, { id: tmp, name: name || file.name, phase: 'converting', convert: null, hash: null, startedAt: Date.now(), cancel: () => { cancelToken.cancelled = true; } });
  let id = tmp;
  const deps = {
    device: async () => {
      const ws = getLocalState().workspace;
      const deviceId = ws?.deviceId || await ensureDevice().catch(() => null);
      return { deviceId, label: ws?.label || 'This computer', userId: getLocalState().userId, projectId: currentProjectId(), backend: ws?.backend };
    },
    prepare: (p) => prepareV4Row(p),
    convert: (p) => convert({ ...p, local: true }),
    hashFile: (f, o) => hashFileInWorker(f, o),
    openStore: (volumeId, o) => openLocalVolume(volumeId, o),
    registry: defaultRegistry(),
    uploadManifest: async (path, manifest) => {
      const body = new Blob([JSON.stringify(manifest, null, 1)], { type: 'application/json' });
      const { error } = await supabase.storage.from('seismic').upload(path, body, { contentType: 'application/json', upsert: true });
      if (error) throw new Error(`Could not save the volume's manifest: ${error.message}`);
    },
    updateRow,
    recordReplica: (r) => upsertReplica(supabase, r),
    previews: (volumeId) => uploadPreviewsFor(volumeId),
    abandon: async (volumeId) => {
      await removeLocalVolume(volumeId);
      await supabase.from('seismic_volumes').delete().eq('id', volumeId);
      await supabase.storage.from('seismic').remove([`${getLocalState().userId}/${volumeId}/manifest.json`]).catch(() => {});
    },
  };
  const done = runLocalImport(deps, {
    file, mapping, scan, nativeCrs, name, crop, vertical, traceDelay, cancelToken,
    onRegistered: (volumeId) => { const j = jobs.get(tmp); jobs.delete(tmp); id = volumeId; setJob(volumeId, { ...j, id: volumeId }); },
    onProgress: (p) => {
      if (p.stage === 'hash') setJob(id, { hash: { done: p.done, total: p.total } });
      else {
        setJob(id, { convert: p });
        publishConversionProgress({ fileName: file.name, phase: p.phase === 'index' ? 'scan' : 'transcode', done: p.done, total: p.total });
      }
    },
  }).then((r) => {
    setJob(id, { phase: 'done', bytes: r.bytes, previewError: r.previewError });
    onDone(r);
    return r;
  }, (e) => {
    setJob(id, { phase: cancelToken.cancelled ? 'cancelled' : 'failed', error: e.message });
    throw e;
  }).finally(() => clearConversionProgress());
  done.catch(() => {});
  return { done };
}
