import React from 'react';
import { ThemedApp } from '@/design/ThemeProvider';
import ViewerPanel from './components/ViewerPanel';
import { SeismolordToneProvider, useSeismolordTone } from './toneExperiment';
import { DEV_APP_PATHS } from '@/components/wells/appLinks';

// Dev-only harness route (/dev/seismolord-workspace, DEV builds only):
// mounts the full workspace (tool strip / explorer tree / viewport
// windows / status bar) without auth so layout smoke checks and the
// Playwright suite can drive the shell. Supabase-backed services fail
// gracefully when unauthenticated — the tree just renders empty.
export default function SeismolordWorkspaceHarness() {
  const toneState = useSeismolordTone();
  return (
    <SeismolordToneProvider value={toneState}>
      <ThemedApp className="h-screen w-full overflow-hidden" tone={toneState.tone || undefined}>
        {/* ?tour runs the first-run tour (e2e); plain visits skip it */}
        <ViewerPanel appPaths={DEV_APP_PATHS} autoTour={new URLSearchParams(window.location.search).has('tour')} />
      </ThemedApp>
    </SeismolordToneProvider>
  );
}
