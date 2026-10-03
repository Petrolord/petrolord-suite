import React from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, BarChart3 } from 'lucide-react';
import { exportForecastToCSV } from '@/utils/declineCurve/dcaExport';
import DCAEURDistribution from './DCAEURDistribution';
import { useDcaUnits } from '@/components/declineCurve/DcaUnits';
import { DCA_DAYS_PER_YEAR } from '@/utils/declineCurve/dcaUnits';
import { staleText } from '@/utils/declineCurve/dcaModel';

const DCAForecastResults = () => {
  const { selectedStream, streamState, currentWell, status } = useDeclineCurve();
  const u = useDcaUnits();
  const vol = (v) => u.volumeTo(selectedStream, v);
  const whole = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString() : 'n/a');
  const results = streamState[selectedStream]?.forecastResults;
  const config = streamState[selectedStream]?.forecastConfig;

  if (!results) return (
    <div className="flex items-center justify-center h-full text-pl-muted text-sm p-4 bg-pl-sunken rounded border border-dashed border-pl-border">
      No Forecast Generated
    </div>
  );

  // Monte Carlo results ride on forecastResults.probabilistic (runForecast
  // attaches them there); the deterministic curve is forecastResults.rates.
  const probabilisticResults = results.probabilistic;
  const isProbabilistic = !!(config?.probabilisticMode && probabilisticResults);

  // Safely handle potentially undefined values
  const safeEur = results.eur || 0;
  const safeTimeToLimit = results.timeToLimit || 0;
  const safeData = results.rates || [];

  const handleExport = () => {
    if (safeData.length > 0) {
      exportForecastToCSV(safeData, currentWell?.name || 'Well', selectedStream, { u, results, fit: streamState[selectedStream]?.fitResults, config });
    }
  };

  const getUnits = () => u.volumeLabel(selectedStream);
  const stale = status && status.forecast !== 'current' ? staleText(status, 'forecast') : null;

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-pl-text">Forecast Results</h3>
          {isProbabilistic && (
            <Badge variant="info" className="text-xs">
              Probabilistic
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleExport} disabled={safeData.length === 0}>
          <Download size={12} /> Export CSV
        </Button>
      </div>

      {stale && (
        <div className="rounded-md border border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text text-xs px-3 py-2 shrink-0" data-testid="dca-forecast-stale">{stale}</div>
      )}
      {/* EUR Summary Cards */}
      {isProbabilistic ? (
        <div className="grid grid-cols-3 gap-2 shrink-0">
          <Card>
            <CardContent className="p-3">
              <div className="text-[10px] text-pl-muted uppercase mb-1">P10 EUR (high case)</div>
              <div className="text-sm font-semibold text-pl-text font-pl-mono tabular-nums">
                {whole(vol(probabilisticResults.p10))}
              </div>
              <div className="text-[10px] text-pl-muted">{getUnits()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-[10px] text-pl-muted uppercase mb-1">P50 EUR (median)</div>
              <div className="text-sm font-semibold text-pl-text font-pl-mono tabular-nums" data-testid="dca-p50">
                {whole(vol(probabilisticResults.p50))}
              </div>
              <div className="text-[10px] text-pl-muted">{getUnits()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-[10px] text-pl-muted uppercase mb-1">P90 EUR (low case)</div>
              <div className="text-sm font-semibold text-pl-text font-pl-mono tabular-nums">
                {whole(vol(probabilisticResults.p90))}
              </div>
              <div className="text-[10px] text-pl-muted">{getUnits()}</div>
            </CardContent>
          </Card>
          <p className="col-span-3 text-[10px] text-pl-muted">Percentiles as exceedance: P90 is the low case (a 90% chance of at least this volume), P10 the high case. EUR from first production to the same end date as the fit's forecast.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 shrink-0 mb-2" data-testid="dca-forecast-summary">
          <div className="bg-pl-surface p-2 rounded border border-pl-border shadow-pl-sm">
            <div className="text-[10px] text-pl-muted uppercase">Rem. Reserves</div>
            <div className="text-sm font-semibold text-pl-text font-pl-mono tabular-nums" data-testid="dca-remaining">
              {whole(vol(safeEur))}
            </div>
            <div className="text-[9px] text-pl-muted">{getUnits()} after the last data, {results.historyEndDate ? String(results.historyEndDate).slice(0, 10) : 'n/a'}</div>
          </div>
          <div className="bg-pl-surface p-2 rounded border border-pl-border shadow-pl-sm">
            <div className="text-[10px] text-pl-muted uppercase">EUR</div>
            <div className="text-sm font-semibold text-pl-text font-pl-mono tabular-nums" data-testid="dca-eur-total">
              {whole(vol(results.eurTotal))}
            </div>
            <div className="text-[9px] text-pl-muted">{Number.isFinite(results.produced) ? `${getUnits()}: ${whole(vol(results.produced))} produced + remaining` : ''}</div>
          </div>
          <div className="bg-pl-surface p-2 rounded border border-pl-border shadow-pl-sm">
            <div className="text-[10px] text-pl-muted uppercase">{results.limitReached ? 'Time to Limit' : 'Forecast span'}</div>
            <div className="text-sm font-semibold text-pl-text font-pl-mono tabular-nums" data-testid="dca-time-to-limit">
              {typeof safeTimeToLimit === 'number' ? (safeTimeToLimit / DCA_DAYS_PER_YEAR).toFixed(1) : 'n/a'} yrs
            </div>
            <div className="text-[9px] text-pl-muted">{results.limitReached ? 'to the economic limit' : 'limit not reached in the horizon'}</div>
          </div>
        </div>
      )}

      {/* EUR Distribution for Probabilistic */}
      {isProbabilistic && probabilisticResults.distribution && (
        <Card className="shrink-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 size={14} className="text-pl-muted" aria-hidden="true" />
              EUR Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <DCAEURDistribution 
              distribution={probabilisticResults.distribution} 
              selectedStream={selectedStream}
            />
            <div className="text-[10px] text-pl-muted text-center mt-1">
              {probabilisticResults.iterations} Monte Carlo simulations
              {/* Quote the seed with the numbers: it is what lets a reviewer
                  re-run this exact realization. Older saved forecasts predate
                  the seed and carry none. */}
              {probabilisticResults.seed != null
                ? `, seed ${probabilisticResults.seed}`
                : ', seed not recorded'}
              {Number.isFinite(probabilisticResults.economicLimitUncertainty)
                ? `, limit ±${Math.round(100 * probabilisticResults.economicLimitUncertainty)}%`
                : ''}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Forecast Table */}
      <div className="flex-1 min-h-0 border border-pl-border rounded-md bg-pl-surface overflow-hidden relative">
        {safeData.length > 0 ? (
          <div className="absolute inset-0 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow>
                  <TableHead className="text-xs h-8">Date</TableHead>
                  <TableHead className="text-xs h-8 text-right">
                    Rate ({u.rateLabel(selectedStream)})
                  </TableHead>
                  <TableHead className="text-xs h-8 text-right">
                    Cum after the last data ({getUnits()})
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {safeData.map((row, i) => i % 30 === 0 && row && ( // one row a month (the forecast is daily)
                  <TableRow key={i} className="h-8">
                    <TableCell className="py-1 text-xs font-pl-mono tabular-nums">
                      {row.date ? String(row.date).slice(0, 10) : 'n/a'}
                    </TableCell>
                    <TableCell className="py-1 text-xs text-right font-pl-mono tabular-nums">
                      {typeof row.rate === 'number' ? u.rateTo(selectedStream, row.rate).toFixed(1) : 'n/a'}
                    </TableCell>
                    <TableCell className="py-1 text-xs text-right text-pl-muted font-pl-mono tabular-nums">
                      {typeof row.cumulative === 'number' ? whole(vol(row.cumulative)) : 'n/a'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-pl-muted text-sm">
            No forecast data available
          </div>
        )}
      </div>
    </div>
  );
};

export default DCAForecastResults;