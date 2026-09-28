// Allocation summary rail: what the meter said, what the wells could
// carry, the factor between them, and the counts that decide whether
// the run is trustworthy.
import React from 'react';
import { Gauge, AlertTriangle, ShieldCheck, Clock } from 'lucide-react';
import { useAllocation } from '@/contexts/ProductionAllocationContext';

const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

const Tile = ({ label, value, unit, tone = 'text-pl-text' }) => (
  <div className="bg-pl-sunken border border-pl-border rounded px-3 py-2">
    <div className="text-[10px] uppercase tracking-wider text-pl-muted">{label}</div>
    <div className={`text-lg font-semibold leading-tight font-pl-mono tabular-nums ${tone}`}>
      {value} {unit && <span className="font-pl-sans text-xs font-normal text-pl-muted">{unit}</span>}
    </div>
  </div>
);

const SummaryPanel = () => {
  const { allocation, testQc, tests, currentField, activeSettings } = useAllocation();

  if (!currentField) {
    return <p className="text-sm text-pl-muted">Select a field to see its allocation summary.</p>;
  }
  if (!allocation.days.length) {
    return <p className="text-sm text-pl-muted">No metered dates in range yet. Import totals on the Data tab.</p>;
  }

  const { totals } = allocation;
  // Factor over the dates a well could carry (ALLOC-T1-001): the metered
  // total also holds dates no well could take, while the theoretical only
  // covers carried dates, so metered / theoretical read 1.027 on a field
  // metering 95 percent of its wells. Allocated equals metered on carried
  // dates, so allocated / theoretical is the like-for-like factor.
  const periodFactor = totals.theoretical.oil > 0 ? totals.allocated.oil / totals.theoretical.oil : null;
  const uncarriedOil = Math.max(0, totals.measured.oil - totals.allocated.oil);
  const inBand = periodFactor == null ? null
    : periodFactor >= activeSettings.factorWarnLow && periodFactor <= activeSettings.factorWarnHigh;
  const high = allocation.diagnostics.filter((d) => d.severity === 'high').length;
  const medium = allocation.diagnostics.filter((d) => d.severity === 'medium').length;
  const rejected = tests.filter((t) => t.is_valid === false).length;

  return (
    <div className="space-y-3">
      <div className="text-xs text-pl-muted flex items-center gap-1.5">
        <Clock size={12} /> {allocation.days[0].date} to {allocation.days[allocation.days.length - 1].date}
        {' '}({totals.days.toLocaleString()} dates)
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="Metered oil" value={fmt(totals.measured.oil)} unit="stb" />
        <Tile label="Allocated oil" value={fmt(totals.allocated.oil)} unit="stb" />
        <Tile label="Metered water" value={fmt(totals.measured.water)} unit="stb" />
        <Tile label="Metered gas" value={fmt(totals.measured.gas)} unit="Mscf" />
        <Tile
          label="Period oil factor"
          value={periodFactor == null ? '--' : fmt(periodFactor, 3)}
          tone={inBand === false ? 'text-pl-warning-text' : 'text-pl-text'}
        />
        <Tile label="Wells allocated" value={allocation.wells.length} />
      </div>

      {uncarriedOil >= 0.5 && (
        <p className="text-[11px] text-pl-muted" data-testid="alloc-uncarried">
          {fmt(uncarriedOil)} stb of metered oil fell on dates no well could carry (no valid test
          yet, or no hours on), so it is in the metered total and outside the factor.
        </p>
      )}

      {inBand === false && (
        <p className="text-[11px] text-pl-warning-text">
          The period factor sits outside your warning band. Nothing has been clamped: check the
          tests, the meter and the uptime record before trusting the split.
        </p>
      )}

      <div className="border-t border-pl-border pt-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-pl-muted">
            <AlertTriangle size={14} className="text-pl-muted" /> Diagnostics
          </span>
          <span className="text-pl-text">
            {high > 0 && <span className="text-pl-danger-text font-semibold">{high} high</span>}
            {high > 0 && medium > 0 && <span className="text-pl-muted"> / </span>}
            {medium > 0 && <span className="text-pl-warning-text font-semibold">{medium} medium</span>}
            {high === 0 && medium === 0 && <span className="text-pl-success-text">clean</span>}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-pl-muted">
            <ShieldCheck size={14} className="text-pl-muted" /> Tests flagged
          </span>
          <span className="text-pl-text">{testQc.length} of {tests.length}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-pl-muted">
            <Gauge size={14} className="text-pl-muted" /> Tests rejected
          </span>
          <span className="text-pl-text">{rejected}</span>
        </div>
      </div>
    </div>
  );
};

export default SummaryPanel;
