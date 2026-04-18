
import React, { useState } from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Button } from '@/components/ui/button';
import { exportChartAsImage } from '@/utils/declineCurve/dcaExport';
import { Camera } from 'lucide-react';

const DCABasePlots = () => {
  const [logScale, setLogScale] = useState(true);

  return (
    <div id="dca-main-plot" className="h-full flex flex-col bg-slate-900 rounded-lg border border-slate-800 overflow-hidden shadow-inner">
        <div className="p-2 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
            <div className="flex gap-2">
              <Button 
                  variant="ghost" 
                  size="sm" 
                  className={`text-xs h-7 ${logScale ? 'bg-blue-900/30 text-blue-400 border border-blue-900' : 'text-slate-400'}`}
                  onClick={() => setLogScale(!logScale)}
              >
                  {logScale ? 'Log Scale' : 'Linear Scale'}
              </Button>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => exportChartAsImage('dca-main-plot', 'dca_plot')}>
                <Camera size={14} className="text-slate-400" />
            </Button>
        </div>
        <div className="flex-1 relative min-h-[400px] w-full flex items-center justify-center text-slate-600">
            Chart removed
        </div>
    </div>
  );
};

export default DCABasePlots;
