import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Globe, Zap, Gauge, Activity, Download, FileSpreadsheet, FileText, Image } from 'lucide-react';
import { useWellCorrelation, useMarkers, useHorizons, useWellManager } from '@/hooks/useWellCorrelation';
import { formatForEarthModelPro, INTEGRATION_TARGETS, exportToApp } from '@/services/wellCorrelation/integrationService';
import { generateCSV } from '@/services/wellCorrelation/reportGenerator';

const ExportLinksTab = () => {
  const { horizons } = useHorizons();
  const { markers } = useMarkers();
  const { wells } = useWellManager();

  const handleAppExport = (targetApp) => {
    let data;
    if (targetApp === INTEGRATION_TARGETS.EARTHMODEL_PRO) {
      data = formatForEarthModelPro(horizons, markers, wells);
    } else {
      // Generic fallback
      data = { source: 'WCT', markers: markers.length };
    }
    exportToApp(targetApp, data).then(res => alert(res.message)); // Simple alert for demo
  };

  const handleFileExport = (format) => {
    if (format === 'CSV') {
      const csv = generateCSV(wells, horizons, markers);
      // Trigger download logic
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'well_correlation_tops.csv';
      a.click();
    } else {
      alert(`Export to ${format} coming soon.`);
    }
  };

  const apps = [
    { name: INTEGRATION_TARGETS.EARTHMODEL_PRO, icon: Globe, color: 'text-emerald-400', desc: 'Export horizons as surfaces/points.' },
    { name: INTEGRATION_TARGETS.PPFG, icon: Gauge, color: 'text-blue-400', desc: 'Share formation tops for pressure prediction.' },
    { name: INTEGRATION_TARGETS.GEOMECHANICS, icon: Activity, color: 'text-rose-400', desc: 'Export data for 1D MEM.' },
  ];

  return (
    <div className="h-full bg-slate-950 flex flex-col p-6 overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
        
        {/* Integration Links */}
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
            <Share2 className="w-5 h-5" /> Module Integrations
          </h3>
          <ScrollArea className="flex-1">
            <div className="grid gap-4">
              {apps.map(app => (
                <Card key={app.name} className="bg-slate-900 border-slate-800 p-4 flex items-center justify-between hover:border-slate-700 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg bg-slate-950 border border-slate-800 ${app.color}`}>
                      <app.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-200">{app.name}</h4>
                      <p className="text-xs text-slate-500">{app.desc}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="border-slate-700 text-slate-300 hover:text-white" onClick={() => handleAppExport(app.name)}>
                    Sync Data
                  </Button>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* File Exports */}
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
            <Download className="w-5 h-5" /> Report & Data Export
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <Button 
              variant="outline" 
              className="h-24 flex flex-col gap-2 border-slate-800 bg-slate-900 hover:bg-slate-800 hover:border-blue-500/50 group"
              onClick={() => handleFileExport('CSV')}
            >
              <FileSpreadsheet className="w-8 h-8 text-green-500 group-hover:scale-110 transition-transform" />
              <span className="text-slate-300">Export Tops (CSV)</span>
            </Button>
            <Button 
              variant="outline" 
              className="h-24 flex flex-col gap-2 border-slate-800 bg-slate-900 hover:bg-slate-800 hover:border-blue-500/50 group"
              onClick={() => handleFileExport('PDF')}
            >
              <FileText className="w-8 h-8 text-red-500 group-hover:scale-110 transition-transform" />
              <span className="text-slate-300">Summary Report (PDF)</span>
            </Button>
            <Button 
              variant="outline" 
              className="h-24 flex flex-col gap-2 border-slate-800 bg-slate-900 hover:bg-slate-800 hover:border-blue-500/50 group"
              onClick={() => handleFileExport('PNG')}
            >
              <Image className="w-8 h-8 text-blue-500 group-hover:scale-110 transition-transform" />
              <span className="text-slate-300">Panel Snapshot (PNG)</span>
            </Button>
            <Button 
              variant="outline" 
              className="h-24 flex flex-col gap-2 border-slate-800 bg-slate-900 hover:bg-slate-800 hover:border-blue-500/50 group"
              onClick={() => handleFileExport('XLSX')}
            >
              <FileSpreadsheet className="w-8 h-8 text-emerald-600 group-hover:scale-110 transition-transform" />
              <span className="text-slate-300">Full Statistics (Excel)</span>
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
};

// Helper component for missing icon import
function Share2(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
      <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
    </svg>
  )
}

export default ExportLinksTab;