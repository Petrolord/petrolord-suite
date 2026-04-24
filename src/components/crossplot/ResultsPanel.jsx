
import React from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

const ResultsPanel = ({ results, onDownload, loading }) => {
  const { plot_data, layout, point_count, applied_filters } = results;

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-400">
          <p>Points Plotted: <span className="font-bold text-lime-300">{point_count}</span></p>
          <p>Filters: <span className="font-mono text-gray-300">{applied_filters}</span></p>
        </div>
        <Button onClick={onDownload} disabled={loading} variant="outline" className="border-lime-400 text-lime-400 hover:bg-lime-400/10">
          <Download className="w-4 h-4 mr-2" />
          Download Filtered CSV
        </Button>
      </div>
      <div className="flex-grow bg-gray-800/50 rounded-lg p-2 flex items-center justify-center text-slate-400">
        Chart removed
      </div>
    </div>
  );
};

export default ResultsPanel;
