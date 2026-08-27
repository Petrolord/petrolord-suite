import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import PsWorkstation from './PsWorkstation';
import { makeWpBackend } from './services/wpBackend';

// Perforation & Sand Control Designer (Drilling D8): Karakas-Tariq
// perforation productivity, gun clearance against the D7 completion and
// D6 casing program, Saucier gravel and screen selection, and sanding
// onset from the published gm-1.0.0/pp-1.0.0 curves. Engines are
// oracle-gated in @petrolord/engines. PsWorkstation owns all state.
export default function PerforationSandControlStudio() {
  const { user } = useAuth();
  const backend = useMemo(() => makeWpBackend({ userId: user?.id }), [user?.id]);
  return (
    <>
      <Helmet>
        <title>Perforation & Sand Control - Petrolord Suite</title>
        <meta
          name="description"
          content="Design perforating and sand control on your planned wellbores: Karakas-Tariq skin and productivity ratio, gun clearance, underbalance guidance, sieve statistics, Saucier gravel and screen selection, and sanding-onset screening."
        />
      </Helmet>
      <div className="h-screen w-full overflow-hidden">
        <PsWorkstation backend={backend} />
      </div>
    </>
  );
}
