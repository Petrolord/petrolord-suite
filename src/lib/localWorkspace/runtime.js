// Local Workspace in the running Suite: one place the apps ask "is local
// mode on here, which folder, which device, where does this volume live,
// run this job here". Wires the pure modules (workspace, registry, cloud,
// placement, router, jobs) to the page's Supabase client.
//
// Safe before the migration: localSchemaReady() is false until the owner
// applies 20261016100000, and then every helper here answers "cloud" and
// nothing local is offered.

import { useEffect, useState as useStateSafe, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { currentProjectId, currentProjectSettings, getProjectScope } from '@/lib/projects/projectScope';
import { PLATFORM_BUILD } from '@/lib/platformBuild';
import vendor from '../../../packages/engines/VENDOR.json';
import { defaultRegistry } from './registry';
import {
  localWorkspaceSupport, createWorkspace, workspacePermission, requestWorkspacePermission, setWorkspaceDevice,
  checkLocalSpace, removeLocalVolume, openLocalVolume, reportedFreeBytes,
} from './workspace';
import {
  localSchemaReady, registerDevice, touchDevice, volumeLocations, upsertReplica, setVolumeLocation,
} from './cloud';
import { placementOf, PLACEMENT, previewsAllowed } from './placement';
import { chooseExecutor, uuidsIn, EXECUTOR, executorFor } from './router';
import { createBrowserJobRunner } from './jobs/browserJobs';
import { browserEngineCommit } from './identity';
import { buildPreviews, encodePng } from './previews';

export const ENGINE_COMMIT = browserEngineCommit(PLATFORM_BUILD.sha, vendor?.canonical?.commit);
const PREF_KEY = 'petrolord.localWorkspace.runOn';

// ---- state the UI subscribes to -------------------------------------------
let state = { loaded: false, schemaReady: false, support: localWorkspaceSupport(), userId: null, workspace: null, permission: 'none' };
const listeners = new Set();
const set = (patch) => { state = { ...state, ...patch }; for (const l of listeners) l(); };
export const getLocalState = () => state;
export function subscribeLocal(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function useLocalWorkspace() {
  const s = useSyncExternalStore(subscribeLocal, getLocalState, getLocalState);
  useEffect(() => { if (!s.loaded) refreshLocalState().catch(() => {}); }, [s.loaded]);
  return s;
}

async function userId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

/** Re-read the schema probe, the workspace record and its permission. */
export async function refreshLocalState({ force = false } = {}) {
  const uid = await userId();
  const schemaReady = uid ? await localSchemaReady(supabase, { force }) : false;
  const workspace = uid ? await defaultRegistry().getWorkspace(uid).catch(() => null) : null;
  const permission = await workspacePermission(workspace);
  set({ loaded: true, schemaReady, userId: uid, workspace, permission });
  if (schemaReady && workspace && permission === 'granted') {
    ensureDevice().catch(() => {});
    if (!reconciled) { reconciled = true; browserJobs().reconcile().catch(() => {}); markMissing().catch(() => {}); }
  }
  return state;
}
let reconciled = false;

/** Local mode is usable now: schema applied, a browser that can, a workspace, permission granted. */
export const localReady = (s = state) => s.schemaReady && s.support.any && !!s.workspace && s.permission === 'granted';

/** The device row for this workspace (created on first use). */
export async function ensureDevice() {
  const ws = state.workspace;
  if (!ws || !state.schemaReady) return null;
  const id = await registerDevice(supabase, { deviceId: ws.deviceId, label: ws.label, kind: ws.backend === 'opfs' ? 'browser_opfs' : 'browser_folder' });
  if (id !== ws.deviceId) {
    const next = await setWorkspaceDevice(ws.userId, id);
    set({ workspace: next });
  } else {
    touchDevice(supabase, id).catch(() => {});
  }
  return id;
}

/**
 * Set up the workspace. Call from a click: the folder picker needs the gesture.
 * @param {{backend: 'folder'|'opfs', label: string}} p
 */
export async function setUpWorkspace({ backend, label }) {
  const uid = state.userId || await userId();
  if (!uid) throw new Error('Sign in to keep seismic on this computer.');
  let handle = null;
  if (backend === 'folder') {
    handle = await window.showDirectoryPicker({ id: 'petrolord-workspace', mode: 'readwrite', startIn: 'documents' });
  }
  const rec = await createWorkspace({ userId: uid, label, backend, handle });
  set({ workspace: rec, permission: 'granted', userId: uid });
  await ensureDevice().catch(() => {});
  return rec;
}

/** Ask the browser again for the folder (call from a click). */
export async function reconnectWorkspace() {
  const p = await requestWorkspacePermission(state.workspace);
  set({ permission: p });
  if (p === 'granted') await refreshLocalState();
  return p;
}

/** The device this tab runs jobs as. */
async function thisDevice() {
  const ws = state.workspace;
  return { deviceId: ws?.deviceId || null, label: ws?.label || 'This computer', userId: state.userId || await userId(), projectId: currentProjectId(), backend: ws?.backend || null };
}

/** Volumes recorded here whose files are gone (site data cleared, folder emptied): marked missing, honestly. */
async function markMissing() {
  const reg = defaultRegistry();
  const vols = await reg.listVolumes(state.userId);
  for (const v of vols) {
    if (v.state !== 'ready') continue;
    try {
      const s = await openLocalVolume(v.volumeId, { registry: reg });
      if (s.count === 0) throw new Error('empty');
    } catch (e) {
      if (e?.name === 'NeedsPermissionError') return;
      await reg.patchVolume(v.volumeId, { state: 'missing' });
      if (state.workspace?.deviceId) upsertReplica(supabase, { volumeId: v.volumeId, deviceId: state.workspace.deviceId, deviceLabel: state.workspace.label, state: 'missing', bytes: 0 }).catch(() => {});
    }
  }
}

// ---- placement --------------------------------------------------------------

/**
 * Placement of each volume for the lists: Map id -> placement (placement.js).
 * Before the migration every volume is 'cloud'.
 */
export async function placementsFor(rows) {
  const out = new Map();
  const ids = (rows || []).map((r) => r.id);
  if (!state.loaded) await refreshLocalState().catch(() => {});
  const locs = state.schemaReady ? await volumeLocations(supabase, ids).catch(() => new Map()) : new Map();
  const reg = defaultRegistry();
  for (const r of rows || []) {
    const loc = locs.get(r.id) || r;
    // eslint-disable-next-line no-await-in-loop
    const local = state.schemaReady ? await reg.getVolume(r.id).catch(() => null) : null;
    out.set(r.id, placementOf({ ...r, ...loc }, { local: local ? { ...local, label: state.workspace?.label } : null, userId: state.userId, deviceId: state.workspace?.deviceId || null }));
  }
  return out;
}

// ---- derived volumes and jobs ---------------------------------------------

/** Where a new derived volume on `parent` goes: 'local' when the parent is on this computer. */
export async function derivedTarget(parentId) {
  if (!state.loaded) await refreshLocalState().catch(() => {});
  if (!state.schemaReady) return { location: 'cloud' };
  const rec = await defaultRegistry().getVolume(parentId).catch(() => null);
  if (rec && rec.state === 'ready') return { location: 'local', parent: rec };
  return { location: runOnPreference() === 'browser' && localReady() ? 'local' : 'cloud' };
}

/**
 * Register a derived row as local: the location columns on the row, the
 * registry record (writing) the job's writer looks for, and a disk check.
 * @param {Object} row the inserted seismic_volumes row
 * @param {number} needBytes
 */
export async function markDerivedLocal(row, needBytes) {
  const ws = state.workspace;
  const space = await checkLocalSpace(needBytes, ws);
  if (!space.ok) throw new Error(space.message);
  await setVolumeLocation(supabase, row.id, { storageLocation: 'local', deviceId: ws?.deviceId || null });
  await defaultRegistry().putVolume({
    volumeId: row.id, userId: row.user_id, projectId: row.suite_project_id || currentProjectId(), backend: ws?.backend || 'folder', state: 'writing', bytes: 0, name: row.name, createdAt: Date.now(),
  });
  if (ws?.deviceId) await upsertReplica(supabase, { volumeId: row.id, deviceId: ws.deviceId, deviceLabel: ws.label, state: 'writing', bytes: 0 }).catch(() => {});
  return space;
}

/** Undo markDerivedLocal (the job could not start). */
export async function forgetLocal(volumeId) { await removeLocalVolume(volumeId).catch(() => {}); }

/** "auto" (by where the inputs are) or "browser" (this computer, also for cloud inputs). */
export function runOnPreference() {
  try { return window.localStorage.getItem(PREF_KEY) === 'browser' ? 'browser' : 'auto'; } catch { return 'auto'; }
}
export function setRunOnPreference(v) {
  try { window.localStorage.setItem(PREF_KEY, v === 'browser' ? 'browser' : 'auto'); } catch { /* per-viewer convenience only */ }
  set({});
}

let runner = null;
export function browserJobs() {
  if (!runner) {
    runner = createBrowserJobRunner({
      supabase,
      device: thisDevice,
      engineCommit: ENGINE_COMMIT,
      afterSeal: (volumeId) => uploadPreviewsFor(volumeId),
      onBeforeUnload: (isPending) => {
        const h = (e) => { if (!isPending()) return undefined; e.preventDefault(); e.returnValue = ''; return ''; };
        window.addEventListener('beforeunload', h);
        return () => window.removeEventListener('beforeunload', h);
      },
      wakeLock: typeof navigator !== 'undefined' && navigator.wakeLock ? { request: () => navigator.wakeLock.request('screen') } : null,
    });
  }
  return runner;
}
export function useBrowserJobs() {
  const r = browserJobs();
  return useSyncExternalStore(r.subscribe, r.getSnapshot, r.getSnapshot);
}

/**
 * Route a worker job (QI Studio and Seismolord call this through
 * qiService.enqueueJob). Returns {executor, jobId} or throws with the reason.
 * `serverEnqueue` is the existing RPC path.
 */
export async function routeJob(kind, params, inputRefs, organizationId, serverEnqueue) {
  if (!state.loaded) await refreshLocalState().catch(() => {});
  if (!state.schemaReady) return { executor: EXECUTOR.SERVER, jobId: await serverEnqueue() };
  const ids = [...uuidsIn(params)];
  const { data: rows } = ids.length
    ? await supabase.from('seismic_volumes').select('id, name, user_id, storage_location').in('id', ids)
    : { data: [] };
  const placements = await placementsFor(rows || []);
  const inputs = (rows || []).map((r) => ({ id: r.id, name: r.name, placement: placements.get(r.id) }));
  const decision = chooseExecutor({ kind, inputs, preference: runOnPreference(), helperPaired: Boolean(executorFor(EXECUTOR.LOCAL)) });
  if (decision.error) throw new Error(decision.error);
  if (decision.executor === EXECUTOR.SERVER) return { executor: EXECUTOR.SERVER, jobId: await serverEnqueue() };
  if (decision.executor === EXECUTOR.LOCAL) {
    const helper = executorFor(EXECUTOR.LOCAL);
    return { executor: EXECUTOR.LOCAL, jobId: await helper.run({ kind, params, inputRefs, organizationId }) };
  }
  if (!localReady()) {
    throw new Error(state.workspace && state.permission !== 'granted'
      ? 'Reconnect your local workspace folder to run this job on this computer (Seismolord, Local workspace).'
      : 'This job needs the local workspace on this computer. Set it up in Seismolord, Local workspace.');
  }
  const contentOf = new Map();
  for (const r of rows || []) {
    // eslint-disable-next-line no-await-in-loop
    const rec = await defaultRegistry().getVolume(r.id).catch(() => null);
    if (rec?.contentId) contentOf.set(r.id, rec.contentId);
  }
  const parentContent = contentOf.get(String(params?.parent_volume_id || params?.volume_id || '').toLowerCase()) || null;
  const { id } = await browserJobs().start({ kind, params, inputRefs, organizationId, contentOf, parentContent });
  return { executor: EXECUTOR.BROWSER, jobId: id, reason: decision.reason };
}

// ---- previews (owner decision 4) -------------------------------------------

/** Should previews of this volume go to the cloud? */
export async function previewsOn(volumeRow) {
  const scope = getProjectScope();
  let visibility = 'organisation';
  if (scope.enabled && scope.projectId) {
    const { data } = await supabase.from('suite_projects').select('visibility').eq('id', volumeRow?.suite_project_id || scope.projectId).maybeSingle();
    visibility = data?.visibility || 'organisation';
  }
  const projectPreviews = currentProjectSettings()?.seismic?.previews || null;
  return previewsAllowed({ volumePreviews: volumeRow?.previews || 'auto', projectVisibility: visibility, projectPreviews });
}

async function defaultPreviewMaker(row) {
  const store = await openLocalVolume(row.id);
  const manifest = await store.getJson('manifest');
  if (!manifest) return null;
  const images = await buildPreviews({ manifest, read: (k) => store.get(k) });
  const done = [];
  for (const img of images) {
    // eslint-disable-next-line no-await-in-loop
    const png = await encodePng(img);
    // eslint-disable-next-line no-await-in-loop
    const { error } = await supabase.storage.from('seismic').upload(`${row.storage_path}/previews/${img.name}.png`, new Blob([png], { type: 'image/png' }), { contentType: 'image/png', upsert: true });
    if (error) throw new Error(`Could not upload the preview: ${error.message}`);
    done.push(img.name);
  }
  return done;
}
let previewMaker = defaultPreviewMaker;
/** Seismolord installs the preview renderer (it owns the slice engine). */
export function setPreviewMaker(fn) { previewMaker = fn; }
export async function uploadPreviewsFor(volumeId) {
  if (!previewMaker) return null;
  const { data: row } = await supabase.from('seismic_volumes').select('id, user_id, storage_path, previews, suite_project_id').eq('id', volumeId).maybeSingle();
  if (!row || !(await previewsOn(row))) return null;
  return previewMaker(row);
}

export { PLACEMENT };

/** React: the placement of one volume (null while unknown). */
export function useVolumePlacement(volume) {
  const [p, setP] = useStateSafe(null);
  const id = volume?.id || null;
  const loc = volume?.storage_location || null;
  useEffect(() => {
    let live = true;
    if (!id) { setP(null); return undefined; }
    placementsFor([volume]).then((m) => { if (live) setP(m.get(id) || null); }).catch(() => { if (live) setP(null); });
    return () => { live = false; };
  }, [id, loc]); // eslint-disable-line react-hooks/exhaustive-deps
  return p;
}

/** Bytes and count of this user's volumes on this computer, and what the browser reports free. */
export async function localUsage() {
  if (!state.loaded) await refreshLocalState().catch(() => {});
  if (!state.workspace) return null;
  const vols = await defaultRegistry().listVolumes(state.userId).catch(() => []);
  const ready = vols.filter((v) => v.state === 'ready');
  return {
    bytes: ready.reduce((a, v) => a + (Number(v.bytes) || 0), 0),
    count: ready.length,
    missing: vols.filter((v) => v.state === 'missing').length,
    free: await reportedFreeBytes(),
    backend: state.workspace.backend,
    label: state.workspace.label,
  };
}

/** React: placements of a list of volumes (Map id -> placement; empty until known). */
export function useVolumePlacements(volumes) {
  const [m, setM] = useStateSafe(() => new Map());
  const key = (volumes || []).map((v) => `${v.id}:${v.status}:${v.storage_location || ''}`).join(',');
  const s = useSyncExternalStore(subscribeLocal, getLocalState, getLocalState);
  useEffect(() => {
    let live = true;
    if (!volumes?.length) { setM(new Map()); return undefined; }
    placementsFor(volumes).then((x) => { if (live) setM(x); }).catch(() => {});
    return () => { live = false; };
  }, [key, s.schemaReady, s.workspace, s.permission]); // eslint-disable-line react-hooks/exhaustive-deps
  return m;
}
