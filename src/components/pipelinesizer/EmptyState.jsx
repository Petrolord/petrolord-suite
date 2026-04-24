import React from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

const EmptyState = ({ onAnalyze }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
      <div className="bg-slate-800 p-6 rounded-full">
        <Play className="w-12 h-12 text-lime-400" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Pipeline Sizer Ready</h2>
        <p className="text-slate-400 max-w-md mx-auto">
          Enter your pipeline parameters in the left panel to begin sizing and hydraulic analysis, or run a default sample analysis.
        </p>
      </div>
      <Button onClick={onAnalyze} className="bg-lime-500 hover:bg-lime-600 text-slate-900 font-bold">
        Run Sample Analysis
      </Button>
    </div>
  );
};

export default EmptyState;