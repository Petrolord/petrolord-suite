// Service worker registration and the update prompt (WS6). The worker is
// registered with prompt semantics: a new build never replaces the
// running one under a user mid-shift; it waits until they choose to
// reload. Rendered once in App.jsx; silent when there is nothing to say.
// Since 2026-09-08 it also checks for a new build when the tab comes back
// into view, when the connection returns and every 15 minutes, so the
// prompt appears before a stale shell trips over a vanished chunk.
import React, { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { installUpdateChecks } from '@/lib/pwa/updateChecks';
import { PLATFORM_BUILD } from '@/lib/platformBuild';
import {
  fetchServerBuild, decideUpdate, rememberAutoActivation, rememberLater, clearStaleCaches, buildKey,
} from '@/lib/pwa/versionCheck';

const session = () => { try { return window.sessionStorage; } catch { return null; } };

// 2026-09-22: the prompt only appears when /version.json (fetched with
// no-store) names a build other than the one running, and a worker already
// waiting at page load is activated at once, so one refresh lands on the new
// build and the prompt does not come back (src/lib/pwa/versionCheck.js).
export default function PwaUpdatePrompt() {
  const stopChecks = useRef(null);
  const waitingAtLoad = useRef(false);
  const serverBuild = useRef(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const { needRefresh: [needRefresh, setNeedRefresh], offlineReady: [offlineReady, setOfflineReady], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      waitingAtLoad.current = Boolean(registration && registration.waiting);
      if (stopChecks.current) stopChecks.current();
      stopChecks.current = installUpdateChecks(registration);
    },
    onRegisterError() { /* no worker (unsupported browser or dev server): the app works as before */ },
  });
  useEffect(() => () => { if (stopChecks.current) stopChecks.current(); }, []);

  // Running the server's build: drop caches older set-ups left behind.
  useEffect(() => {
    let live = true;
    fetchServerBuild().then((server) => {
      if (live && server && buildKey(server) === buildKey(PLATFORM_BUILD)) clearStaleCaches();
    });
    return () => { live = false; };
  }, []);

  // A waiting worker was reported: ask the server before saying anything.
  useEffect(() => {
    if (!needRefresh) { setShowUpdate(false); return undefined; }
    let live = true;
    const atLoad = waitingAtLoad.current;
    waitingAtLoad.current = false;
    fetchServerBuild().then((server) => {
      if (!live) return;
      serverBuild.current = server;
      const action = decideUpdate({ running: PLATFORM_BUILD, server, atLoad, storage: session() });
      if (action === 'activate-quietly') { setNeedRefresh(false); updateServiceWorker(false); return; }
      if (action === 'activate-and-reload') { rememberAutoActivation(server, session()); updateServiceWorker(true); return; }
      if (action === 'none') { setNeedRefresh(false); return; }
      setShowUpdate(true);
    });
    return () => { live = false; };
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  const later = () => {
    rememberLater(serverBuild.current, session());
    setShowUpdate(false);
    setNeedRefresh(false);
  };

  if (!showUpdate && !offlineReady) return null;
  return (
    <div className="fixed bottom-3 right-3 z-[60] rounded border border-slate-700 bg-slate-900 text-slate-100 text-xs shadow-lg px-3 py-2 flex items-center gap-3" data-testid="pwa-prompt" role="status">
      {showUpdate ? (
        <>
          <span>A new version of the Suite is ready. Reload when it suits you.</span>
          <button type="button" data-testid="pwa-reload" className="px-2 py-0.5 rounded border border-cyan-500/60 text-cyan-300" onClick={() => updateServiceWorker(true)}>Reload</button>
          <button type="button" data-testid="pwa-later" className="px-2 py-0.5 text-slate-400" onClick={later}>Later</button>
        </>
      ) : (
        <>
          <span>The Suite shell is ready to open without a connection.</span>
          <button type="button" data-testid="pwa-ok" className="px-2 py-0.5 text-slate-400" onClick={() => setOfflineReady(false)}>OK</button>
        </>
      )}
    </div>
  );
}
