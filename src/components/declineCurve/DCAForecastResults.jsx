import React from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, BarChart3 } from 'lucide-react';
import { exportForecastToCSV } from '@/utils/declineCurve/dcaExport';
import DCAEURDistribution from './DCAEURDistribution';

const DCAForecastResults = () => {
  const { selectedStream, streamState, currentWell } = useDeclineCurve();
  const results = streamState[selectedStream]?.forecastResults;
  const probabilisticResults = streamState[selectedStream]?.probabilisticResults;
  const config = streamState[selectedStream]?.forecastConfig;

  if (!results && !probabilisticResults) return (
    <div className="flex items-center justify-center h-full text-slate-500 text-sm p-4 bg-slate-900/50 rounded border border-dashed border-slate-800">
      No Forecast Generated
    </div>
  );

  const isProbabilistic = config?.probabilisticMode && probabilisticResults;
  const displayResults = isProbabilistic ? probabilisticResults : results;
  
  // Safely handle potentially undefined values
  const safeEur = displayResults?.eur || 0;
  const safeTimeToLimit = displayResults?.timeToLimit || 0;
  const safeData = displayResults?.data || [];

  const handleExport = () => {
    if (safeData.length > 0) {
      exportForecastToCSV(safeData, currentWell?.name || 'Well', selectedStream);
    }
  };

  const getUnits = () => {
    switch(selectedStream) {
      case 'gas': return 'Mcf';
      case 'water': return 'bbl';
      default: return 'bbl';
    }
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-slate-200">Forecast Results</h3>
          {isProbabilistic && (
            <Badge variant="outline" className="text-xs bg-purple-900/30 text-purple-400 border-purple-900">
              Probabilistic
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleExport} disabled={safeData.length === 0}>
          <Download size={12} /> Export CSV
        </Button>
      </div>

      {/* EUR Summary Cards */}
      {isProbabilistic ? (
        <div className="grid grid-cols-3 gap-2 shrink-0">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-3">
              <div className="text-[10px] text-slate-400 uppercase mb-1">P10 EUR (Optimistic)</div>
              <div className="text-sm font-bold text-green-400">
                {probabilisticResults.p10?.toLocaleString(undefined, {maximumFractionDigits:0}) || '0'}
              </div>
              <div className="text-[8px] text-slate-500">{getUnits()}</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-3">
              <div className="text-[10px] text-slate-400 uppercase mb-1">P50 EUR (Most Likely)</div>
              <div className="text-sm font-bold text-blue-400">
                {probabilisticResults.p50?.toLocaleString(undefined, {maximumFractionDigits:0}) || '0'}
              </div>
              <div className="text-[8px] text-slate-500">{getUnits()}</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-3">
              <div className="text-[10px] text-slate-400 uppercase mb-1">P90 EUR (Conservative)</div>
              <div className="text-sm font-bold text-red-400">
                {probabilisticResults.p90?.toLocaleString(undefined, {maximumFractionDigits:0}) || '0'}
              </div>
              <div className="text-[8px] text-slate-500">{getUnits()}</div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 shrink-0 mb-2">
          <div className="bg-slate-800 p-2 rounded border border-slate-700">
            <div className="text-[10px] text-slate-400 uppercase">Rem. Reserves</div>
            <div className="text-sm font-bold text-emerald-400">
              {typeof safeEur === 'number' ? safeEur.toLocaleString(undefined, {maximumFractionDigits:0}) : '0'}
            </div>
          </div>
          <div className="bg-slate-800 p-2 rounded border border-slate-700">
            <div className="text-[10px] text-slate-400 uppercase">Time to Limit</div>
            <div className="text-sm font-bold text-blue-400">
              {typeof safeTimeToLimit === 'number' ? (safeTimeToLimit/365).toFixed(1) : '0.0'} yrs
            </div>
          </div>
        </div>
      )}

      {/* EUR Distribution for Probabilistic */}
      {isProbabilistic && probabilisticResults.distribution && (
        <Card className="bg-slate-900 border-slate-800 shrink-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 size={14} className="text-purple-400" />
              EUR Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <DCAEURDistribution 
              distribution={probabilisticResults.distribution} 
              selectedStream={selectedStream}
            />
            <div className="text-[10px] text-slate-500 text-center mt-1">
              {probabilisticResults.iterations} Monte Carlo simulations
            </div>
          </CardContent>
        </Card>
      )}

      {/* Forecast Table */}
      <div className="flex-1 min-h-0 border border-slate-800 rounded-md bg-slate-900 overflow-hidden relative">
        {safeData.length > 0 ? (
          <div className="absolute inset-0 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-slate-800 z-10">
                <TableRow className="border-slate-700 hover:bg-slate-800">
                  <TableHead className="text-xs text-slate-400 h-8">Date</TableHead>
                  <TableHead className="text-xs text-slate-400 h-8 text-right">
                    {isProbabilistic ? 'P50 Rate' : 'Rate'}
                  </TableHead>
                  <TableHead className="text-xs text-slate-400 h-8 text-right">
                    {isProbabilistic ? 'P50 Cum' : 'Cum'}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {safeData.map((row, i) => i % 6 === 0 && row && ( // Show every 6th month approx to save rendering
                  <TableRow key={i} className="border-slate-800 hover:bg-slate-800/50 h-8">
                    <TableCell className="py-1 text-xs text-slate-300 font-mono">
                      {row.date ? new Date(row.date).toLocaleDateString() : 'N/A'}
                    </TableCell>
                    <TableCell className="py-1 text-xs text-right text-slate-300 font-mono">
                      {typeof row.rate === 'number' ? row.rate.toFixed(1) : '0.0'}
                    </TableCell>
                    <TableCell className="py-1 text-xs text-right text-slate-400 font-mono">
                      {typeof row.cum === 'number' ? row.cum.toLocaleString() : '0'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
            No forecast data available
          </div>
        )}
      </div>
    </div>
  );
};

export default DCAForecastResults;