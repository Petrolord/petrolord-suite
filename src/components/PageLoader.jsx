import React from 'react';
import { Loader2 } from 'lucide-react';

const PageLoader = ({ message = "Loading..." }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white">
      <div className="flex flex-col items-center space-y-4">
        <Loader2 className="w-12 h-12 animate-spin text-lime-400" />
        <div className="text-lg font-medium text-slate-300">{message}</div>
        <div className="text-sm text-slate-500">Please wait while we load your application...</div>
      </div>
    </div>
  );
};

export default PageLoader;