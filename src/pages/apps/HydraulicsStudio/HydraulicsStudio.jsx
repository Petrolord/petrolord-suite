import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import HydWorkstation from './HydWorkstation';
import { makeWpBackend } from './services/wpBackend';

// Drilling Fluids & Hydraulics Studio (Drilling D2): mud rheology, RP 13D
// circulating losses, ECD, surge/swab and hole cleaning on the Well Design
// Studio data spine (definitive trajectories + the shared
// wp_wellbore_geometry hole/casing sections from D1). Engines are
// oracle-gated in @petrolord/engines; HydWorkstation owns all state.
export default function HydraulicsStudio() {
  const { user } = useAuth();
  const backend = useMemo(() => makeWpBackend({ userId: user?.id }), [user?.id]);
  return (
    <>
      <Helmet>
        <title>Drilling Fluids & Hydraulics Studio - Petrolord Suite</title>
        <meta
          name="description"
          content="Mud rheology, circulating pressure losses, ECD, surge and swab, and hole cleaning on your planned trajectories, validated against independent oracles."
        />
      </Helmet>
      <div className="h-screen w-full overflow-hidden">
        <HydWorkstation backend={backend} />
      </div>
    </>
  );
}
