// usePendingSave: the studio autosave that never drops an edit (Guided Journey
// design 6.4; the autosave leave hazard found 2026-10-09).
//
// The studios saved 10 s after the last edit with a timer that was cleared
// when the studio unmounted, so leaving sooner lost the edit while the header
// said "Saved". SCAL Studio (#949), QI Studio (#961) and Well Test (2026-10-14)
// were fixed by hand; this hook is that fix, once, for every studio:
//  - an edit is a change of what a save would write (a print of the payload
//    without its `modified` stamp), so opening a project is not an edit and
//    undoing an edit makes the project clean again;
//  - the save runs `delayMs` after the last edit;
//  - pending edits are written at once when the studio unmounts, when the
//    page is hidden, on pagehide / beforeunload (the save is started; the
//    browser does not wait for it, so closing the tab also asks to confirm),
//    and when the caller runs `flush()` (before opening or creating another
//    project);
//  - while edits are pending, an 'unsaved' Activity item says so, so the
//    Activity indicator and the leave guard know.
//
// A save made by the studio itself (its Save button, a new project) shows up
// as a new `savedAt` (the studio's lastSaveTime): the state as it was when
// that save started becomes the saved state.

import { useCallback, useEffect, useRef, useState } from 'react';
import { publishActivity } from '@/lib/activity/activity';

/** What a save would write, without the stamp that changes on every call:
 *  equal prints mean nothing is waiting to be saved. */
export function payloadPrint(p) {
  if (!p || typeof p !== 'object') return String(p);
  const { modified: _m, ...rest } = p;
  try { return JSON.stringify(rest); } catch { return `unprintable:${Math.random()}`; }
}

/** A save result counts as failed when it is false or {ok: false}. */
const succeeded = (res) => res !== false && !(res && typeof res === 'object' && res.ok === false);

let instanceSeq = 0;

/**
 * @param {object} o
 * @param {string} o.appId       Activity: the app id (route segment)
 * @param {string} o.appName     Activity: the app's name
 * @param {string} [o.href]      Activity: where to go back to (default: the path the studio mounted on)
 * @param {string} [o.projectName] Activity: named in the item's title
 * @param {*}      o.projectKey  the open project's id once it is loaded; null when nothing is open
 * @param {boolean} [o.canWrite] false while the project is open read-only (no saves, no item)
 * @param {Array}  o.changeKey   the state the payload is built from (the old autosave effect's deps)
 * @param {Function} o.payload   () => what a save writes
 * @param {Function} o.save      async (payload) => result; false, {ok:false} or a throw is a failure
 * @param {Function} [o.print]   payload => string (default payloadPrint)
 * @param {boolean} [o.saving]   the studio's isSaving (a save it started itself)
 * @param {*}      [o.savedAt]   the studio's lastSaveTime
 * @param {number} [o.delayMs]   debounce after the last edit (10 s)
 * @returns {{dirty: boolean, flush: () => Promise<boolean>, rebaseline: () => void}}
 */
