import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import CdWorkstation from './CdWorkstation';
import { makeWpBackend } from './services/wpBackend';

// Completion Design Studio (Drilling D7): completion string architecture on
// the wp data spine. Absorbs the Production Well Schematic Designer and the
// CTDP completion markers; drift/clearance/volume engines are oracle-gated
// in @petrolord/engines, tubing sizing runs the Production nodal VLP
// engine. CdWorkstation owns all state.
export default function CompletionDesignStudio() {
  const { user } = useAuth();
  const backend = useMemo(() => makeWpBackend({ userId: user?.id }), [user?.id]);
  // Design system rollout batch 3C: the studio opens light and follows the
  // user's theme choice from the ribbon toggle. The route element in App.jsx
  // is unchanged.
  return (
    <div data-testid="cd-theme-scope">
      <Helmet>
        <title>Completion Design Studio - Petrolord Suite</title>
        <meta
          name="description"
          content="Design completion strings on your planned wellbores: catalog components with API 5CT drift and clearance checks, through-bore access, volumes, seal space-out, schematic, bill of materials, and nodal tubing sizing."
        />
      </Helmet>
      <div className="h-screen w-full overflow-hidden">
        <CdWorkstation backend={backend} />
      </div>
    </div>
  );
}
