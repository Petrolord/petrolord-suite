// The local workspace on this computer (docs/scope/LocalWorkspace-DESIGN.md
// sections 3.3 and 5.3): a folder the user picks (File System Access, Chrome
// and Edge), or the browser's own private storage (OPFS) where folders are
// not available (Firefox, Safari), with a warning. One workspace per signed
// in user per browser profile.
//
//   <workspace>/
//     petrolord-workspace.json            workspace id, device id, label, format
//     projects/<suite_project_id>/volumes/<volume_id>/   one pack store each
//
// Everything here runs in the page and in workers. Picking a folder and
// asking for permission need a click, so only the page calls those.

import { defaultRegistry } from './registry';
import { openPackStore } from './packStore';

export const WORKSPACE_FORMAT = 1;
export const OPFS_ROOT = 'petrolord-workspace';
export const MARKER = 'petrolord-workspace.json';
export const PERSONAL_PROJECT = 'personal';

/** Thrown when the folder is known but the browser needs a click to allow it again. */
export class NeedsPermissionError extends Error {
  constructor(label) {
    super(`Allow Petrolord to use your local workspace folder${label ? ` on ${label}` : ''} again. Choose "Allow on every visit" so the browser stops asking.`);
    this.name = 'NeedsPermissionError';
    this.code = 'needs_permission';
  }
}

/** What this browser can do. */
export function localWorkspaceSupport(g = globalThis) {
  const nav = g.navigator;
  const opfs = Boolean(nav?.storage && typeof nav.storage.getDirectory === 'function');
  const folder = typeof g.showDirectoryPicker === 'function';
  return {
    folder,
    opfs,
    workers: typeof g.Worker !== 'undefined',
    any: folder || opfs,
    // the plain words the import dialog and the help use
    advice: folder ? null
      : opfs ? 'This browser keeps local volumes inside its own storage. Clearing site data deletes them. For large studies use Chrome or Edge, which can keep volumes in a folder you choose.'
        : 'This browser cannot keep seismic on this computer. Use Chrome or Edge.',
  };
}

const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `ws-${Date.now()}-${Math.random().toString(16).slice(2)}`);

async function readMarker(root) {
  try {
    const fh = await root.getFileHandle(MARKER);
    return JSON.parse(await (await fh.getFile()).text());
  } catch { return null; }
}

async function writeMarker(root, rec) {
  const fh = await root.getFileHandle(MARKER, { create: true });
  const w = await fh.createWritable({ keepExistingData: false });
  await w.write(new TextEncoder().encode(JSON.stringify({
    format: WORKSPACE_FORMAT,
    workspace_id: rec.workspaceId,
    device_id: rec.deviceId || null,
    label: rec.label,
    created_at: new Date(rec.createdAt).toISOString(),
    note: 'Petrolord local workspace. Seismic volumes for your Suite projects live in projects/. Back this folder up with your own tools; Petrolord cannot recover it.',
  }, null, 1)));
  await w.close();
}

/** The OPFS directory used as a workspace in browsers without folder access. */
export async function opfsWorkspaceRoot(g = globalThis) {
  const root = await g.navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_ROOT, { create: true });
}

/**
 * Set up a workspace on a folder handle (already picked) or OPFS.
 * @param {Object} p
 * @param {string} p.userId
 * @param {string} p.label the device label colleagues will see ("Ayo's PC")
 * @param {'folder'|'opfs'|'memory'} p.backend
 * @param {Object} [p.handle] the picked folder (folder) or a memoryDirectory (memory)
 * @param {Object} [p.registry]
 */
export async function createWorkspace({ userId, label, backend, handle = null, registry = defaultRegistry(), deviceId = null }) {
  const root = backend === 'opfs' ? await opfsWorkspaceRoot() : handle;
  if (!root) throw new Error('Choose a folder for the local workspace first.');
  const marker = await readMarker(root);
  const rec = {
    userId,
    backend,
    handle: backend === 'opfs' ? null : handle,
    workspaceId: marker?.workspace_id || newId(),
    deviceId: deviceId || null,
    label: String(label || '').trim().slice(0, 80) || 'This computer',
    createdAt: marker?.created_at ? Date.parse(marker.created_at) || Date.now() : Date.now(),
  };
  await writeMarker(root, rec);
  await registry.putWorkspace(rec);
  if (backend === 'opfs' && globalThis.navigator?.storage?.persist) {
    // best effort: without it Firefox and Safari may evict under pressure
    try { rec.persisted = await globalThis.navigator.storage.persist(); } catch { rec.persisted = false; }
    await registry.putWorkspace(rec);
  }
  return rec;
}

/** Record the cloud device id once seismic_devices has a row for this workspace. */
export async function setWorkspaceDevice(userId, deviceId, { registry = defaultRegistry() } = {}) {
  const rec = await registry.getWorkspace(userId);
  if (!rec) return null;
  const next = { ...rec, deviceId };
  await registry.putWorkspace(next);
  try { await writeMarker(await workspaceRoot(next), next); } catch { /* marker is informative only */ }
  return next;
}

