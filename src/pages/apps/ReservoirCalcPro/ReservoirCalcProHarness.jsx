// Dev-only harness route (/dev/reservoircalc-pro, DEV builds only; RC0
// 2026-09-06): the whole ReservoirCalc Pro app on the in-memory backend
// pair (projects, the Mapping harness surfaces plus a seeded depth dome,
// wells with published zone averages, culture layers, prospects) with a
// dev user, so Playwright drives the surface-to-volumes flow without
// auth or DB.

import React, { useMemo } from 'react';
import { ReservoirCalcProvider } from './contexts/ReservoirCalcContext';
import { ReservoirCalcProContent } from './ReservoirCalcPro';
import { makeInMemoryRcpBackend } from './services/rcpBackend';
import { SAVED_PROJECT_ROWS, SAVED_PROSPECT_ROWS } from './services/savedFixtures';
import { DEV_APP_PATHS } from '@/components/wells/appLinks';

export default function ReservoirCalcProHarness() {
  // U1 (PL5): ?saved=1 seeds one saved project and one prospect per release
  const saved = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('saved') === '1';
  // U2-014 organisation sharing: ?shared=1 lists two projects and one prospect a
  // colleague shared; ?sharing=off behaves as the database before the migration
  const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const shared = q.get('shared') === '1';
  const beforeApply = q.get('sharing') === 'off';
  const backend = useMemo(() => makeInMemoryRcpBackend({
    ...(saved ? { savedRows: SAVED_PROJECT_ROWS.map((r) => r.row), prospects: SAVED_PROSPECT_ROWS.map((r) => r.row) } : {}),
    sharedRows: shared,
    sharing: { applied: !beforeApply },
  }), [saved, shared, beforeApply]);
  return (
    <div className="h-screen w-screen" data-testid="rcp-harness">
      <ReservoirCalcProvider backend={backend} appPaths={DEV_APP_PATHS}>
        <ReservoirCalcProContent />
      </ReservoirCalcProvider>
    </div>
  );
}
