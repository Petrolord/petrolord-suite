// Dev-only harness route (/dev/well-cost, DEV builds only): the FULL
// Well Cost & Time Estimator on the in-memory backend, no auth or DB.
// The seeded case is the ORACLE GOLDEN estimate
// (packages/engines/test-data/drilling/goldens/wellcost_cases.json)
// whose risk model carries a FIXED SEED, so the Playwright suite
// asserts the ORACLE'S numbers (and the bit-reproducible Monte Carlo)
// off the rendered UI. The registry-backed app mounts the same
// WctWorkstation on makeWpBackend.

import React, { useMemo } from 'react';
import WctWorkstation from './WctWorkstation';
import { makeInMemoryBackend } from './services/inMemoryBackend';

export default function WellCostTimeHarness() {
  const backend = useMemo(() => makeInMemoryBackend(), []);
  return (
    <div className="h-screen w-full overflow-hidden">
      <WctWorkstation backend={backend} />
    </div>
  );
}
