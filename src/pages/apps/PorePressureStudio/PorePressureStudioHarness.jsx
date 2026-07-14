// Dev-only harness route (/dev/pore-pressure-studio, DEV builds only):
// the FULL Pore Pressure Studio on the in-memory backend — no auth or
// DB. The seeded well IS the oracle goldens' synthetic well
// (packages/engines/test-data/porepressure/goldens.json) and the seeded project carries
// the goldens' own parameters, so the Playwright suite asserts the
// ORACLE'S numbers off the rendered UI: the depth readout reproduces
// goldens.well pressures and an NCT fit on hydrostatic-section picks
// recovers the generating (dt_ml, c). The registry-backed app (P4
// tile) mounts the same PPWorkstation on makeRegistryBackend.

import React, { useMemo } from 'react';
import PPWorkstation from './components/PPWorkstation';
import { makeInMemoryBackend } from './services/inMemoryBackend';

export default function PorePressureStudioHarness() {
  const backend = useMemo(() => makeInMemoryBackend(), []);
  return (
    <div className="h-screen w-full overflow-hidden">
      <PPWorkstation backend={backend} />
    </div>
  );
}
