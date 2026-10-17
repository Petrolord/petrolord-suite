// Activity: everything running or not yet saved, in every app, for the life of
// the tab (Guided Journey design 6.4; owner 2026-10-17: users wander off while
// something loads and expect to find their way back). Apps publish their own
// items here (Seismolord through services/activityBridge.js; the shell reads
// server jobs), so the shell never imports app code. Pure apart from the
// in-memory store.
//
// Item: { id, appId, appName, kind: 'upload'|'conversion'|'server-job'|'unsaved',
//         title, progress: 0..1|null, state: 'running'|'paused'|'failed'|'done'|'dirty',
//         href, onLeave: 'continues'|'stops'|'loses', actions?: {pause, resume, cancel, dismiss, save} }

import { useSyncExternalStore } from 'react';

const sources = new Map();   // source id -> items
const listeners = new Set();
let snapshot = [];

function emit() {
  snapshot = [...sources.values()].flat();
  listeners.forEach((l) => l());
}

/** Replace every item of one source (an app or the server-jobs reader). */
export function publishActivity(sourceId, items) {
  if (!items || !items.length) sources.delete(sourceId);
  else sources.set(sourceId, items.map((i) => ({ onLeave: 'continues', progress: null, ...i, source: sourceId })));
  emit();
}

export const getActivity = () => snapshot;
export const subscribeActivity = (l) => { listeners.add(l); return () => listeners.delete(l); };
export const useActivity = () => useSyncExternalStore(subscribeActivity, getActivity, getActivity);

/** Tests: start from nothing. */
export function resetActivity() { sources.clear(); emit(); }

const ACTIVE = new Set(['running', 'paused', 'dirty']);

/** What the indicator shows. */
export function buildActivity(items) {
  const running = items.filter((i) => i.state === 'running');
  const attention = items.filter((i) => i.state === 'failed' || i.state === 'paused' || i.state === 'dirty');
  return {
    items,
    count: items.filter((i) => ACTIVE.has(i.state) || i.state === 'failed').length,
    running: running.length > 0,
    attention: attention.length,
    done: items.filter((i) => i.state === 'done').length,
  };
}

/** The app id of a dashboard path (/dashboard/apps/<module>/<app>/...), or null. */
export function appOfPath(pathname) {
  const m = /^\/dashboard\/apps\/[^/]+\/([^/?#]+)/.exec(String(pathname || ''));
  return m ? m[1] : null;
}

/**
 * Leaving `fromPath` for `toPath`: what happens to the app's work. An item
 * belongs to the app its `href` opens (route paths, so aliases of one app
 * id, such as nodal-analysis-studio, compare as paths).
 * @returns {{leaving: boolean, block: object[], carryOn: object[]}}
 *   block: items that would stop or be lost (ask first);
 *   carryOn: running items that continue in the background (say so)
 */
export function leaveVerdict(items, fromPath, toPath) {
  const from = appOfPath(fromPath);
  const to = appOfPath(toPath);
  if (!from || from === to) return { leaving: false, block: [], carryOn: [] };
  const mine = items.filter((i) => appOfPath(i.href) === from && ACTIVE.has(i.state));
  return {
    leaving: true,
    block: mine.filter((i) => i.onLeave === 'loses' || i.onLeave === 'stops'),
    carryOn: mine.filter((i) => i.onLeave === 'continues' && i.state === 'running'),
  };
}
