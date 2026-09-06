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
import { DEV_APP_PATHS } from '@/components/wells/appLinks';

export default function ReservoirCalcProHarness() {
  const backend = useMemo(() => makeInMemoryRcpBackend(), []);
  return (
    <div className="h-screen w-screen bg-slate-950" data-testid="rcp-harness">
      <ReservoirCalcProvider backend={backend} appPaths={DEV_APP_PATHS}>
        <ReservoirCalcProContent />
      </ReservoirCalcProvider>
    </div>
  );
}
