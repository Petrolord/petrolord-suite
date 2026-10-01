// Dev-only harness route (/dev/rock-physics-studio, DEV builds only):
// the FULL Rock Physics Studio on the in-memory backend — no auth or
// DB. The seeded wells are built from the oracle goldens' anchor
// cases (packages/engines/test-data/rockphysics/), so the Playwright suite asserts the
// ORACLE'S numbers off the rendered UI: the brine-sand zone
// substitutes to Vp 2905.70 / Vs 1890.98 / ρ 2038.71, the shale/gas-
// sand interface reads A -0.1118 / B -0.2437 class III, and the
// default wedge tunes at 16 ms. The registry-backed app (G6.5 tile)
// mounts the same RockWorkstation on makeRegistryBackend.

import React, { useMemo } from 'react';
import RockWorkstation from './components/RockWorkstation';
import { makeInMemoryBackend } from './services/inMemoryBackend';
import { DEV_APP_PATHS } from '@/components/wells/appLinks';

export default function RockPhysicsStudioHarness() {
  // RP-U1: ?hostile=1 adds the vendor-export evidence well, ?long=1 the 5000 m well;
  // RP-U2: ?trend=1 the wet-trend well with a gas bed, ?nosonic=1 a well with no
  // sonic log and a calibration well
  const backend = useMemo(() => {
    const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    return makeInMemoryBackend({ hostile: q.has('hostile'), long: q.has('long'), trend: q.has('trend'), nosonic: q.has('nosonic'), minerals: q.has('minerals'), pp: q.has('pp') });
  }, []);
  return (
    <div className="h-screen w-full overflow-hidden">
      <RockWorkstation backend={backend} appPaths={DEV_APP_PATHS} />
    </div>
  );
}
