// Dev-only harness route (/dev/wellsite-studio, DEV builds only): the FULL
// Wellsite Studio on the real local database with the fake transport (no
// auth, no Supabase). Seeds KETA-2 with its rig configuration, bit depths
// and a pump log so Playwright can work the well, go offline, and reload.
// `?reset=1` clears the local database first; `?empty=1` skips the seed;
// `?conflict=1` adds a competing office version of the Agbada call; `?offline=1`
// starts the fake transport offline (the sync engine then waits, exactly as it
// does when the rig loses its link); `?plant=1` puts an office observation on
// the fake server so the next pull brings it in.

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Dexie from 'dexie';
import WellsiteWorkstation from './components/WellsiteWorkstation';
import { makeLocalBackend } from './services/localBackend';
import { makeFakeTransport } from './services/transports/fakeTransport';
import { seedWellsite, seedCompetingTop, SEED_REGISTRY_WELLS, SEED_USER } from './services/seed';
import { openWellsiteDb } from '@/lib/wellsite/db';
import { DEV_APP_PATHS } from '@/components/wells/appLinks';

const HARNESS_DB = 'petrolord-wellsite-harness';

export default function WellsiteStudioHarness() {
  const [searchParams] = useSearchParams();
  const [ready, setReady] = useState(false);
  const backend = useMemo(() => {
    const transport = makeFakeTransport({ user: SEED_USER, registryWells: SEED_REGISTRY_WELLS, online: true });
    return makeLocalBackend({ transport, db: openWellsiteDb(HARNESS_DB) });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true;
    (async () => {
      if (searchParams.get('reset') === '1') { backend.db.close(); await Dexie.delete(HARNESS_DB); backend.db.open(); }
      if (searchParams.get('empty') !== '1') {
        const well = await seedWellsite(backend);
        backend.__wellId = well.id;
        if (searchParams.get('conflict') === '1') await seedCompetingTop(backend, well);
        if (searchParams.get('offline') === '1') backend.transport.setOnline(false); // the link drops after the well was set up
        if (searchParams.get('plant') === '1') backend.transport.plant('ws_records', { id: 'office-note-1', well_id: well.id, kind: 'observation', subtype: 'note', chain_id: 'office-note-1', version_no: 1, occurred_at: new Date().toISOString(), local_offset_min: 0, payload: { text: 'Office note: LWD shows a GR drop at 10,150 ft', source: 'external' }, evidence_ids: [], created_by: 'user-office', client_created_at: new Date().toISOString(), schema_version: 1 });
      }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, [backend, searchParams]);
  if (typeof window !== 'undefined') window.__wsBackend = backend; // Playwright reaches the fake transport through this
  if (!ready) return <div className="p-4 text-xs text-slate-400">Seeding the harness well</div>;
  return (
    <div className="h-screen w-full overflow-hidden">
      <WellsiteWorkstation backend={backend} appPaths={DEV_APP_PATHS} />
    </div>
  );
}
