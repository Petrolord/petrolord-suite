import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import StWorkstation from './StWorkstation';
import { makeWpBackend } from './services/wpBackend';

// Stimulation Designer (Drilling D9): PKN/KGD hydraulic frac design,
// Nolte pump schedule, Cinco-Ley productivity and matrix acidizing on
// the wp data spine, with closure stress and reservoir pressure from
// the published gm-1.0.0/pp-1.0.0 curves. Engines are oracle-gated in
// @petrolord/engines. StWorkstation owns all state.
export default function StimulationDesignerStudio() {
  const { user } = useAuth();
  const backend = useMemo(() => makeWpBackend({ userId: user?.id }), [user?.id]);
  return (
    <>
      <Helmet>
        <title>Stimulation Designer - Petrolord Suite</title>
        <meta
          name="description"
          content="Design hydraulic fracturing and matrix acidizing on your planned wellbores: PKN/KGD geometry, Nolte pump schedule, proppant selection, Cinco-Ley productivity, and Hawkins damage removal."
        />
      </Helmet>
      <div className="h-screen w-full overflow-hidden">
        <StWorkstation backend={backend} />
      </div>
    </>
  );
}
