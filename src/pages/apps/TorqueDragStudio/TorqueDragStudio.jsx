import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import TDWorkstation from './TDWorkstation';
import { makeWpBackend } from './services/wpBackend';

// Torque & Drag Studio (Drilling D1): soft-string torque & drag, drillstring
// loads, buckling flags and casing wear on the Well Design Studio data spine
// (wp_* tables + definitive-design trajectories). Engines are oracle-gated
// in @petrolord/engines; TDWorkstation owns all state and this page only
// mounts it on the registry backend.
export default function TorqueDragStudio() {
  const { user } = useAuth();
  const backend = useMemo(() => makeWpBackend({ userId: user?.id }), [user?.id]);
  return (
    <>
      <Helmet>
        <title>Torque & Drag Studio - Petrolord Suite</title>
        <meta
          name="description"
          content="Soft-string torque and drag on your planned trajectories: hookloads, surface torque, side forces, buckling limits, friction sensitivity and casing wear, validated against independent oracles."
        />
      </Helmet>
      <div className="h-screen w-full overflow-hidden">
        <TDWorkstation backend={backend} />
      </div>
    </>
  );
}
