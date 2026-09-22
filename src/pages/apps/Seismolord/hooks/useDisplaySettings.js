// Per-object display settings for interpretation objects (horizons and
// faults): colour, line weight, opacity and the rest of params.display,
// plus rename. Shared by both object kinds so they behave the same:
//
// - a change applies to the session at once (override layer) and is
//   persisted after a debounce, so slider drags write one row, not fifty;
// - each persisted burst is ONE undo command on the global stack, whose
//   undo restores the display the burst started from (and redo re-applies
//   it), both written back to the row;
// - a rename is its own undo command.
//
// The override stores the FULL display object for a row (replacement,
// not a merge) so an undo back to a display without, say, a colour
// really removes the colour.

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * @param {Object} p
 * @param {Object[]} p.rows current rows (seismic_horizons / seismic_faults)
 * @param {(a: {row: Object, display?: Object, name?: string}) => Promise<Object>} p.persist
 *   writes the row (updateHorizonMeta / updateFaultMeta) and returns it
 * @param {(saved: Object) => void} p.onSaved replace the row in state
 * @param {?import('../lib/undoStack').UndoStack} [p.undoStack]
 * @param {Function} [p.toast]
 * @param {string} [p.noun] 'Horizon' | 'Fault' (toast and undo labels)
 * @param {number} [p.delay] debounce in ms
 */
export default function useDisplaySettings({
  rows, persist, onSaved, undoStack = null, toast = null, noun = 'Object', delay = 800,
}) {
  const [overrides, setOverrides] = useState({});
  const [saving, setSaving] = useState(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const pendingRef = useRef(new Map());   // id -> {timer, baseline}
  const cbRef = useRef({ persist, onSaved, toast });
  cbRef.current = { persist, onSaved, toast };

  const displayFor = useCallback(
    (row) => (row ? (overrides[row.id] || row.params?.display || {}) : {}),
    [overrides],
  );

  const currentDisplay = (row) => overridesRef.current[row.id] || row.params?.display || {};

  /** Write a display to the row (the latest row object, so a pick save
   *  in between cannot be clobbered with stale params). */
  const write = useCallback(async (id, display) => {
    const row = rowsRef.current.find((r) => r.id === id);
    if (!row) return null;
    setSaving(true);
    try {
      const saved = await cbRef.current.persist({ row, display });
      if (saved) cbRef.current.onSaved(saved);
      return saved;
    } finally {
      setSaving(false);
    }
  }, []);

  const applyNow = useCallback(async (id, display) => {
    setOverrides((prev) => ({ ...prev, [id]: display }));
    await write(id, display);
  }, [write]);

  const changeDisplay = useCallback((row, partial) => {
    const before = currentDisplay(row);
    const merged = { ...before, ...partial };
    for (const k of Object.keys(merged)) {
      if (merged[k] === undefined) delete merged[k];
    }
    setOverrides((prev) => ({ ...prev, [row.id]: merged }));
    const pending = pendingRef.current;
    const entry = pending.get(row.id);
    const baseline = entry ? entry.baseline : before;
    if (entry) clearTimeout(entry.timer);
    const timer = setTimeout(async () => {
      pending.delete(row.id);
      try {
        const saved = await write(row.id, merged);
        if (saved && undoStack) {
          undoStack.push({
            label: `${noun.toLowerCase()} display "${saved.name}"`,
            undo: () => applyNow(row.id, baseline),
            redo: () => applyNow(row.id, merged),
          });
        }
      } catch (e) {
        if (cbRef.current.toast) {
          cbRef.current.toast({ title: 'Settings not saved', description: e.message, variant: 'destructive' });
        }
      }
    }, delay);
    pending.set(row.id, { timer, baseline });
  }, [write, applyNow, undoStack, noun, delay]);

  const rename = useCallback(async (row, name) => {
    const oldName = row.name;
    const setName = async (n) => {
      const cur = rowsRef.current.find((r) => r.id === row.id) || row;
      const saved = await cbRef.current.persist({ row: cur, name: n });
      if (saved) cbRef.current.onSaved(saved);
    };
    try {
      await setName(name);
      if (undoStack) {
        undoStack.push({
          label: `rename ${noun.toLowerCase()} "${oldName}" to "${name}"`,
          undo: () => setName(oldName),
          redo: () => setName(name),
        });
      }
      if (cbRef.current.toast) cbRef.current.toast({ title: `${noun} renamed`, description: name });
    } catch (e) {
      if (cbRef.current.toast) {
        cbRef.current.toast({ title: 'Rename failed', description: e.message, variant: 'destructive' });
      }
    }
  }, [undoStack, noun]);

  /** Forget session overrides (volume switch). Pending writes still land. */
  const reset = useCallback(() => setOverrides({}), []);

  useEffect(() => () => {
    for (const { timer } of pendingRef.current.values()) clearTimeout(timer);
  }, []);

  return {
    overrides, displayFor, changeDisplay, rename, saving, reset,
  };
}
