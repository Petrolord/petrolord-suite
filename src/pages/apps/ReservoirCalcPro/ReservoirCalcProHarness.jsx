// Dev-only harness route (/dev/reservoircalc-pro, DEV builds only; RC0
// 2026-09-06): the whole ReservoirCalc Pro app on the in-memory backend
// pair (projects, the Mapping harness surfaces plus a seeded depth dome,
// wells with published zone averages, culture layers, prospects) with a
// dev user, so Playwright drives the surface-to-volumes flow without
// auth or DB.
//   ?rerunProspect=prospect-1&returnTo=/dev/risked-reserves   the "Re-run
//   prospect" link from Risked Reserves Valuation (U2-006)
//   ?sourceChanged=1   source freshness: the project "Keta source check"
//   averaged a zone a colleague has since published again, and imported a
//   surface that has left the registry (2026-10-12)
//   ?topBase=1   seeds a top and base surface pair (Ekene Sand Top/Base)
//   ?frame=dashboard   mounts the app inside the /dashboard frame (an
//   h-screen row, a scrolling main and the min-h-full DashboardScope), the
//   frame the live route renders in, so the previews are sized as users see
//   them (RCP preview sizing, 2026-10-12)

import React, { useMemo } from 'react';
import { ReservoirCalcProvider } from './contexts/ReservoirCalcContext';
import { ReservoirCalcProContent, RCP_ROOT_CLASS } from './ReservoirCalcPro';
import { makeInMemoryRcpBackend } from './services/rcpBackend';
import { SAVED_PROJECT_ROWS, SAVED_PROSPECT_ROWS, RERUN_PROJECT_ROW } from './services/savedFixtures';
import { RRV_SEED_PROSPECTS } from '../riskedreserves/services/rrvFixtures';
import { DEV_APP_PATHS } from '@/components/wells/appLinks';
import { DashboardScope } from '@/design/DashboardScope';

export default function ReservoirCalcProHarness() {
  // U1 (PL5): ?saved=1 seeds one saved project and one prospect per release
  const saved = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('saved') === '1';
  // U2-014 organisation sharing: ?shared=1 lists two projects and one prospect a
  // colleague shared; ?sharing=off behaves as the database before the migration
  const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const shared = q.get('shared') === '1';
  const beforeApply = q.get('sharing') === 'off';
  // Risked Reserves Valuation U2-006: ?rerunProspect=<id> (the link from a
  // valuation) seeds the Risked Reserves harness prospects (prospect-1 and
  // prospect-2) and the project their source names, so the link opens here
  const rerun = !!q.get('rerunProspect');
  const sourceChanged = q.get('sourceChanged') === '1';
  // ?topBase=1 adds "Ekene Sand Top" and "Ekene Sand Base" to the surface
  // registry (the same dome 30 m apart) for the top, base and contact check
  const topBase = q.get('topBase') === '1';
  const backend = useMemo(() => makeInMemoryRcpBackend({
    ...(saved ? { savedRows: SAVED_PROJECT_ROWS.map((r) => r.row), prospects: SAVED_PROSPECT_ROWS.map((r) => r.row) } : {}),
    ...(rerun ? { savedRows: [RERUN_PROJECT_ROW], prospects: RRV_SEED_PROSPECTS } : {}),
    sharedRows: shared,
    sharing: { applied: !beforeApply },
    sourceChanged,
    topBase,
  }), [saved, shared, beforeApply, rerun, sourceChanged, topBase]);
  const app = (
    <ReservoirCalcProvider backend={backend} appPaths={DEV_APP_PATHS}>
      <ReservoirCalcProContent />
    </ReservoirCalcProvider>
  );
  if (q.get('frame') === 'dashboard') {
    return (
      <div className="flex h-screen" data-testid="rcp-harness">
        <main className="flex-1 overflow-y-auto w-full">
          <DashboardScope>
            <div className={RCP_ROOT_CLASS} data-testid="rcp-theme-scope">{app}</div>
          </DashboardScope>
        </main>
      </div>
    );
  }
  return (
    <div className="h-screen w-screen" data-testid="rcp-harness">
      {app}
    </div>
  );
}
