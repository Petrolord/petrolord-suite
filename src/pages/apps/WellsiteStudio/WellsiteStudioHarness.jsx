// Dev-only harness route (/dev/wellsite-studio, DEV builds only): the FULL
// Wellsite Studio on the real local database with the fake transport (no
// auth, no Supabase). Seeds KETA-2 with its rig configuration, bit depths
// and a pump log so Playwright can work the well, go offline, and reload.
// `?reset=1` clears the local database first; `?empty=1` skips the seed.

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Dexie from 'dexie';
import WellsiteWorkstation from './components/WellsiteWorkstation';
import { makeLocalBackend } from './services/localBackend';
import { makeFakeTransport } from './services/transports/fakeTransport';
import { seedWellsite, SEED_REGISTRY_WELLS, SEED_USER } from './services/seed';
import { openWellsiteDb } from '@/lib/wellsite/db';
import { DEV_APP_PATHS } from '@/components/wells/appLinks';

const HARNESS_DB = 'petrolord-wellsite-harness';

export default function WellsiteStudioHarness() {
  const [searchParams] = useSearchParams();
  const [ready, setReady] = useState(false);
  const backend = useMemo(() => {
    const transport = makeFakeTransport({ user: SEED_USER, registryWells: SEED_REGISTRY_WELLS, online: searchParams.get('offline') !== '1' });
    return makeLocalBackend({ transport, db: openWellsiteDb(HARNESS_DB) });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true;
    (async () => {
      if (searchParams.get('reset') === '1') { backend.db.close(); await Dexie.delete(HARNESS_DB); backend.db.open(); }
      if (searchParams.get('empty') !== '1') await seedWellsite(backend);
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, [backend, searchParams]);
  if (!ready) return <div className="p-4 text-xs text-slate-400">Seeding the harness well</div>;
  return (
    <div className="h-screen w-full overflow-hidden">
      <WellsiteWorkstation backend={backend} appPaths={DEV_APP_PATHS} />
    </div>
  );
}
