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
