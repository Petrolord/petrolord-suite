import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUpRight, ArrowDownRight, Activity, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';

const SnapshotCard = ({ project, latestUpdate, kpis, riskCount }) => {
  if (!project) return null;

  const statusColor = {
    'Green': 'text-green-500 border-green-500/50 bg-green-500/10',
    'Amber': 'text-amber-500 border-amber-500/50 bg-amber-500/10',
    'Red': 'text-red-500 border-red-500/50 bg-red-500/10',
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
    ? <Activity className="w-4 h-4 text-slate-500" />
    : (spi >= 1 ? <ArrowUpRight className="w-4 h-4 text-green-400" /> : <ArrowDownRight className="w-4 h-4 text-red-400" />);
  // EC6-1: SPI is time-phased now, so it really does say early or late. When
  // it cannot be computed the card says which of the two reasons applies
  // rather than inventing a verdict.
  const trendText = spi === null
    ? (kpis?.costed ? 'No planned dates' : 'No cost-loaded tasks')
    : (spi >= 1 ? 'Ahead/On Schedule' : 'Behind Schedule');

  return (
    <Card className="bg-slate-900 border-slate-800 mb-4 shadow-lg">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 divide-y md:divide-y-0 md:divide-x divide-slate-800">
          
          {/* Overall Status */}
          <div className="flex flex-col justify-between pr-4">
            <div className="flex justify-between items-start mb-2">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Project Health</span>
              <Badge variant="outline" className={`${statusColor[currentStatus]} capitalize`}>
                {currentStatus}
              </Badge>
            </div>
            <div className="mt-1">
               <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-white">
                    {percentComplete === null || Number.isNaN(percentComplete) ? 'Not measured' : `${Math.round(percentComplete)}%`}
                  </span>
                  <span className="text-sm text-slate-500">
                    {percentComplete === null || Number.isNaN(percentComplete) ? '' : 'Complete'}
                  </span>
               </div>
               <div className="w-full bg-slate-800 h-1.5 mt-2 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500" style={{ width: `${Math.min(percentComplete || 0, 100)}%` }} />
               </div>
            </div>
          </div>

          {/* Schedule Performance */}
          <div className="flex flex-col justify-between px-4">
             <div className="flex justify-between items-start mb-2">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Schedule</span>
              <Activity className="w-4 h-4 text-blue-400" />
            </div>
            <div>
                <div className="flex items-center gap-2 mb-1">
                    {trendIcon}
                    <span className={`text-lg font-semibold ${spi === null ? 'text-slate-400' : (spi >= 1 ? 'text-green-400' : 'text-red-400')}`}>{trendText}</span>
                </div>
                <p className="text-xs text-slate-500">
                    SPI: {spi === null ? 'n/a' : spi.toFixed(2)} • Variance: {money(sv)}
                </p>
                <p className="text-[10px] text-slate-600 mt-1">
                    {spi === null
                        ? (kpis?.spiBasis || 'Nothing to measure a schedule against yet.')
                        : `Earned value over the budget due by today${completionRatio === null ? '' : `; ${Math.round(completionRatio * 100)}% of the whole budget is earned`}.`}
                </p>
            </div>
          </div>

          {/* Financial Performance */}
          <div className="flex flex-col justify-between px-4">
             <div className="flex justify-between items-start mb-2">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Budget</span>
              <TrendingUp className="w-4 h-4 text-lime-400" />
            </div>
            <div>
                <div className="text-lg font-semibold text-white">{money(ev)}</div>
                <p className="text-xs text-slate-500">Earned Value (EV)</p>
                <div className="mt-1 text-xs">
                    <span className={cpi === null ? 'text-slate-400' : (cpi >= 1 ? 'text-green-400' : 'text-red-400')}>
                        CPI: {cpi === null ? 'n/a, no actual cost booked' : cpi.toFixed(2)}
                    </span>
                </div>
            </div>
          </div>

          {/* Risks & Issues */}
          <div className="flex flex-col justify-between pl-4">
             <div className="flex justify-between items-start mb-2">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Risks & Issues</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex gap-4">
               <div className="text-center">
                  <span className="block text-2xl font-bold text-white">{riskCount || 0}</span>
                  <span className="text-[10px] text-slate-500 uppercase">Active Risks</span>
               </div>
               <div className="text-center border-l border-slate-800 pl-4">
                  <span className="block text-2xl font-bold text-white">{latestUpdate ? 1 : 0}</span>
                  <span className="text-[10px] text-slate-500 uppercase">Recent Updates</span>
               </div>
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  );
};

export default SnapshotCard;