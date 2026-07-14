// Dev-only harness route (/dev/earth-modeling, DEV builds only): the
// FULL Earth Modeling app on the in-memory backend — no auth or DB.
// The seeded surfaces/wells are the analytic oracle fixture
// (packages/engines/test-data/earthmodel/), so the Playwright suite asserts the
// ORACLE'S numbers off the rendered UI: stacking TopA/TopB/BaseB with
// the L-shaped fault polygon clamps exactly 180 nodes, blocks census
// 174/326, and zone-A total bulk volume reads 45.000 ×10⁶ m³. The
// registry-backed app (G8 tile) mounts the same EarthWorkstation on
// makeRegistryBackend.

import React, { useMemo } from 'react';
import EarthWorkstation from './components/EarthWorkstation';
import { makeInMemoryBackend } from './services/inMemoryBackend';

export default function EarthModelingHarness() {
  const backend = useMemo(() => makeInMemoryBackend(), []);
  return (
    <div className="h-screen w-full overflow-hidden">
      <EarthWorkstation backend={backend} />
    </div>
  );
}
