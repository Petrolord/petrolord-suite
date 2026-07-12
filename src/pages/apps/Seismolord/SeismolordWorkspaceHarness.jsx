import React from 'react';
import ViewerPanel from './components/ViewerPanel';

// Dev-only harness route (/dev/seismolord-workspace, DEV builds only):
// mounts the full workspace (tool strip / explorer tree / viewport
// windows / status bar) without auth so layout smoke checks and the
// Playwright suite can drive the shell. Supabase-backed services fail
// gracefully when unauthenticated — the tree just renders empty.
export default function SeismolordWorkspaceHarness() {
  return (
    <div className="h-screen w-full overflow-hidden bg-slate-950 text-white">
      <ViewerPanel />
    </div>
  );
}
