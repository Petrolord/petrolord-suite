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

const Tile = ({ label, value, unit }) => (
  <div className="bg-pl-sunken border border-pl-border rounded px-3 py-2">
    <div className="text-[10px] uppercase tracking-wider text-pl-muted">{label}</div>
    <div className="text-lg font-semibold leading-tight font-pl-mono tabular-nums text-pl-text">
      {value} {unit && <span className="font-pl-sans text-xs font-normal text-pl-muted">{unit}</span>}
    </div>
  </div>
);

const KpiPanel = () => {
  const { kpis, surveillance, defermentSummary, currentField } = useSurveillance();

  if (!currentField) {
    return <p className="text-sm text-pl-muted">Select a field to see its performance summary.</p>;
  }
  if (!kpis) {
    return <p className="text-sm text-pl-muted">No ledger rows yet. Import production data on the Data tab.</p>;
  }

  const high = surveillance.exceptions.filter((e) => e.severity === 'high').length;
  const medium = surveillance.exceptions.filter((e) => e.severity === 'medium').length;

  return (
    <div className="space-y-3">
      <div className="text-xs text-pl-muted flex items-center gap-1.5">
        <Clock size={12} /> Trailing {kpis.windowDays} days to {kpis.asOf}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="Oil" value={fmt(kpis.oil)} unit="stb/d" />
        <Tile label="Water" value={fmt(kpis.water)} unit="stb/d" />
        <Tile label="Gas" value={fmt(kpis.gas)} unit="Mscf/d" />
        <Tile label="Water inj." value={fmt(kpis.winj)} unit="stb/d" />
        <Tile label="Watercut" value={kpis.watercut == null ? '--' : fmt(kpis.watercut * 100, 1)} unit="%" />
        <Tile label="GOR" value={fmt(kpis.gor)} unit="scf/stb" />
        <Tile label="Uptime" value={kpis.uptimePct == null ? '--' : fmt(kpis.uptimePct, 1)} unit="%" />
        <Tile label="Wells" value={`${kpis.producerCount}/${kpis.wellCount}`} unit="prod." />
      </div>

      {kpis.uptimePct == null && (
        <p className="text-[11px] text-pl-muted">
          Uptime needs an hours_on column in the ledger. Without it, producing-day rates equal
          calendar-day volumes.
        </p>
      )}

      <div className="border-t border-pl-border pt-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-pl-muted">
            <AlertTriangle size={14} className="text-pl-muted" /> Exceptions
          </span>
          <span className="text-pl-text">
            {high > 0 && <span className="text-pl-danger-text font-semibold">{high} high</span>}
            {high > 0 && medium > 0 && <span className="text-pl-muted"> / </span>}
            {medium > 0 && <span className="text-pl-warning-text font-semibold">{medium} medium</span>}
            {high === 0 && medium === 0 && <span className="text-pl-success-text">none</span>}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-pl-muted">
            <Activity size={14} className="text-pl-muted" /> Open deferments
          </span>
          <span className="text-pl-text">{defermentSummary.openCount}</span>
        </div>
        {defermentSummary.totals.oil > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-pl-muted">Oil deferred</span>
            <span className="text-pl-text">{fmt(defermentSummary.totals.oil)} <span className="text-xs text-pl-muted">stb</span></span>
          </div>
        )}
      </div>
    </div>
  );
};

export default KpiPanel;
