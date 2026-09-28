import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import CmtWorkstation from './CmtWorkstation';
import { ThemedApp } from '@/design/ThemeProvider';
import { makeWpBackend } from './services/wpBackend';

// Cementing Studio (Drilling D4): job volumes, plug-flow placement with
// U-tube/free-fall and ECD, API 10D centralization and an honest quality
// checklist on the Well Design Studio data spine. Engines are oracle-gated
// in @petrolord/engines; CmtWorkstation owns all state.
export default function CementingStudio() {
  const { user } = useAuth();
  const backend = useMemo(() => makeWpBackend({ userId: user?.id }), [user?.id]);
  return (
    <>
      <Helmet>
        <title>Cementing Studio - Petrolord Suite</title>
        <meta
          name="description"
          content="Primary cement job design on your planned wells: volumes and sacks, plug-flow placement with U-tube and ECD, API 10D centralization, validated against independent oracles."
        />
      </Helmet>
      <ThemedApp className="h-screen w-full overflow-hidden" data-testid="cmt-theme-scope">
        <CmtWorkstation backend={backend} />
      </ThemedApp>
    </>
  );
}
