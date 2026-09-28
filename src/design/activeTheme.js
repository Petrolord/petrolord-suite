// The theme of the scope on screen, for the few pieces mounted at the
// app root outside every scope (the toaster). Owner revision of lead
// decision 3 (2026-09-28): toasts match the page.
//
// Each outermost <ThemedApp> publishes its resolved theme while it is
// mounted; the most recently mounted one wins, and when none is mounted the
// value is null (the homepage), where the toaster takes its paper style. The value is mirrored on <html data-pl-active-theme> for
// debugging and for CSS that needs it; no stylesheet rule reads it today.
import { useSyncExternalStore } from 'react';

const ATTR = 'data-pl-active-theme';
const entries = []; // [{ id, theme }] in mount order
const listeners = new Set();
let nextId = 1;

function current() {
  return entries.length ? entries[entries.length - 1].theme : null;
}

function emit() {
  if (typeof document !== 'undefined') {
    const t = current();
    if (t) document.documentElement.setAttribute(ATTR, t);
    else document.documentElement.removeAttribute(ATTR);
  }
  listeners.forEach((l) => l());
}

/** Register a mounted scope; returns { update(theme), release() }. */
export function publishActiveTheme(theme) {
  const entry = { id: nextId++, theme };
  entries.push(entry);
  emit();
  return {
    update(next) {
      if (entry.theme === next) return;
      entry.theme = next;
      emit();
    },
    release() {
      const i = entries.indexOf(entry);
      if (i >= 0) entries.splice(i, 1);
      emit();
    },
  };
}

export function getActiveTheme() {
  return current();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 'light' | 'dark' while a scope is mounted, otherwise null. */
export function useActiveTheme() {
  return useSyncExternalStore(subscribe, current, () => null);
}