export function usePendingSave({
  appId, appName, href, projectName = '',
  projectKey, canWrite = true, changeKey = [],
  payload, save, print = payloadPrint,
  saving = false, savedAt = null, delayMs = 10000,
}) {
  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  const setDirty = (v) => { dirtyRef.current = v; setDirtyState(v); };

  const latest = useRef({});
  latest.current = { payload, save, print, projectKey, canWrite, delayMs };

  const baselineRef = useRef(null);      // print of the saved state
  const baselineKeyRef = useRef(null);   // the project that baseline belongs to
  const rebaselineRef = useRef(false);   // take a new baseline at the next check
  const seqRef = useRef(0);              // counts edits (checks whose print changed)
  const lastPrintRef = useRef(null);     // the print at the last check
  const timerRef = useRef(null);
  const inflightRef = useRef(null);
  const startRef = useRef(null);         // {key, seq, print} of the save in flight (ours or the studio's)

  const sourceIdRef = useRef(null);
  if (!sourceIdRef.current) { instanceSeq += 1; sourceIdRef.current = `unsaved:${appId || 'app'}:${instanceSeq}`; }
  const hrefRef = useRef(null);
  if (hrefRef.current === null) hrefRef.current = href || (typeof window !== 'undefined' ? window.location.pathname : '');

  const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };

  // A save that started at `start` went through: what it wrote is the saved
  // state, and the project is clean unless it was edited since. Applied by
  // the save itself and again when the new lastSaveTime renders (whichever
  // comes first; the result is the same).
  const applySaved = (start) => {
    if (!start || baselineKeyRef.current !== start.key) return;
    baselineRef.current = start.print;
    if (seqRef.current === start.seq) { clearTimer(); if (dirtyRef.current) setDirty(false); }
  };

  // Write the pending edits once; resolves true when nothing is left to save.
  const runSave = useCallback(async () => {
    if (inflightRef.current) { try { await inflightRef.current; } catch { /* reported by the save */ } }
    const l = latest.current;
    if (!dirtyRef.current || l.projectKey == null || !l.canWrite) return true;
    const key = l.projectKey;
    const sent = l.payload();
    const start = { key, seq: seqRef.current, print: l.print(sent) };
    startRef.current = start;
    const run = (async () => {
      let ok = false;
      try { ok = succeeded(await l.save(sent)); } catch (e) { console.error(e); ok = false; }
      if (ok) applySaved(start);
      else if (startRef.current === start) startRef.current = null;
      return ok;
    })();
    inflightRef.current = run;
    try { return await run; } finally { if (inflightRef.current === run) inflightRef.current = null; }
  }, []);

  const flush = useCallback(async () => {
    clearTimer();
    return runSave();
  }, [runSave]);

  const rebaseline = useCallback(() => { rebaselineRef.current = true; }, []);

  // Each change: compare with the saved state and (re)start the debounce.
  useEffect(() => {
    const l = latest.current;
    if (projectKey == null) {
      baselineKeyRef.current = null;
      clearTimer();
      if (dirtyRef.current) setDirty(false);
      return undefined;
    }
    const p = l.print(l.payload());
    if (baselineKeyRef.current !== projectKey || rebaselineRef.current) {
      baselineKeyRef.current = projectKey;
      rebaselineRef.current = false;
      baselineRef.current = p;
      lastPrintRef.current = p;
      clearTimer();
      if (dirtyRef.current) setDirty(false);
      return undefined;
    }
    if (p !== lastPrintRef.current) {
      lastPrintRef.current = p;
      seqRef.current += 1;
      const changed = p !== baselineRef.current;
      if (changed !== dirtyRef.current) setDirty(changed);
      clearTimer(); // an edit restarts the delay
    }
    if (!dirtyRef.current || !canWrite) clearTimer();
    else if (!timerRef.current) {
      timerRef.current = setTimeout(() => { timerRef.current = null; runSave(); }, l.delayMs);
    }
    return undefined;
  }, [projectKey, canWrite, ...changeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new lastSaveTime: what was written is now the saved state. (Declared
  // before the isSaving effect: both change in the same render when a save ends.)
  const prevSavedAtRef = useRef(savedAt);
  useEffect(() => {
    if (savedAt === prevSavedAtRef.current) return;
    prevSavedAtRef.current = savedAt;
    if (!savedAt) return;
    const l = latest.current;
    const start = startRef.current;
    startRef.current = null;
    if (start) { applySaved(start); return; }
    // a save with no known start (a new project): the state on screen is saved
    if (l.projectKey == null || baselineKeyRef.current !== l.projectKey) return;
    baselineRef.current = l.print(l.payload());
    clearTimer();
    if (dirtyRef.current) setDirty(false);
  }, [savedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // A save the studio started itself (its Save button): remember what it writes.
  const prevSavingRef = useRef(saving);
  useEffect(() => {
    if (saving && !prevSavingRef.current && !inflightRef.current && projectKey != null) {
      const l = latest.current;
      startRef.current = { key: projectKey, seq: seqRef.current, print: l.print(l.payload()) };
    }
    // ended without a new lastSaveTime: it failed
    if (!saving && prevSavingRef.current && !inflightRef.current) startRef.current = null;
    prevSavingRef.current = saving;
  }, [saving, projectKey]);

  // Leaving: write pending edits on hide, pagehide, beforeunload and unmount.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    const onPageHide = () => { flush(); };
    const onUnload = (e) => {
      const l = latest.current;
      if (!dirtyRef.current || l.projectKey == null || !l.canWrite) return undefined;
      flush();
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onUnload);
      flush();
    };
  }, [flush]);

  // Activity: one 'unsaved' item while edits are pending.
  const pending = dirty && canWrite && projectKey != null;
  useEffect(() => {
    const id = sourceIdRef.current;
    if (!pending) { publishActivity(id, []); return undefined; }
    publishActivity(id, [{
      id,
      appId,
      appName,
      kind: 'unsaved',
      title: projectName ? `Unsaved changes in ${projectName}` : 'Unsaved changes',
      state: 'dirty',
      progress: null,
      href: hrefRef.current,
      onLeave: 'loses',
      actions: {
        save: async () => {
          const ok = await flush();
          if (!ok) throw new Error('The save did not go through');
        },
      },
    }]);
    return undefined;
  }, [pending, appId, appName, projectName, flush]);
  useEffect(() => () => publishActivity(sourceIdRef.current, []), []);

  return { dirty, flush, rebaseline };
}

export default usePendingSave;
