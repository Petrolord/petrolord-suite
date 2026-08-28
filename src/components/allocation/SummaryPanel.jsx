// Allocation summary rail: what the meter said, what the wells could
// carry, the factor between them, and the counts that decide whether
// the run is trustworthy.
import React from 'react';
import { Gauge, AlertTriangle, ShieldCheck, Clock } from 'lucide-react';
import { useAllocation } from '@/contexts/ProductionAllocationContext';

const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

const Tile = ({ label, value, unit, tone = 'text-slate-100' }) => (
  <div className="bg-slate-800/60 border border-slate-700/60 rounded px-3 py-2">
    <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    <div className={`text-lg font-semibold leading-tight ${tone}`}>
      {value} {unit && <span className="text-xs font-normal text-slate-500">{unit}</span>}
    </div>
  </div>
);

const SummaryPanel = () => {
  const { allocation, testQc, tests, currentField, activeSettings } = useAllocation();

  if (!currentField) {
    return <p className="text-sm text-slate-500">Select a field to see its allocation summary.</p>;
  }
  if (!allocation.days.length) {
    return <p className="text-sm text-slate-500">No metered dates in range yet. Import totals on the Data tab.</p>;
  }

  const { totals } = allocation;
  const periodFactor = totals.theoretical.oil > 0 ? totals.measured.oil / totals.theoretical.oil : null;
  const inBand = periodFactor == null ? null
    : periodFactor >= activeSettings.factorWarnLow && periodFactor <= activeSettings.factorWarnHigh;
  const high = allocation.diagnostics.filter((d) => d.severity === 'high').length;
  const medium = allocation.diagnostics.filter((d) => d.severity === 'medium').length;
  const rejected = tests.filter((t) => t.is_valid === false).length;

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500 flex items-center gap-1.5">
        <Clock size={12} /> {allocation.days[0].date} to {allocation.days[allocation.days.length - 1].date}
        {' '}({totals.days.toLocaleString()} dates)
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="Metered oil" value={fmt(totals.measured.oil)} unit="stb" tone="text-emerald-400" />
        <Tile label="Allocated oil" value={fmt(totals.allocated.oil)} unit="stb" />
        <Tile label="Metered water" value={fmt(totals.measured.water)} unit="stb" tone="text-sky-400" />
        <Tile label="Metered gas" value={fmt(totals.measured.gas)} unit="Mscf" tone="text-amber-400" />
        <Tile
          label="Period oil factor"
          value={periodFactor == null ? '--' : fmt(periodFactor, 3)}
          tone={inBand === false ? 'text-amber-400' : 'text-slate-100'}
        />
        <Tile label="Wells allocated" value={allocation.wells.length} />
      </div>

      {inBand === false && (
        <p className="text-[11px] text-amber-400/90">
          The period factor sits outside your warning band. Nothing has been clamped: check the
          tests, the meter and the uptime record before trusting the split.
        </p>
      )}

      <div className="border-t border-slate-800 pt-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-slate-400">
            <AlertTriangle size={14} className="text-amber-400" /> Diagnostics
          </span>
          <span className="text-slate-200">
            {high > 0 && <span className="text-red-400 font-semibold">{high} high</span>}
            {high > 0 && medium > 0 && <span className="text-slate-600"> / </span>}
            {medium > 0 && <span className="text-amber-400 font-semibold">{medium} medium</span>}
            {high === 0 && medium === 0 && <span className="text-emerald-400">clean</span>}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-slate-400">
            <ShieldCheck size={14} className="text-sky-400" /> Tests flagged
          </span>
          <span className="text-slate-200">{testQc.length} of {tests.length}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-slate-400">
            <Gauge size={14} className="text-slate-500" /> Tests rejected
          </span>
          <span className="text-slate-200">{rejected}</span>
        </div>
      </div>
    </div>
  );
};

export default SummaryPanel;
