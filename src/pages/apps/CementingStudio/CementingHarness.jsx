// Dev-only harness route (/dev/cementing, DEV builds only): the FULL
// Cementing Studio on the in-memory backend — no auth or DB. The seeded job
// IS the oracle golden slant-well 7" job (packages/engines/test-data/
// drilling/goldens/cementing_cases.json) so the Playwright suite asserts
// the ORACLE'S numbers off the rendered UI (slurry volume, sacks, end pump
// pressure, max ECD, min standoff). The registry-backed app mounts the same
// CmtWorkstation on makeWpBackend.

import React, { useMemo } from 'react';
import CmtWorkstation from './CmtWorkstation';
import { makeInMemoryBackend } from './services/inMemoryBackend';

export default function CementingHarness() {
  const backend = useMemo(() => makeInMemoryBackend(), []);
  return (
    <div className="h-screen w-full overflow-hidden">
      <CmtWorkstation backend={backend} />
    </div>
  );
}
