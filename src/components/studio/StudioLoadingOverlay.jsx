// Studio shell busy overlay (generalized from DCALoadingStates.LoadingOverlay).
import React from 'react';
import { Loader2 } from 'lucide-react';
import { useStudioTheme } from './studioTheme';

// Design system: theme roles inside a <ThemedApp> scope, legacy classes outside.
const StudioLoadingOverlay = ({ message = 'Processing...' }) => {
  const { tc } = useStudioTheme();
  return (
    <div className={tc('absolute inset-0 bg-slate-950/50 backdrop-blur-sm z-50 flex items-center justify-center', 'absolute inset-0 bg-pl-bg/60 backdrop-blur-sm z-50 flex items-center justify-center')} role={tc(undefined, 'status')}>
      <div className={tc('bg-slate-900 border border-slate-800 p-4 rounded-lg shadow-xl flex flex-col items-center gap-3', 'bg-pl-raised border border-pl-border p-4 rounded-lg shadow-pl-lg flex flex-col items-center gap-3')}>
        <Loader2 className={tc('h-8 w-8 animate-spin text-blue-500', 'h-8 w-8 animate-spin text-pl-primary-text')} />
        <span className={tc('text-sm text-slate-300 font-medium', 'text-sm text-pl-text font-medium')}>{message}</span>
      </div>
    </div>
  );
};

export default StudioLoadingOverlay;
