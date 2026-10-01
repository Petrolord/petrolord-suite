// Pure helpers for session capture/restore (W1.2b). ViewerPanel owns
// the React state; these keep the storage plumbing and clamping
// testable outside the component.

/** localStorage keys a session snapshot carries (window layout, viewer
 *  prefs, panel sizes, ribbon tab). Raw strings, restored verbatim. */
export const LOCAL_KEYS = [
  'seismolord.windows.v1',
  'seismolord.viewerPrefs.v2',
  'seismolord.workspace.v1',
  'seismolord.ribbon.v1',
  'seismolord.player.v1',        // slice player step size + speed
  'seismolord.cubePrefs.v1',     // 3D window rendering prefs (faces, labels, bg...)
  'seismolord.wellProjection.v1', // well projection distance (m)
];

/** Snapshot the session-relevant localStorage entries (raw strings). */
export function captureLocal(storage) {
  const out = {};
  for (const k of LOCAL_KEYS) {
    try {
      const v = storage.getItem(k);
      if (v != null) out[k] = v;
    } catch { /* private mode */ }
  }
  return out;
}

/** Restore captured entries; unknown keys are ignored (never write
 *  arbitrary keys from a payload into localStorage). */
export function applyLocal(local, storage) {
  if (!local) return;
  for (const k of LOCAL_KEYS) {
    if (typeof local[k] === 'string') {
      try { storage.setItem(k, local[k]); } catch { /* private mode */ }
    }
  }
}

/** Clamp restored slice indices to the (possibly re-ingested) volume's
 *  current geometry; missing entries fall back to the middle. */
export function clampIndices(indices, geometry) {
  const clamp = (v, max) => (Number.isFinite(v)
    ? Math.min(Math.max(Math.round(v), 0), max - 1)
    : Math.floor(max / 2));
  return {
    inline: clamp(indices?.inline, geometry.il.count),
    xline: clamp(indices?.xline, geometry.xl.count),
    time: clamp(indices?.time, geometry.ns),
  };
}

/** Why a saved session or bookmark cannot be restored, or null
 *  (SEIS-U1-015: checked BEFORE anything is applied). */
export function sessionVolumeProblem(payload, volumes) {
  if (!payload?.volume_id) return null;
  if ((volumes || []).some((v) => v.id === payload.volume_id)) return null;
  return 'The volume this session points at no longer exists (deleted, or no longer shared). Nothing was changed.';
}

// ---- U2-017: the co-render overlay in sessions ------------------------------

const BLENDS = ['mix', 'multiply'];

/** The overlay part of a session, or null when co-rendering is off. */
export function captureOverlay({ volumeId, colormap, opacity, blend }) {
  if (!volumeId) return null;
  return {
    volume_id: volumeId,
    colormap: colormap || null,
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 0.5,
    blend: BLENDS.includes(blend) ? blend : 'mix',
  };
}

/**
 * What to do with a saved overlay once the session's volume is open: the
 * overlay volume must still be a same-lattice candidate. Sessions saved
 * before U2-017 carry no overlay and restore with it off.
 * @param {?Object} saved payload.overlay
 * @param {{id: string, name?: string}[]} candidates same-lattice volumes
 * @param {string[]} colormapKeys known colormap keys
 * @returns {null|{select: string, colormap: ?string, opacity: number, blend: string}|{problem: string}}
 */
export function overlayRestorePlan(saved, candidates, colormapKeys = []) {
  if (!saved || typeof saved !== 'object' || !saved.volume_id) return null;
  if (!(candidates || []).some((c) => c.id === saved.volume_id)) {
    return { problem: 'The co-render volume saved with this session is no longer on this survey (deleted, unshared or on another lattice); the session opened without it.' };
  }
  return {
    select: saved.volume_id,
    colormap: colormapKeys.includes(saved.colormap) ? saved.colormap : null,
    opacity: Number.isFinite(saved.opacity) ? Math.min(1, Math.max(0, saved.opacity)) : 0.5,
    blend: BLENDS.includes(saved.blend) ? saved.blend : 'mix',
  };
}
