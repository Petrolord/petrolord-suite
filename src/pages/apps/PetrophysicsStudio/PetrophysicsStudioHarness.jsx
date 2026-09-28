// Dev-only harness route (/dev/petrophysics-studio, DEV builds only):
// the FULL Petrophysics Studio on the in-memory backend — no auth or
// DB. The seeded well IS the analytic type well the oracle goldens are
// generated from (packages/engines/test-data/petrophysics/), so the Playwright suite
// asserts the ORACLE'S zone numbers off the rendered UI (net 18.0 m in
// SAND A with the default parameters). A second org-shared well
// exercises the read-only zone path. The registry-backed app (G2.6
// tile) mounts the same PetroWorkstation on makeRegistryBackend.

import React, { useMemo } from 'react';
import PetroWorkstation from './components/PetroWorkstation';
import { makeInMemoryBackend } from './services/inMemoryBackend';

export default function PetrophysicsStudioHarness() {
  // AppUpgrade PL10: ?scaleWell=1 adds a 20,000 ft, 0.5 ft, 30-curve well;
  // ?extraWells=<n> adds n copies of the type well for batch and field timing
  const backend = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    return makeInMemoryBackend({ scaleWell: q.get('scaleWell') === '1', extraWells: Math.min(200, Number(q.get('extraWells')) || 0) });
  }, []);
  return (
    <div className="h-screen w-full overflow-hidden" data-testid="petro-theme-scope">
      <PetroWorkstation backend={backend} wellDataManagerPath="/dev/well-data-manager" wellCorrelationPath="/dev/well-correlation" mappingPath="/dev/mapping-surface-studio" />
    </div>
  );
}