/**
 * Permission state of a workspace: 'granted', 'prompt' or 'denied' (OPFS
 * and memory are always granted).
 */
export async function workspacePermission(rec) {
  if (!rec) return 'none';
  if (rec.backend !== 'folder') return 'granted';
  if (!rec.handle || typeof rec.handle.queryPermission !== 'function') return 'granted';
  try { return await rec.handle.queryPermission({ mode: 'readwrite' }); } catch { return 'prompt'; }
}

/** Ask again (needs a click). Resolves the new state. */
export async function requestWorkspacePermission(rec) {
  if (!rec || rec.backend !== 'folder' || typeof rec.handle?.requestPermission !== 'function') return 'granted';
  try { return await rec.handle.requestPermission({ mode: 'readwrite' }); } catch { return 'denied'; }
}

/**
 * The root directory of a workspace record.
 * @throws NeedsPermissionError when the folder needs a click to allow again
 */
export async function workspaceRoot(rec) {
  if (!rec) throw new Error('There is no local workspace on this computer yet.');
  if (rec.backend === 'opfs') return opfsWorkspaceRoot();
  if (!rec.handle) throw new Error('The local workspace folder is not known on this computer. Choose it again.');
  const state = await workspacePermission(rec);
  if (state !== 'granted') throw new NeedsPermissionError(rec.label);
  return rec.handle;
}

const projectDirName = (projectId) => String(projectId || PERSONAL_PROJECT).replace(/[^A-Za-z0-9_-]/g, '_');

/** projects/<project>/volumes/<volume> under a workspace root. */
export async function volumeDirectory(root, projectId, volumeId, { create = false } = {}) {
  const projects = await root.getDirectoryHandle('projects', { create });
  const project = await projects.getDirectoryHandle(projectDirName(projectId), { create });
  const volumes = await project.getDirectoryHandle('volumes', { create });
  const dir = await volumes.getDirectoryHandle(String(volumeId), { create });
  return { dir, parent: volumes, name: String(volumeId) };
}

/**
 * Open a local volume's pack store from the registry record (any context).
 * @param {string} volumeId
 * @param {{write?: boolean, create?: boolean, registry?: Object, userId?: string, projectId?: string}} [o]
 */
export async function openLocalVolume(volumeId, { write = false, create = false, registry = defaultRegistry(), userId = null, projectId = null } = {}) {
  let vol = await registry.getVolume(volumeId);
  if (!vol && !create) throw new Error('This volume is not stored on this computer.');
  const uid = vol?.userId || userId;
  const rec = await registry.getWorkspace(uid);
  if (!rec) throw new Error('There is no local workspace on this computer yet.');
  const root = await workspaceRoot(rec);
  const pid = vol ? vol.projectId : projectId;
  const { dir, parent, name } = await volumeDirectory(root, pid, volumeId, { create: create || write });
  if (!vol && create) {
    vol = {
      volumeId, userId: uid, projectId: pid, backend: rec.backend, state: 'writing', bytes: 0, createdAt: Date.now(),
    };
    await registry.putVolume(vol);
  }
  return openPackStore(dir, { write, home: { parent, name }, label: 'your local workspace' });
}

/** Remove a local volume's files and its record (never the cloud row). */
export async function removeLocalVolume(volumeId, { registry = defaultRegistry() } = {}) {
  const vol = await registry.getVolume(volumeId);
  if (!vol) return false;
  try {
    const rec = await registry.getWorkspace(vol.userId);
    const root = await workspaceRoot(rec);
    const { parent, name } = await volumeDirectory(root, vol.projectId, volumeId, { create: false });
    await parent.removeEntry(name, { recursive: true });
  } catch { /* already gone */ }
  await registry.deleteVolume(volumeId);
  return true;
}

/**
 * Space this browser reports (bytes). For OPFS this is the real limit; for a
 * folder it describes the browser's own disk, which may not be the drive
 * holding the folder, so callers say so.
 */
export async function reportedFreeBytes(g = globalThis) {
  try {
    const { quota, usage } = await g.navigator.storage.estimate();
    if (!Number.isFinite(quota)) return null;
    return Math.max(0, quota - (usage || 0));
  } catch { return null; }
}

/**
 * Check that a local job or import has room. Returns {ok, message, free}.
 * @param {number} needBytes
 * @param {Object} rec workspace record
 */
export async function checkLocalSpace(needBytes, rec, { freeBytes = reportedFreeBytes } = {}) {
  const free = await freeBytes();
  const gb = (v) => `${(v / 1e9).toFixed(1)} GB`;
  if (rec?.backend === 'opfs') {
    if (free != null && free < needBytes) {
      return { ok: false, free, message: `This needs about ${gb(needBytes)} and the browser can store ${gb(free)} more. Free some disk space, delete local volumes you no longer need, or use Chrome or Edge with a workspace folder on a larger drive.` };
    }
    return { ok: true, free, message: null };
  }
  // a folder: the browser cannot see that drive's free space, so ask the user to check
  return { ok: true, free: null, message: `This needs about ${gb(needBytes)} free on the drive that holds your workspace folder.` };
}
