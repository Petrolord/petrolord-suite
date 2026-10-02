import React from 'react';
import ViewerPanel from './components/ViewerPanel';
import { makeInMemoryProjectsBackend } from './services/volumesService';
import { DEV_APP_PATHS } from '@/components/wells/appLinks';

// Dev-only harness route (/dev/seismolord-workspace, DEV builds only):
// mounts the full workspace (tool strip / explorer tree / viewport
// windows / status bar) without auth so layout smoke checks and the
// Playwright suite can drive the shell. Supabase-backed services fail
// gracefully when unauthenticated — the tree just renders empty.
// U2-008 organisation sharing: ?projects=1 runs the project folders on the
// in-memory mirror of the sharing rules (one project of your own);
// ?shared=1 adds two projects a colleague shared; ?sharing=off behaves as the
// database before the sharing migration.
export default function SeismolordWorkspaceHarness() {
  const q = new URLSearchParams(window.location.search);
  const demo = q.has('projects') || q.get('shared') === '1' || q.has('sharing');
  const projectsBackend = React.useMemo(() => (demo
    ? makeInMemoryProjectsBackend({ shared: q.get('shared') === '1', sharing: { applied: q.get('sharing') !== 'off' } })
    : null), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="h-screen w-full overflow-hidden">
      {/* ?tour runs the first-run tour (e2e); plain visits skip it */}
      <ViewerPanel appPaths={DEV_APP_PATHS} autoTour={q.has('tour')} projectsBackend={projectsBackend} />
    </div>
  );
}
