import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import WctWorkstation from './WctWorkstation';
import { makeWpBackend } from './services/wpBackend';

// Well Cost & Time Estimator (Drilling D11): activity-based time-depth
// scheduling, AFE-grade cost rollup and the seeded Monte Carlo risk
// model (canonical suite sampler) on the wp data spine. Engines are
// oracle-gated in @petrolord/engines. WctWorkstation owns all state.
export default function WellCostTimeStudio() {
  const { user } = useAuth();
  const backend = useMemo(() => makeWpBackend({ userId: user?.id }), [user?.id]);
  return (
    <>
      <Helmet>
        <title>Well Cost & Time Estimator - Petrolord Suite</title>
        <meta
          name="description"
          content="Build the drilling time-depth schedule, roll up an AFE-grade cost estimate and run the probabilistic P10/P50/P90 on your planned wellbores."
        />
      </Helmet>
      <div className="h-screen w-full overflow-hidden">
        <WctWorkstation backend={backend} />
      </div>
    </>
  );
}
