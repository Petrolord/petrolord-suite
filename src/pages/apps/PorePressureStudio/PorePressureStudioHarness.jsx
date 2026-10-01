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
import { DEV_APP_PATHS } from '@/components/wells/appLinks';

export default function PorePressureStudioHarness() {
  const backend = useMemo(() => {
    const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    // ?saved=p3|pp0|t1|u1 opens a project as that release saved it (PL5)
    return makeInMemoryBackend({ layerCake: q.get('layercake') === '1', saved: q.get('saved') });
  }, []);
  return (
    <div className="h-screen w-full overflow-hidden" data-testid="pp-theme-scope">
      <PPWorkstation backend={backend} appPaths={DEV_APP_PATHS} />
    </div>
  );
}
