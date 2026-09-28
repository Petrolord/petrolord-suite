// VRR KPI cards + voidage status banner (VRR Monitor right rail).
import React from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';
import { StatTile } from '@/components/ui/stat-tile';
import { useStudioTheme, THEMED_TONE } from '@/components/studio/studioTheme';
import { statusAgainstBand } from './vrrBand';

const TONE = {
  good: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  warn: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
  info: 'text-sky-400 border-sky-500/40 bg-sky-500/10',
  neutral: 'text-slate-400 border-slate-600/40 bg-slate-700/20',
};

const fmt = (v, d = 0) =>
  v == null || !Number.isFinite(v) ? '-' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

// Design system: inside the theme scope each KPI is the shared StatTile
// (mono value, muted unit); the headline tile keeps a primary outline.
const Kpi = ({ title, value, unit, accent }) => {
  const { ds } = useStudioTheme();
  if (ds) {
    return <StatTile label={title} value={value} unit={unit || undefined} className={accent ? 'border-pl-primary/60 ring-1 ring-pl-primary/30' : undefined} />;
  }
  return <LegacyKpi title={title} value={value} unit={unit} accent={accent} />;
};

const LegacyKpi = ({ title, value, unit, accent }) => (
  <Card className={`bg-slate-900 border-slate-800 ${accent ? 'ring-1 ring-sky-500/30' : ''}`}>
    <CardContent className="p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="text-2xl font-bold mt-1 text-slate-100">
        {value}{unit ? <span className="text-sm text-slate-500 ml-1">{unit}</span> : null}
      </div>
    </CardContent>
  </Card>
);

const VrrKpiPanel = () => {
  const { summary, rolling, flags, targetBand, isImported, ledgerWells, worstPattern } = useVrrMonitor();
  const status = statusAgainstBand(summary?.cumulativeVRR ?? null, targetBand);
  const latestRolling = rolling.length ? rolling[rolling.length - 1] : null;
  const flagged = flags.filter((f) => f != null);
  const outOfBand = flagged.filter((f) => f !== 'in-band').length;
  const { tc } = useStudioTheme();

  return (
    <div className="space-y-3">
      <div className={tc(`flex items-start gap-3 rounded-lg border px-4 py-3 ${TONE[status.tone]}`, `flex items-start gap-3 rounded-lg border px-4 py-3 ${THEMED_TONE[status.tone] || THEMED_TONE.neutral}`)} role={tc(undefined, 'status')}>
        <Info className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <div className="font-semibold text-sm">Voidage status (cum. VRR = {fmt(summary?.cumulativeVRR, 2)})</div>
          <div className="text-xs opacity-90" data-testid="vrr-status">{status.label}</div>
          {status.screen && <div className="text-[11px] opacity-70 mt-1">{status.screen}</div>}
        </div>
      </div>
      <Kpi title="Cumulative VRR" value={fmt(summary?.cumulativeVRR, 2)} accent />
      <Kpi title="Latest Instantaneous VRR" value={fmt(summary?.latestInstantaneousVRR, 2)} />
      <Kpi title="Latest Rolling VRR" value={fmt(latestRolling, 2)} />
      <Kpi
        title={`Vs target band ${targetBand.min.toFixed(2)} to ${targetBand.max.toFixed(2)}`}
        value={flagged.length ? `${outOfBand} / ${flagged.length}` : '-'}
        unit={flagged.length ? 'periods out' : ''}
      />
      <Kpi title="Total Produced Voidage" value={fmt(summary?.totalProducedVoidage)} unit="RB" />
      <Kpi title="Total Injected Voidage" value={fmt(summary?.totalInjectedVoidage)} unit="RB" />
      {isImported && (
        <Kpi title="Wells" value={`${ledgerWells.producers.length} prod / ${ledgerWells.injectors.length} inj`} />
      )}
      {worstPattern && (
        <Kpi title="Weakest pattern (cum. VRR)" value={`${worstPattern.pattern.name}: ${fmt(worstPattern.summary.cumulativeVRR, 2)}`} />
      )}
    </div>
  );
};

export default VrrKpiPanel;
