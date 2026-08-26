import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import GmWorkstation from './GmWorkstation';
import { makeWpBackend } from './services/wpBackend';

// Geomechanics & Wellbore Stability Studio (Drilling D5): the 1D MEM
// rebuilt under Drilling on the shared wells registry (the owner-locked
// 2026-07-12 decision) with full-tensor Kirsch stability along planned
// trajectories. Engines are oracle-gated in @petrolord/engines;
// GmWorkstation owns all state.
export default function GeomechanicsStudio() {
  const { user } = useAuth();
  const backend = useMemo(() => makeWpBackend({ userId: user?.id }), [user?.id]);
  return (
    <>
      <Helmet>
        <title>Geomechanics & Wellbore Stability Studio - Petrolord Suite</title>
        <meta
          name="description"
          content="1D mechanical earth models from registry logs and published pore pressure, with wellbore stability and mud weight windows along your planned trajectories, validated against independent oracles."
        />
      </Helmet>
      <div className="h-screen w-full overflow-hidden">
        <GmWorkstation backend={backend} />
      </div>
    </>
  );
}
