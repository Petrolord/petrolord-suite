import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import WellsiteWorkstation from './components/WellsiteWorkstation';
import { makeLocalBackend } from './services/localBackend';
import { makeSupabaseTransport } from './services/transports/supabaseTransport';
import { assertBackend } from './services/backendPort';

// Wellsite Studio (Geoscience G10, WS0): the geological command centre for
// a live well on a local-first record. This page mounts the workstation on
// the local database with the Supabase transport behind it.
export default function WellsiteStudio() {
  const backend = useMemo(() => assertBackend(makeLocalBackend({ transport: makeSupabaseTransport() })), []);
  return (
    <>
      <Helmet>
        <title>Wellsite Studio - Petrolord Suite</title>
        <meta name="description" content="The geological record of a live well: lag and samples, cuttings descriptions, shows, observations, photographs, formation tops with their evidence, the operational timeline, shift handovers and daily geological reports, on a record that works without a connection." />
      </Helmet>
      <div className="h-screen w-full overflow-hidden">
        <WellsiteWorkstation backend={backend} />
      </div>
    </>
  );
}
