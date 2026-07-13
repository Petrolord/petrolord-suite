// Dev-only harness route (/dev/petrophysics-studio, DEV builds only):
// the FULL Petrophysics Studio on the in-memory backend — no auth or
// DB. The seeded well IS the analytic type well the oracle goldens are
// generated from (test-data/petrophysics/), so the Playwright suite
// asserts the ORACLE'S zone numbers off the rendered UI (net 18.0 m in
// SAND A with the default parameters). A second org-shared well
// exercises the read-only zone path. The registry-backed app (G2.6
// tile) mounts the same PetroWorkstation on makeRegistryBackend.

import React, { useMemo } from 'react';
import PetroWorkstation from './components/PetroWorkstation';
import { makeInMemoryBackend } from './services/inMemoryBackend';

export default function PetrophysicsStudioHarness() {
  const backend = useMemo(() => makeInMemoryBackend(), []);
  return (
    <div className="h-screen w-full overflow-hidden">
      <PetroWorkstation backend={backend} />
    </div>
  );
}
