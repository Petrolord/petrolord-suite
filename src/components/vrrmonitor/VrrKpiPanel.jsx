// VRR KPI cards + voidage status banner (VRR Monitor right rail).
import React from 'react';
import { Info } from 'lucide-react';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';
import { StatTile } from '@/components/ui/stat-tile';
import { THEMED_TONE } from '@/components/studio/studioTheme';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { statusAgainstBand } from './vrrBand';

const fmt = (v, d = 0) =>
  v == null || !Number.isFinite(v) ? EMPTY_VALUE : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

// Each KPI is the shared StatTile (mono value, muted unit); the headline
// tile keeps a primary outline.
const Kpi = ({ title, value, unit, accent }) => (
  <StatTile label={title} value={value} unit={unit || undefined} className={accent ? 'border-pl-primary/60 ring-1 ring-pl-primary/30' : undefined} />
);

const VrrKpiPanel = () => {
  const { summary, rolling, flags, targetBand, isImported, ledgerWells, worstPattern, u, withheld, ledger, wellVoidage } = useVrrMonitor();
  const W = wellVoidage?.totals;
  const status = statusAgainstBand(summary?.cumulativeVRR ?? null, targetBand);
  const latestRolling = rolling.length && !withheld ? rolling[rolling.length - 1] : null;
  const flagged = flags.filter((f) => f != null);
  const outOfBand = flagged.filter((f) => f !== 'in-band').length;

  return (
    <div className="space-y-3">
      <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${THEMED_TONE[status.tone] || THEMED_TONE.neutral}`} role="status">
        <Info className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <div className="font-semibold text-sm">Voidage status (cum. VRR = {fmt(summary?.cumulativeVRR, 2)})</div>
          <div className="text-xs opacity-90" data-testid="vrr-status">{withheld || status.label}</div>
          {status.screen && <div className="text-[11px] opacity-70 mt-1">{status.screen}</div>}
        </div>
      </div>
      <Kpi title="Cumulative VRR" value={fmt(summary?.cumulativeVRR, 2)} accent />
      <Kpi title="Latest Instantaneous VRR" value={fmt(summary?.latestInstantaneousVRR, 2)} />
      <Kpi title="Latest Rolling VRR" value={fmt(latestRolling, 2)} />
      <Kpi
        title={`Vs target band ${targetBand.min.toFixed(2)} to ${targetBand.max.toFixed(2)}`}
        value={flagged.length ? `${outOfBand} / ${flagged.length}` : EMPTY_VALUE}
        unit={flagged.length ? 'periods out' : ''}
      />
      <Kpi title="Total Produced Voidage" value={fmt(u.show('reservoir', summary?.totalProducedVoidage))} unit={u.label('reservoir')} />
      <Kpi title="Total Injected Voidage" value={fmt(u.show('reservoir', summary?.totalInjectedVoidage))} unit={u.label('reservoir')} />
      {summary && ledger.totals.freeGasRB > 0 && (
        <Kpi title="Free gas in produced voidage" value={fmt(u.show('reservoir', ledger.totals.freeGasRB))} unit={u.label('reservoir')} />
      )}
      {summary && W && W.freeGasRBByWell > 0 && (
        <div data-testid="vrr-freegas-by-well">
          <Kpi title="Free gas well by well (beside the field figure)" value={fmt(u.show('reservoir', W.freeGasRBByWell))} unit={u.label('reservoir')} />
          <p className="text-[11px] text-pl-muted mt-1 px-1">
            Each well floored on its own: cum. VRR {fmt(W.cumulativeVRRByWell, 2)} with it. The figures above net free gas at
            field level, where a well below its solution GOR offsets one producing free gas.
          </p>
        </div>
      )}
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
