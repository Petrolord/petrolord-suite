import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import WCWorkstation from './WCWorkstation';
import { makeWpBackend } from './services/wpBackend';

// Well Control Studio (Drilling D3): well volumes and strokes, kill sheets
// (wait-and-weight and driller's method), MAASP and kick tolerance on the
// Well Design Studio data spine. Engines are oracle-gated in
// @petrolord/engines; WCWorkstation owns all state.
export default function WellControlStudio() {
  const { user } = useAuth();
  const backend = useMemo(() => makeWpBackend({ userId: user?.id }), [user?.id]);
  return (
    <>
      <Helmet>
        <title>Well Control Studio - Petrolord Suite</title>
        <meta
          name="description"
          content="Kill sheets, kick tolerance and MAASP on your planned wells: volumes and strokes, wait-and-weight and driller's method schedules, validated against independent oracles."
        />
      </Helmet>
      <div className="h-screen w-full overflow-hidden">
        <WCWorkstation backend={backend} />
      </div>
    </>
  );
}
