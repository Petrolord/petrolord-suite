
import React from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

const ResultsPanel = ({ results }) => {
  const { inputs, logPlot } = results;

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">{inputs.wellName} - Digitized Log</h1>
        <Button variant="outline" className="border-lime-400 text-lime-400 hover:bg-lime-400/10">
          <Download className="w-4 h-4 mr-2" />
          Export LAS File
        </Button>
      </div>
      
      <div className="flex-grow bg-white rounded-lg p-2 flex items-center justify-center text-slate-500">
         Chart removed
      </div>
    </div>
  );
};

export default ResultsPanel;
