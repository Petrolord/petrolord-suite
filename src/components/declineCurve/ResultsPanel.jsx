import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText, Table } from 'lucide-react';
import { exportToPDF, exportDataAsCSV } from '@/utils/exportUtils';

const ResultsPanel = ({ data, results, wellName }) => {
  const handleExportPdf = () => {
    if (!data) return;
    exportToPDF(`DCA_Results_${wellName || 'well'}`, data, `DCA_Results_${wellName || 'well'}`);
  };

  const handleExportCsv = () => {
    if (!data) return;
    exportDataAsCSV(data, `DCA_Data_${wellName || 'well'}`);
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold text-white">Analysis Results</CardTitle>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleExportCsv} className="text-slate-400 hover:text-white">
            <Table className="w-4 h-4 mr-2" /> CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExportPdf} className="text-slate-400 hover:text-white">
            <FileText className="w-4 h-4 mr-2" /> PDF
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {results ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-slate-950 rounded border border-slate-800">
                <p className="text-xs text-slate-500 uppercase">Initial Rate (qi)</p>
                <p className="text-xl font-bold text-cyan-400">{results.qi?.toFixed(2)} bbl/d</p>
              </div>
              <div className="p-3 bg-slate-950 rounded border border-slate-800">
                <p className="text-xs text-slate-500 uppercase">Decline Rate (di)</p>
                <p className="text-xl font-bold text-cyan-400">{(results.di * 100)?.toFixed(2)}%</p>
              </div>
            </div>
            <div className="p-3 bg-slate-950 rounded border border-slate-800 text-center">
              <p className="text-xs text-slate-500 uppercase">Estimated EUR</p>
              <p className="text-2xl font-bold text-lime-400">{results.eur?.toLocaleString()} bbl</p>
            </div>
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center text-slate-500 italic">
            Run analysis to view results
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ResultsPanel;