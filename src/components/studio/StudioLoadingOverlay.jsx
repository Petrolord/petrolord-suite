// Studio shell busy overlay (generalized from DCALoadingStates.LoadingOverlay).
import React from 'react';
import { Loader2 } from 'lucide-react';

// Design system: theme roles inside a <ThemedApp> scope, legacy classes outside.
const StudioLoadingOverlay = ({ message = 'Processing...' }) => {
  return (
    <div className="absolute inset-0 bg-pl-bg/60 backdrop-blur-sm z-50 flex items-center justify-center" role="status">
      <div className="bg-pl-raised border border-pl-border p-4 rounded-lg shadow-pl-lg flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-pl-primary-text" />
        <span className="text-sm text-pl-text font-medium">{message}</span>
      </div>
    </div>
  );
};

export default StudioLoadingOverlay;
