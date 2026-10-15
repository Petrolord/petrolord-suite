// Where a volume lives, from the viewer's side (docs/scope/LocalWorkspace-DESIGN.md
// sections 5.4 and 7): the badge on every volumes list, whether the volume
// can open here, and what a colleague can do about one that lives on
// someone else's computer. Pure; the lists pass the row (with its replicas)
// and this computer's registry record.

export const PLACEMENT = Object.freeze({
  CLOUD: 'cloud',          // in the cloud only (every volume before local workspaces)
  HERE: 'here',            // on this computer only
  BOTH: 'both',            // on this computer and in the cloud
  CLOUD_COPY: 'cloud_copy', // local elsewhere, with a cloud copy: opens from the cloud
  ELSEWHERE: 'elsewhere',  // on a colleague's (or my other) computer only
  MISSING: 'missing',      // was on this computer, files are gone (site data cleared)
});

/** "2 hours ago" style, in plain words. */
export function sinceText(iso, now = Date.now()) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 90) return 'just now';
  const m = Math.round(s / 60);
  if (m < 90) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

const ready = (r) => r && r.state === 'ready';

/**
 * @param {Object} row seismic_volumes row (storage_location, user_id, replicas?)
 * @param {Object} [o]
 * @param {?Object} [o.local] this computer's registry record for the volume
 * @param {?string} [o.userId] the viewer
 * @param {Object<string,string>} [o.names] user id -> display name, for "Ayo's PC"
 * @param {number} [o.now]
 * @returns {{kind: string, badge: string, title: string, canOpen: boolean,
 *   canComputeHere: boolean, canRequestCopy: boolean, deviceLabel: ?string, lastSeen: ?string}}
 */
export function placementOf(row, { local = null, userId = null, deviceId = null, now = Date.now() } = {}) {
  const loc = row?.storage_location || 'cloud';
  const replicas = (row?.replicas || row?.seismic_volume_replicas || []).filter((r) => r.state !== 'deleted');
  // a product being written by a job on this computer is here too (routing), not yet openable
  const writing = local && local.state === 'writing';
  const here = local && (local.state === 'ready' || writing);
  const owner = row?.user_id && userId && row.user_id === userId;
  const other = replicas.filter(ready).sort((a, b) => Date.parse(b.last_seen_at || 0) - Date.parse(a.last_seen_at || 0))[0] || null;
  const deviceLabel = other?.device_label || null;
  const lastSeen = other ? sinceText(other.last_seen_at, now) : null;
  const where = deviceLabel ? `${deviceLabel}` : 'another computer';

  if (loc === 'cloud') {
    return { kind: PLACEMENT.CLOUD, badge: 'Cloud', title: 'Stored on Petrolord servers.', canOpen: true, canComputeHere: true, canRequestCopy: false, deviceLabel: null, lastSeen: null };
  }
  // this computer's replica is on record but its files are gone (site data or the folder cleared)
  const mineOnRecord = deviceId && !here && replicas.some((r) => r.device_id === deviceId && r.state === 'ready');
  if ((local && local.state === 'missing') || mineOnRecord) {
    return {
      kind: PLACEMENT.MISSING,
      badge: 'Missing here',
      title: 'The local copy on this computer is gone (the browser storage or the workspace folder was cleared). The record, horizons and previews are safe. Import the SEG-Y again to restore it.',
      canOpen: loc === 'both',
      canComputeHere: loc === 'both',
      canRequestCopy: !owner && loc === 'local',
      deviceLabel,
      lastSeen,
    };
  }
  if (here) {
    return loc === 'both'
      ? { kind: PLACEMENT.BOTH, badge: 'Both', title: 'On this computer and on Petrolord servers.', canOpen: true, canComputeHere: true, canRequestCopy: false, deviceLabel: local.label || null, lastSeen: null }
      : { kind: PLACEMENT.HERE, badge: 'This computer', title: writing ? 'Being written on this computer.' : 'Stored on this computer only. Nothing was uploaded.', canOpen: !writing, canComputeHere: true, canRequestCopy: false, deviceLabel: local.label || null, lastSeen: null };
  }
  if (loc === 'both') {
    return { kind: PLACEMENT.CLOUD_COPY, badge: 'Cloud', title: `Stored on Petrolord servers and on ${where}.`, canOpen: true, canComputeHere: true, canRequestCopy: false, deviceLabel, lastSeen };
  }
  return {
    kind: PLACEMENT.ELSEWHERE,
    badge: deviceLabel || 'Another computer',
    title: `Lives on ${where}${lastSeen ? `, last seen ${lastSeen}` : ''}. Its horizons, faults and preview are here; the seismic itself stays on that computer.${owner ? ' Open the project on that computer to view or process it.' : ' You can ask for a cloud copy.'}`,
    canOpen: false,
    canComputeHere: false,
    canRequestCopy: !owner,
    deviceLabel,
    lastSeen,
  };
}

/** Upload previews of this volume? Decision 4: on by default, off for members-only projects, per-volume override. */
export function previewsAllowed({ volumePreviews = 'auto', projectVisibility = 'organisation', projectPreviews = null } = {}) {
  if (volumePreviews === 'on') return true;
  if (volumePreviews === 'off') return false;
  if (projectPreviews === 'on') return true;
  if (projectPreviews === 'off') return false;
  return projectVisibility !== 'members';
}
