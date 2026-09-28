import React from 'react';
import { FDPProvider, useFDP } from '@/contexts/FDPContext';
import MainLayout from '@/components/fdp/layout/MainLayout';
import { Helmet } from 'react-helmet';
import { FullPrecisionProvider } from '@/components/fullprecision/FullPrecision';
import ExpertMode from '@/components/fdp/modes/ExpertMode';
import GuidedMode from '@/components/fdp/modes/GuidedMode';
import { ThemedApp } from '@/design/ThemeProvider';

const ContentRouter = () => {
    const { state } = useFDP();
    const { mode } = state.meta;
    
    // Switch based on current mode (Expert vs Guided)
    if (mode === 'guided') {
        return <GuidedMode />;
    } else {
        return <ExpertMode />;
    }
};

// Design system rollout batch 6A: the app wraps itself in <ThemedApp>, so the
// whole app (and its dev harness) opens light with the per-user dark choice.
const FDPAccelerator = () => {
    return (
      <ThemedApp data-testid="fdp-theme-scope">
        <FDPProvider>
          {/* W3 (D3): the Full precision switch prints well costs to the USD
              and the facility estimate in $MM at 4 decimals. */}
          <FullPrecisionProvider>
            <Helmet>
                <title>FDP Accelerator - Petrolord</title>
                <meta name="theme-color" content="#0f172a" />
            </Helmet>
            <MainLayout>
                <ContentRouter />
            </MainLayout>
          </FullPrecisionProvider>
        </FDPProvider>
      </ThemedApp>
    );
};

export default FDPAccelerator;