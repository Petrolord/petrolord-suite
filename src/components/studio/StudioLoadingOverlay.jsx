// Studio shell busy overlay (generalized from DCALoadingStates.LoadingOverlay).
import React from 'react';
import { Loader2 } from 'lucide-react';
import { useDsTheme } from '@/design/themeContext';

// Theme roles inside an opted-in <ThemedApp> scope; legacy classes outside.
const StudioLoadingOverlay = ({ message = 'Processing...' }) => {
  const ds = useDsTheme();
  return (
    <div className={ds ? 'absolute inset-0 bg-pl-bg/60 backdrop-blur-sm z-50 flex items-center justify-center' : 'absolute inset-0 bg-slate-950/50 backdrop-blur-sm z-50 flex items-center justify-center'} {...(ds ? { role: 'status', 'aria-live': 'polite' } : {})}>
      <div className={ds ? 'bg-pl-raised border border-pl-border p-4 rounded-lg shadow-pl-lg flex flex-col items-center gap-3' : 'bg-slate-900 border border-slate-800 p-4 rounded-lg shadow-xl flex flex-col items-center gap-3'}>
        <Loader2 className={ds ? 'h-8 w-8 animate-spin text-pl-primary-text' : 'h-8 w-8 animate-spin text-blue-500'} />
        <span className={ds ? 'text-sm text-pl-text font-medium' : 'text-sm text-slate-300 font-medium'}>{message}</span>
      </div>
    </div>
  );
};

export default StudioLoadingOverlay;
