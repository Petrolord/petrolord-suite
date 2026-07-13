// Dev-only harness route (/dev/well-data-manager, DEV builds only):
// the FULL Well Data Manager app on the in-memory backend — the whole
// import → view → share → delete flow drivable by Playwright without
// auth or DB. LAS parsing still runs the real engine in the real
// worker; a seeded org-shared well from another user exercises the
// read-only path. The registry-backed app (G1.5 tile) mounts the same
// WellWorkstation on makeRegistryBackend.

import React, { useMemo } from 'react';
import WellWorkstation from './components/WellWorkstation';
import { makeInMemoryBackend } from './services/inMemoryBackend';

export default function WellDataManagerHarness() {
  const backend = useMemo(() => makeInMemoryBackend({ worker: true }), []);
  return (
    <div className="h-screen w-full overflow-hidden">
      <WellWorkstation backend={backend} />
    </div>
  );
}
