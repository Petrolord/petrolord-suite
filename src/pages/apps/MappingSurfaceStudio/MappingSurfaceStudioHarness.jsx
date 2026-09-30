// Dev-only harness route (/dev/mapping-surface-studio, DEV builds
// only): the FULL Mapping & Surface Studio on the in-memory backend —
// no auth or DB. Seeds 4 wells with tops so the e2e can grid "Top
// Dome" across them, contour it, and publish; a seeded org-shared
// read-only surface exercises the owner-only guards. The registry app
// (G4.4 tile) mounts the same MappingWorkstation on makeRegistryBackend.

import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import MappingWorkstation from './components/MappingWorkstation';
import { DEV_APP_PATHS } from '@/components/wells/appLinks';
import { makeInMemoryBackend } from './services/inMemoryBackend';

export default function MappingSurfaceStudioHarness() {
  // ?harness=sidetrack seeds a sidetrack on KETA-1's slot (T1 e2e)
  const [params] = useSearchParams();
  const sidetrack = params.get('harness') === 'sidetrack';
  // MAP-U1: ?scaleWells=<n> adds n wells (PL10); window.__MAP_SEED__ seeds
  // saved rows from earlier releases (PL5), set by the upgrade e2e
  const scaleWells = Number(params.get('scaleWells')) || 0;
  const backend = useMemo(
    () => makeInMemoryBackend({ sidetrack, scaleWells, seed: typeof window !== 'undefined' ? window.__MAP_SEED__ || null : null }),
    [sidetrack, scaleWells],
  );
  return (
    <div className="h-screen w-full overflow-hidden" data-testid="map-theme-scope">
      <MappingWorkstation backend={backend} appPaths={DEV_APP_PATHS} />
    </div>
  );
}
