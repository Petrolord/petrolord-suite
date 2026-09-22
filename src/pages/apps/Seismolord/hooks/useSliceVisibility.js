// Slice-plane visibility, ONE state for every window (tester feedback
// 2026-09-22: "once a slice is shown it can't be hidden"). Before this,
// the explorer eyes drove only the Map window while the 3D window kept
// its own plane toggles in a separate localStorage key, so hiding a
// plane in the explorer left it on screen in 3D. Now the explorer eyes,
// the 3D Planes menu, the Section window's intersection lines and the
// Map all read and write this one {inline, xline, time} state.
//
// Persistence, most specific first:
//  1. a named session restore (restore())
//  2. the volume's saved display state (volumeDisplayState, loaded on
//     volume open; a user toggle made before it arrives wins)
//  3. this browser's last choice (localStorage VIS_KEY)
// User toggles save to (3) at once and to (2) after a short debounce.

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SLICE_VIS, sanitizeSliceVis } from '../viewer/planeMarks';
import { loadVolumeDisplay, saveVolumeDisplay } from '../services/volumeDisplayState';

// v2: v1 was the Map-only eye state and was written with an all-off
// default on every mount, so it cannot seed the new shared meaning
export const VIS_KEY = 'seismolord.sliceVis.v2';
const CUBE_PREFS_KEY = 'seismolord.cubePrefs.v1';
const SAVE_DEBOUNCE_MS = 1000;

/** Browser copy, else the planes the 3D window last showed, else defaults. */
export function readInitialSliceVis(storage = globalThis.localStorage) {
  try {
    const v2 = storage.getItem(VIS_KEY);
    if (v2) return sanitizeSliceVis(JSON.parse(v2));
    const cube = storage.getItem(CUBE_PREFS_KEY);
    if (cube) return sanitizeSliceVis(JSON.parse(cube));
  } catch { /* private mode or bad JSON */ }
  return { ...DEFAULT_SLICE_VIS };
}

/**
 * @param {Object} p
 * @param {?string} p.volumeId the open volume (null = none)
 * @param {(id: string) => Promise<?{sliceVis}>} [p.load] injectable (tests)
 * @param {(id: string, state) => Promise<boolean>} [p.save] injectable (tests)
 */
export default function useSliceVisibility({
  volumeId, load = loadVolumeDisplay, save = saveVolumeDisplay,
}) {
  const [sliceVis, setSliceVis] = useState(readInitialSliceVis);
  const touchedRef = useRef(false);        // user toggled since the volume opened
  const timerRef = useRef(0);
  const volumeRef = useRef(volumeId);
  volumeRef.current = volumeId;

  useEffect(() => {
    try { localStorage.setItem(VIS_KEY, JSON.stringify(sliceVis)); } catch { /* private mode */ }
  }, [sliceVis]);

  // volume open: adopt its saved state unless the user already toggled
  // or a session restore supplied one
  useEffect(() => {
    touchedRef.current = false;
    if (!volumeId) return undefined;
    let live = true;
    load(volumeId).then((saved) => {
      if (!live || !saved || touchedRef.current) return;
      setSliceVis(sanitizeSliceVis(saved.sliceVis));
    }).catch(() => {});
    return () => { live = false; };
  }, [volumeId, load]);

  // a toggle still inside the debounce when the app closes is flushed
  const pendingRef = useRef(null);
  useEffect(() => () => {
    clearTimeout(timerRef.current);
    const p = pendingRef.current;
    if (p) save(p.id, { sliceVis: p.next });
  }, [save]);

  const scheduleSave = useCallback((next) => {
    clearTimeout(timerRef.current);
    const id = volumeRef.current;
    if (!id) return;
    pendingRef.current = { id, next };
    timerRef.current = setTimeout(() => {
      pendingRef.current = null;
      save(id, { sliceVis: next });
    }, SAVE_DEBOUNCE_MS);
  }, [save]);

  /** User toggle of one plane (explorer eye, 3D Planes menu). */
  const toggle = useCallback((o) => {
    touchedRef.current = true;
    setSliceVis((v) => {
      const next = { ...v, [o]: !v[o] };
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  /** Named session restore (called once the session's volume is open):
   *  wins over the volume's saved state even if that read lands later. */
  const restore = useCallback((vis) => {
    if (!vis) return;
    touchedRef.current = true;
    setSliceVis(sanitizeSliceVis(vis));
  }, []);

  return { sliceVis, toggle, restore };
}
