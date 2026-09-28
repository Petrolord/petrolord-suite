import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useFullPrecision } from '@/components/fullprecision/FullPrecision';
import { formatFull } from '@/lib/fullPrecision';
import { ArrowUpRight, ArrowDownRight, Activity, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';

const SnapshotCard = ({ project, latestUpdate, kpis, riskCount }) => {
  const { full } = useFullPrecision();
  if (!project) return null;

  const statusColor = {
    'Green': 'text-pl-success-text border-pl-success/40 bg-pl-success-bg',
    'Amber': 'text-pl-warning-text border-pl-warning/40 bg-pl-warning-bg',
    'Red': 'text-pl-danger-text border-pl-danger/40 bg-pl-danger-bg',
  };

  const currentStatus = latestUpdate?.status || 'Green'; // Default to Green if no updates

  /**
   * EC6-0. Earned value came back from the engine as toFixed(2) STRINGS and
   * this card read them with `|| 1` fallbacks, so "0.00" became 0 and a
   * project with no task costs at all was reported as "NaN% Complete" and
   * "Behind Schedule". Earned value itself always printed $0, because the
   * card read `kpis.ev`, a key the engine never returned. The engine now
   * returns numbers, and null wherever an index has no denominator, so the
   * card can say "no cost data" instead of inventing a verdict.
   */
  const numberOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const evmPercent = numberOrNull(kpis?.percentComplete);
  const reported = latestUpdate?.percent_complete;
  const percentComplete = (reported === null || reported === undefined)
    ? evmPercent
    : parseFloat(reported);
  const spi = numberOrNull(kpis?.spi);
  const completionRatio = numberOrNull(kpis?.completionRatio);
  const cpi = numberOrNull(kpis?.cpi);
  const ev = numberOrNull(kpis?.ev);
  const sv = numberOrNull(kpis?.sv);
  const money = (v) => (v === null ? 'No cost data' : `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
  const trendIcon = spi === null
    ? <Activity className="w-4 h-4 text-pl-muted" />
    : (spi >= 1 ? <ArrowUpRight className="w-4 h-4 text-pl-success-text" /> : <ArrowDownRight className="w-4 h-4 text-pl-danger-text" />);
  // EC6-1: SPI is time-phased now, so it really does say early or late. When
  // it cannot be computed the card says which of the two reasons applies
  // rather than inventing a verdict.
  const trendText = spi === null
    ? (kpis?.costed ? 'No planned dates' : 'No cost-loaded tasks')
    : (spi >= 1 ? 'Ahead/On Schedule' : 'Behind Schedule');

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 divide-y md:divide-y-0 md:divide-x divide-pl-border">
          
          {/* Overall Status */}
          <div className="flex flex-col justify-between pr-4">
            <div className="flex justify-between items-start mb-2">
              <span className="text-pl-muted text-xs font-semibold uppercase tracking-wider">Project Health</span>
              <Badge variant="outline" className={`${statusColor[currentStatus]} capitalize`}>
                {currentStatus}
              </Badge>
            </div>
            <div className="mt-1">
               <div className="flex items-baseline gap-2">
                  <span className={`font-bold text-pl-text ${percentComplete === null || Number.isNaN(percentComplete) ? 'text-xl' : 'text-3xl font-pl-mono tabular-nums'}`}>
                    {percentComplete === null || Number.isNaN(percentComplete) ? 'Not measured' : `${Math.round(percentComplete)}%`}
                  </span>
                  <span className="text-sm text-pl-muted">
                    {percentComplete === null || Number.isNaN(percentComplete) ? '' : 'Complete'}
                  </span>
               </div>
               <div className="w-full bg-pl-sunken h-1.5 mt-2 rounded-full overflow-hidden">
                  <div className="h-full bg-pl-primary" style={{ width: `${Math.min(percentComplete || 0, 100)}%` }} />
               </div>
            </div>
          </div>

          {/* Schedule Performance */}
          <div className="flex flex-col justify-between px-4">
             <div className="flex justify-between items-start mb-2">
              <span className="text-pl-muted text-xs font-semibold uppercase tracking-wider">Schedule</span>
              <Activity className="w-4 h-4 text-pl-muted" />
            </div>
            <div>
                <div className="flex items-center gap-2 mb-1">
                    {trendIcon}
                    <span className={`text-lg font-semibold ${spi === null ? 'text-pl-muted' : (spi >= 1 ? 'text-pl-success-text' : 'text-pl-danger-text')}`}>{trendText}</span>
                </div>
                <p className="text-xs text-pl-muted">
                    SPI: {spi === null ? 'n/a' : (full ? formatFull(spi, 6) : spi.toFixed(2))} • Variance: {money(sv)}
                    {full && (
                      <span data-testid="snapshot-pv">
                        {' '}• PV: {numberOrNull(kpis?.pv) === null ? 'No cost data' : `$${formatFull(kpis.pv, 2)}`}
                      </span>
                    )}
                </p>
                <p className="text-[10px] text-pl-muted mt-1">
                    {spi === null
                        ? (kpis?.spiBasis || 'Nothing to measure a schedule against yet.')
                        : `Earned value over the budget due by today${completionRatio === null ? '' : `; ${Math.round(completionRatio * 100)}% of the whole budget is earned`}.`}
                </p>
            </div>
          </div>

          {/* Financial Performance */}
          <div className="flex flex-col justify-between px-4">
             <div className="flex justify-between items-start mb-2">
              <span className="text-pl-muted text-xs font-semibold uppercase tracking-wider">Budget</span>
              <TrendingUp className="w-4 h-4 text-pl-muted" />
            </div>
            <div>
                <div className="text-lg font-semibold font-pl-mono tabular-nums text-pl-text">{money(ev)}</div>
                <p className="text-xs text-pl-muted">Earned Value (EV)</p>
                <div className="mt-1 text-xs">
                    <span className={cpi === null ? 'text-pl-muted' : (cpi >= 1 ? 'text-pl-success-text' : 'text-pl-danger-text')}>
                        CPI: {cpi === null ? 'n/a, no actual cost booked' : cpi.toFixed(2)}
                    </span>
                </div>
            </div>
          </div>

          {/* Risks & Issues */}
          <div className="flex flex-col justify-between pl-4">
             <div className="flex justify-between items-start mb-2">
              <span className="text-pl-muted text-xs font-semibold uppercase tracking-wider">Risks & Issues</span>
              <AlertTriangle className="w-4 h-4 text-pl-muted" />
            </div>
            <div className="flex gap-4">
               <div className="text-center">
                  <span className="block text-2xl font-bold font-pl-mono tabular-nums text-pl-text">{riskCount || 0}</span>
                  <span className="text-[10px] text-pl-muted uppercase">Active Risks</span>
               </div>
               <div className="text-center border-l border-pl-border pl-4">
                  <span className="block text-2xl font-bold font-pl-mono tabular-nums text-pl-text">{latestUpdate ? 1 : 0}</span>
                  <span className="text-[10px] text-pl-muted uppercase">Recent Updates</span>
               </div>
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  );
};

export default SnapshotCard;