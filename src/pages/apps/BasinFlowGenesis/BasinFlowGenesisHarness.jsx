// Dev-only harness route (/dev/basinflow-genesis, DEV builds only; BF0
// 2026-09-06): the whole Basin & Charge Modeling app on the in-memory
// backend, seeded with the oracle's reference basin as a saved well
// (test-data/basinflow/goldens.json reference_basin), so Playwright
// drives Expert mode, runs the simulation and reads the golden's
// present-day source-rock Ro off the screen without auth or DB. Rows
// persist in sessionStorage so a reload proves the save path.

import React, { useMemo } from 'react';
import { BasinFlowShell } from './BasinFlowGenesis';
import { makeInMemoryBackend } from './services/backend';
import { DEV_APP_PATHS } from '@/components/wells/appLinks';

export default function BasinFlowGenesisHarness() {
  // U2-019 organisation sharing: ?shared=1 lists two models a colleague shared;
  // ?sharing=off behaves as the database before the migration
  const backend = useMemo(() => {
    const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    return makeInMemoryBackend({ shared: q.get('shared') === '1', sharing: { applied: q.get('sharing') !== 'off' } });
  }, []);
  return (
    <div className="h-screen w-full overflow-hidden" data-testid="bf-harness">
      <BasinFlowShell backend={backend} appPaths={DEV_APP_PATHS} />
    </div>
  );
}
