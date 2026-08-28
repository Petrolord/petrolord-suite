// Field KPI rail: trailing-window rates and ratios from the ledger,
// with the exception and open-deferment counts. Every figure is the
// mean over the trailing window ending on the field's LAST ledger date
// (never the wall clock) so historical datasets read honestly.
import React from 'react';
import { Activity, AlertTriangle, Clock } from 'lucide-react';
import { useSurveillance } from '@/contexts/ProductionSurveillanceContext';

const fmt = (v, digits = 0) =>
  (v == null || !Number.isFinite(v)) ? '--' : v.toLocaleString(undefined, {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });

const Tile = ({ label, value, unit, tone = 'text-slate-100' }) => (
  <div className="bg-slate-800/60 border border-slate-700/60 rounded px-3 py-2">
    <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    <div className={`text-lg font-semibold leading-tight ${tone}`}>
      {value} {unit && <span className="text-xs font-normal text-slate-500">{unit}</span>}
    </div>
  </div>
);

const KpiPanel = () => {
  const { kpis, surveillance, defermentSummary, currentField } = useSurveillance();

  if (!currentField) {
    return <p className="text-sm text-slate-500">Select a field to see its performance summary.</p>;
  }
  if (!kpis) {
    return <p className="text-sm text-slate-500">No ledger rows yet. Import production data on the Data tab.</p>;
  }

  const high = surveillance.exceptions.filter((e) => e.severity === 'high').length;
  const medium = surveillance.exceptions.filter((e) => e.severity === 'medium').length;

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500 flex items-center gap-1.5">
        <Clock size={12} /> Trailing {kpis.windowDays} days to {kpis.asOf}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="Oil" value={fmt(kpis.oil)} unit="stb/d" tone="text-emerald-400" />
        <Tile label="Water" value={fmt(kpis.water)} unit="stb/d" tone="text-sky-400" />
        <Tile label="Gas" value={fmt(kpis.gas)} unit="Mscf/d" tone="text-amber-400" />
        <Tile label="Water inj." value={fmt(kpis.winj)} unit="stb/d" tone="text-indigo-400" />
        <Tile label="Watercut" value={kpis.watercut == null ? '--' : fmt(kpis.watercut * 100, 1)} unit="%" />
        <Tile label="GOR" value={fmt(kpis.gor)} unit="scf/stb" />
        <Tile label="Uptime" value={kpis.uptimePct == null ? '--' : fmt(kpis.uptimePct, 1)} unit="%" />
        <Tile label="Wells" value={`${kpis.producerCount}/${kpis.wellCount}`} unit="prod." />
      </div>

      {kpis.uptimePct == null && (
        <p className="text-[11px] text-slate-500">
          Uptime needs an hours_on column in the ledger. Without it, producing-day rates equal
          calendar-day volumes.
        </p>
      )}

      <div className="border-t border-slate-800 pt-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-slate-400">
            <AlertTriangle size={14} className="text-amber-400" /> Exceptions
          </span>
          <span className="text-slate-200">
            {high > 0 && <span className="text-red-400 font-semibold">{high} high</span>}
            {high > 0 && medium > 0 && <span className="text-slate-600"> / </span>}
            {medium > 0 && <span className="text-amber-400 font-semibold">{medium} medium</span>}
            {high === 0 && medium === 0 && <span className="text-emerald-400">none</span>}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-slate-400">
            <Activity size={14} className="text-sky-400" /> Open deferments
          </span>
          <span className="text-slate-200">{defermentSummary.openCount}</span>
        </div>
        {defermentSummary.totals.oil > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Oil deferred</span>
            <span className="text-slate-200">{fmt(defermentSummary.totals.oil)} <span className="text-xs text-slate-500">stb</span></span>
          </div>
        )}
      </div>
    </div>
  );
};

export default KpiPanel;
