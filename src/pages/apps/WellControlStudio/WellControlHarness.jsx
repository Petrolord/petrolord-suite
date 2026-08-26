// Dev-only harness route (/dev/well-control, DEV builds only): the FULL
// Well Control Studio on the in-memory backend — no auth or DB. The seeded
// case IS the oracle golden slant well and its moderate_gas kick
// (packages/engines/test-data/drilling/goldens/wellcontrol_cases.json) so
// the Playwright suite asserts the ORACLE'S numbers off the rendered UI
// (KMW, ICP, FCP, MAASP, kick tolerance). The registry-backed app mounts
// the same WCWorkstation on makeWpBackend.

import React, { useMemo } from 'react';
import WCWorkstation from './WCWorkstation';
import { makeInMemoryBackend } from './services/inMemoryBackend';

export default function WellControlHarness() {
  const backend = useMemo(() => makeInMemoryBackend(), []);
  return (
    <div className="h-screen w-full overflow-hidden">
      <WCWorkstation backend={backend} />
    </div>
  );
}
