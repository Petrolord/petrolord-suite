// Design summary (right rail). The five numbers a designer checks
// before looking at anything else, and the reason the string stopped
// where it did.
import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useGasLift } from '@/contexts/GasLiftDesignContext';

const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

const STOP_REASON = {
  targetDepth: 'The string reached the target depth.',
  injectionPressure: 'The injection pressure ran out before the target depth.',
  minSpacing: 'Spacing collapsed below the minimum before the target depth.',
  maxValves: 'The valve limit was reached before the target depth.',
};

const Row = ({ label, value, hint }) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-slate-800/60 last:border-0">
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
    </div>
    <p className="text-sm font-semibold text-slate-100 tabular-nums whitespace-nowrap">{value}</p>
  </div>
);

const DesignSummaryPanel = () => {
  const { installation, injectionPoint, inputs } = useGasLift();

  if (!installation.ok) {
    return (
      <div className="rounded-md border border-amber-900/60 bg-amber-950/30 p-3 space-y-2">
        <p className="text-xs font-semibold text-amber-300 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" /> Design cannot run
        </p>
        <ul className="text-[11px] text-amber-200/80 space-y-1 list-disc pl-4">
          {installation.errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      </div>
    );
  }

  const { design } = installation;
  const deepest = design.depths[design.depths.length - 1];
  const charged = design.valves.filter((v) => v.valveType !== 'orifice').length;
  const warnings = design.warnings || [];

  return (
    <div className="space-y-2">
      <Row label="Valves" value={`${design.valves.length}`} hint={`${charged} charged, ${design.valves.length - charged} orifice`} />
      <Row label="Operating valve depth" value={`${fmt(deepest)} ft`} />
      <Row
        label="Point of injection"
        value={injectionPoint ? `${fmt(injectionPoint.depthFt)} ft` : '--'}
        hint={injectionPoint?.limitedBy === 'depth'
          ? 'Gas still wins at the deepest point of the traverse.'
          : 'Where the injection line meets the flowing gradient.'}
      />
      <Row label="Operating pressure" value={`${fmt(design.pOperatingPsig)} psig`} />
      <Row label="Target gas rate" value={`${fmt(inputs.injection.targetQgiMscfd)} Mscf/d`} />

      <div className="pt-2">
        {warnings.length === 0 ? (
          <p className="text-[11px] text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> {STOP_REASON[design.stopReason] || ''}
          </p>
        ) : (
          <div className="rounded-md border border-amber-900/60 bg-amber-950/30 p-2 space-y-1">
            <p className="text-[11px] font-semibold text-amber-300">
              {warnings.length} thing{warnings.length === 1 ? '' : 's'} to look at
            </p>
            <p className="text-[11px] text-amber-200/70">{STOP_REASON[design.stopReason] || ''}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DesignSummaryPanel;
