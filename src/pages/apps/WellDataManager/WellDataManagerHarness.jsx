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
import { DEV_APP_PATHS } from '@/components/wells/appLinks';

// AppUpgrade PL10: ?seedWells=<n> adds n located, owned wells so the tree
// and map can be timed at a customer's registry size (DEV harness only).
function scaleRows(n) {
  const wells = [];
  for (let i = 0; i < n; i++) {
    wells.push({
      id: `scale-${i}`, user_id: 'user-dev', organization_id: null, name: `SCALE-${String(i + 1).padStart(4, '0')}`, uwi: null,
      surface_x: 500000 + (i % 40) * 250, surface_y: 6700000 + Math.floor(i / 40) * 250, kb_m: 25, td_md_m: 2500,
      crs: 'EPSG:32631', xy_unit: 'm', deviation: [], checkshots: [],
      created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z',
    });
  }
  return { wells };
}

export default function WellDataManagerHarness() {
  const backend = useMemo(() => {
    const n = Number(new URLSearchParams(window.location.search).get('seedWells')) || 0;
    return makeInMemoryBackend({ worker: true, ...(n > 0 ? { seedRows: scaleRows(Math.min(n, 20000)) } : {}) });
  }, []);
  return (
    <div className="h-screen w-full overflow-hidden" data-testid="wdm-theme-scope">
      <WellWorkstation backend={backend} appPaths={DEV_APP_PATHS} helpPath="/dev/well-data-manager/help" />
    </div>
  );
}
