// Service worker registration and the update prompt (WS6). The worker is
// registered with prompt semantics: a new build never replaces the
// running one under a user mid-shift; it waits until they choose to
// reload. Rendered once in App.jsx; silent when there is nothing to say.
// Since 2026-09-08 it also checks for a new build when the tab comes back
// into view, when the connection returns and every 15 minutes, so the
// prompt appears before a stale shell trips over a vanished chunk.
import React, { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { installUpdateChecks } from '@/lib/pwa/updateChecks';

export default function PwaUpdatePrompt() {
  const stopChecks = useRef(null);
  const { needRefresh: [needRefresh, setNeedRefresh], offlineReady: [offlineReady, setOfflineReady], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (stopChecks.current) stopChecks.current();
      stopChecks.current = installUpdateChecks(registration);
    },
    onRegisterError() { /* no worker (unsupported browser or dev server): the app works as before */ },
  });
  useEffect(() => () => { if (stopChecks.current) stopChecks.current(); }, []);
  if (!needRefresh && !offlineReady) return null;
  return (
    <div className="fixed bottom-3 right-3 z-[60] rounded border border-slate-700 bg-slate-900 text-slate-100 text-xs shadow-lg px-3 py-2 flex items-center gap-3" data-testid="pwa-prompt" role="status">
      {needRefresh ? (
        <>
          <span>A new version of the Suite is ready. Reload when it suits you.</span>
          <button type="button" data-testid="pwa-reload" className="px-2 py-0.5 rounded border border-cyan-500/60 text-cyan-300" onClick={() => updateServiceWorker(true)}>Reload</button>
          <button type="button" data-testid="pwa-later" className="px-2 py-0.5 text-slate-400" onClick={() => setNeedRefresh(false)}>Later</button>
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
