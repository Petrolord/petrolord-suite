// Conversion (import) progress the viewer can show while a local file is
// open: time slices wait for conversion, and the viewer says how far it
// has got. Whoever runs the conversion publishes here (today ImportPanel;
// Stream C's background job replaces it and publishes the same shape).
//
//   { fileName, phase: 'scan'|'transcode'|'upload'|string, done, total|null }

import { useSyncExternalStore } from 'react';

let state = null;
const listeners = new Set();

const emit = () => { for (const l of listeners) l(); };

/** @param {{fileName?: string, phase: string, done: number, total: ?number}} p */
export function publishConversionProgress(p) {
  state = { ...p, updatedAt: Date.now() };
  emit();
}

export function clearConversionProgress() {
  if (state === null) return;
  state = null;
  emit();
}

export const getConversionProgress = () => state;

export function subscribeConversionProgress(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React hook: the latest conversion progress, or null. */
export function useConversionProgress() {
  return useSyncExternalStore(subscribeConversionProgress, getConversionProgress, getConversionProgress);
}

const PHASE_WORDS = {
  scan: 'Reading trace headers',
  transcode: 'Converting to bricks',
  upload: 'Uploading',
};

/** "Converting to bricks: 42%" for the viewer notice. */
export function describeConversion(p) {
  if (!p) return null;
  const words = PHASE_WORDS[p.phase] || 'Converting';
  if (p.total) return `${words}: ${Math.floor((p.done / p.total) * 100)}%`;
  return `${words}: ${Number(p.done || 0).toLocaleString('en-US')} done`;
}
