// Right rail: honest state of the active case's latest run + the engine
// identity. No fake progress bars — queued/running show as exactly that.
import React from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useSimStudio } from '@/contexts/SimStudioContext';
import { fmtElapsed } from '@/components/simstudio/resultAdapters';

const TONE = {
  complete: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  failed: 'text-red-400 border-red-500/40 bg-red-500/10',
  running: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  queued: 'text-sky-400 border-sky-500/40 bg-sky-500/10',
  cancelled: 'text-slate-400 border-slate-600/40 bg-slate-700/20',
  none: 'text-slate-400 border-slate-600/40 bg-slate-700/20',
};

const Kpi = ({ title, value }) => (
  <Card className="bg-slate-900 border-slate-800">
    <CardContent className="p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{title}</div>
      <div className="text-sm font-semibold mt-0.5 text-slate-200 break-all">{value}</div>
    </CardContent>
  </Card>
);

const SimKpiPanel = () => {
  const { activeCase, runs } = useSimStudio();
  const latest = runs[0] || null;
  const status = latest?.status || 'none';

  return (
    <div className="space-y-3">
      <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${TONE[status]}`}>
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          {!activeCase ? 'No case open.'
            : !latest ? 'No runs yet for this case.'
              : status === 'running' ? 'Simulation running on the worker.'
                : status === 'queued' ? 'Run queued; the worker polls every ~10 s.'
                  : status === 'complete' ? 'Latest run complete.'
                    : status === 'failed' ? `Latest run failed (${latest.failure_stage || 'see log'}).`
                      : 'Latest run was cancelled.'}
        </div>
      </div>
      {latest && (
        <>
          <Kpi title="Engine" value={latest.opm_version || 'OPM Flow'} />
          <Kpi title="Elapsed" value={fmtElapsed(latest.elapsed_seconds)} />
          <Kpi title="Report steps" value={latest.report_steps ?? '—'} />
          <Kpi title="Attempt" value={latest.attempt || 1} />
        </>
      )}
      {activeCase && (
        <Kpi title="Deck" value={activeCase.deck_path
          ? `${activeCase.deck_path.split('/').pop()} (${((activeCase.deck_bytes || 0) / 1024).toFixed(0)} KB)`
          : 'not uploaded'} />
      )}
    </div>
  );
};

export default SimKpiPanel;
