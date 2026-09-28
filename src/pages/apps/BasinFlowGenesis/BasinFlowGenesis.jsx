import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { makeRegistryBackend } from './services/backend';
import { BasinFlowProvider, useBasinFlow } from './contexts/BasinFlowContext';
import { MultiWellProvider } from './contexts/MultiWellContext';
import { GuidedModeProvider } from './contexts/GuidedModeContext';
import ModeSelector from './components/ModeSelector';
import GuidedModeWizard from './components/GuidedModeWizard';
import ExpertModePanel from './components/ExpertModePanel';
import { ErrorBoundary } from 'react-error-boundary';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { ThemedApp } from '@/design/ThemeProvider';

const ErrorFallback = ({ error, resetErrorBoundary }) => {
  return (
    <div className="h-screen w-full flex items-center justify-center bg-pl-bg text-pl-text">
      <div className="bg-pl-surface p-8 rounded-lg border border-pl-danger/40 max-w-md text-center">
        <AlertTriangle className="w-12 h-12 text-pl-danger-text mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Application Error</h2>
        <p className="text-pl-muted mb-4 text-sm">
          Something went wrong in BasinFlow Genesis.
        </p>
        <div className="bg-pl-bg p-3 rounded mb-6 text-left overflow-auto max-h-32">
            <code className="text-xs text-pl-danger-text font-mono">{error.message}</code>
        </div>
        <Button onClick={resetErrorBoundary} variant="outline">
          Try Again
        </Button>
      </div>
    </div>
  );
};

export const BasinFlowApp = () => {
    const { state, dispatch } = useBasinFlow();

    const handleSelectMode = (mode) => {
        dispatch({ type: 'SET_MODE', payload: mode });
    };

    const handleGuidedComplete = () => {
        dispatch({ type: 'SET_MODE', payload: 'expert' });
    };

    // Listen for guided mode completion event
    React.useEffect(() => {
        const listener = () => handleGuidedComplete();
        window.addEventListener('GUIDED_MODE_COMPLETE', listener);
        return () => window.removeEventListener('GUIDED_MODE_COMPLETE', listener);
    }, []);

    return (
        <div className="h-screen w-full bg-pl-bg overflow-hidden flex flex-col">
            {!state.mode && <ModeSelector onSelectMode={handleSelectMode} />}
            
            {state.mode === 'guided' && (
                <GuidedModeProvider>
                    <GuidedModeWizard />
                </GuidedModeProvider>
            )}
            
            {state.mode === 'expert' && <ExpertModePanel />}
        </div>
    );
};

/** The whole app on a backend (BF0): the page mounts it on bf_wells,
 *  the /dev harness on the in-memory twin. Design system W4C: the shell
 *  carries the theme scope, so the page and the harness both open light
 *  with the header toggle for dark. */
export const BasinFlowShell = ({ backend, appPaths = {} }) => (
  <ThemedApp className="h-screen w-full" data-testid="bf-theme-scope">
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <MultiWellProvider backend={backend}>
        <BasinFlowProvider appPaths={appPaths}>
          <BasinFlowApp />
        </BasinFlowProvider>
      </MultiWellProvider>
    </ErrorBoundary>
  </ThemedApp>
);

const BasinFlowGenesis = () => {
  const backend = useMemo(() => makeRegistryBackend(), []);
  return (
    <>
      <Helmet>
        <title>Basin & Charge Modeling | Petrolord</title>
        <meta name="description" content="1D burial, thermal, maturity and charge modeling on oracle-validated engines." />
      </Helmet>
      <BasinFlowShell backend={backend} />
    </>
  );
};

export default BasinFlowGenesis;