// The import a user has set up but not started, and what the viewer was
// showing (owner report 2026-10-17: "View it now" closed the dialog before
// the import started, the setup was gone, and after a visit to another app
// Seismolord was empty). Both live in memory for the life of the tab, so
// closing the dialog or leaving Seismolord and coming back finds them as
// they were. A picked File cannot outlive a reload, so nothing is written
// to storage.
//
//   importDraft   {file, mapping, choices, at} of the picked, unstarted import
//   viewerMemory  {volumeId, localFile: {file, mapping}} of the viewer

import { useSyncExternalStore } from 'react';

function store(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    get: () => value,
    set(next) {
      value = typeof next === 'function' ? next(value) : next;
      listeners.forEach((l) => l());
    },
    subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
  };
}

const draftStore = store(null);
const viewerStore = store({ volumeId: null, localFile: null });

/** The picked, unstarted import, or null. */
export const getImportDraft = () => draftStore.get();

/** Start a draft for a picked file (replaces any earlier one). */
export function beginImportDraft(file, mapping) {
  draftStore.set({ file, mapping, choices: null, at: Date.now() });
}

/** Keep the dialog's choices with the draft (no-op when there is none or it is another file). */
export function updateImportDraft(file, patch) {
  draftStore.set((d) => (d && d.file === file ? { ...d, ...patch } : d));
}

/** The import started, or the user discarded it. */
export const clearImportDraft = () => draftStore.set(null);

export const useImportDraft = () => useSyncExternalStore(draftStore.subscribe, draftStore.get, draftStore.get);

/** What the viewer showed last: a stored volume, or a local file read from disk. */
export const getViewerMemory = () => viewerStore.get();
export const rememberVolume = (volumeId) => viewerStore.set((m) => ({ ...m, volumeId, localFile: volumeId ? null : m.localFile }));
export const rememberLocalFile = (file, mapping) => viewerStore.set((m) => ({ ...m, localFile: file ? { file, mapping } : null }));

/** Tests: start from nothing. */
export function resetImportMemory() {
  draftStore.set(null);
  viewerStore.set({ volumeId: null, localFile: null });
}
