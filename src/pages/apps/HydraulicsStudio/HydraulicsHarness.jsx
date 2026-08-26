// Dev-only harness route (/dev/hydraulics, DEV builds only): the FULL
// Hydraulics Studio on the in-memory backend — no auth or DB. The seeded
// case IS the oracle golden slant well (packages/engines/test-data/
// drilling/goldens/hydraulics_cases.json) so the Playwright suite asserts
// the ORACLE'S numbers off the rendered UI (pump pressure, ECD, surge/swab,
// transport ratio). The registry-backed app mounts the same HydWorkstation
// on makeWpBackend.

import React, { useMemo } from 'react';
import HydWorkstation from './HydWorkstation';
import { makeInMemoryBackend } from './services/inMemoryBackend';

export default function HydraulicsHarness() {
  const backend = useMemo(() => makeInMemoryBackend(), []);
  return (
    <div className="h-screen w-full overflow-hidden">
      <HydWorkstation backend={backend} />
    </div>
  );
}
