// Studio shell busy overlay (generalized from DCALoadingStates.LoadingOverlay).
import React from 'react';
import { Loader2 } from 'lucide-react';

const StudioLoadingOverlay = ({ message = 'Processing...' }) => (
  <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm z-50 flex items-center justify-center">
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg shadow-xl flex flex-col items-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      <span className="text-sm text-slate-300 font-medium">{message}</span>
    </div>
  </div>
);

export default StudioLoadingOverlay;
