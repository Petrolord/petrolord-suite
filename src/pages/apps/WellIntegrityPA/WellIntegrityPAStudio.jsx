import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import WiWorkstation from './WiWorkstation';
import { makeWpBackend } from './services/wpBackend';

// Well Integrity & P&A Studio (Drilling D10): NORSOK D-010-style barrier
// envelope verification with the traffic-light category, annulus MAASP
// and API RP 90 MAWOP on the definitive trajectory, balanced cement plug
// placement and the phased abandonment program, on the wp data spine.
// Engines are oracle-gated in @petrolord/engines. WiWorkstation owns all
// state.
export default function WellIntegrityPAStudio() {
  const { user } = useAuth();
  const backend = useMemo(() => makeWpBackend({ userId: user?.id }), [user?.id]);
  return (
    <>
      <Helmet>
        <title>Well Integrity & P&A Studio - Petrolord Suite</title>
        <meta
          name="description"
          content="Verify well barrier envelopes, set annulus pressure limits (MAASP and MAWOP), design balanced cement plugs and build the abandonment program on your planned wellbores."
        />
      </Helmet>
      <div className="h-screen w-full overflow-hidden">
        <WiWorkstation backend={backend} />
      </div>
    </>
  );
}
