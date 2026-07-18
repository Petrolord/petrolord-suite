// Report tab (MB6). PDF report on the WT5/WT10 jsPDF pattern
// (src/utils/mbalReportExport.js) plus a CSV of the latest run's
// per-timestep series. Replaces the pre-Horizons ReportsExport shell.
import React, { useEffect, useState } from 'react';
import { FileDown, FileSpreadsheet, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useMaterialBalanceStudio } from '@/contexts/MaterialBalanceStudioContext';
import { getCaseDefaultConfig } from '@/pages/apps/reservoir-balance/lib/api';
import { exportMbalPdf, buildPlotDataCsv } from '@/utils/mbalReportExport';

const ReportTab = () => {
  const { caseId, caseData, lastResult } = useMaterialBalanceStudio();
  const { toast } = useToast();
  const [defaultCfg, setDefaultCfg] = useState(null);
  useEffect(() => {
    let alive = true;
    getCaseDefaultConfig(caseId).then(({ data }) => {
      if (alive) setDefaultCfg(data ?? null);
    });
    return () => { alive = false; };
  }, [caseId]);

  const hasResult = Boolean(lastResult);
  const hm = lastResult?.plot_data?.history_match ?? null;

  const onPdf = () => {
    try {
      exportMbalPdf({ caseData, lastResult, defaultCfg });
      toast({ title: 'Report exported', description: 'The PDF has been downloaded.' });
    } catch (err) {
      toast({ title: 'Export failed', description: err.message, variant: 'destructive' });
    }
  };

  const onCsv = () => {
    const csv = buildPlotDataCsv(lastResult);
    if (!csv) {
      toast({ title: 'No data', description: 'Run the engine first.', variant: 'destructive' });
      return;
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mbal-series-${(caseData?.name ?? 'case').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Report</CardTitle>
          <CardDescription>
            A PDF of the latest run: case summary, headline volumes with the validation tier and its benchmark
            reference, drive indices, the pressure history{hm ? ', the history match with confidence intervals' : ''} and
            the engine warnings. The CSV carries every per-timestep series of the run for spreadsheet work.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasResult ? (
            <p className="text-sm text-slate-400 flex items-center gap-2">
              <Info className="h-4 w-4" />
              Run the engine on the Run tab first. The report always describes a computed result, never stored numbers.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={onPdf}>
                <FileDown className="mr-2 h-4 w-4" /> Export PDF report
              </Button>
              <Button variant="outline" onClick={onCsv}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Export series CSV
              </Button>
              <p className="text-[11px] text-slate-500">
                Latest run: {(lastResult.drive_mechanism ?? '').replace(/_/g, ' ')}
                {hm ? ' with pressure history match' : ''}.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportTab;
