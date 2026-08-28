// Study summary (right rail).
import React from 'react';
import { CheckCircle2, Info } from 'lucide-react';
import { useLiftAdvisor } from '@/contexts/LiftAdvisorContext';
import { fmt } from './fields';

const Row = ({ label, value, hint }) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-slate-800/60 last:border-0">
    <div>
      <p className="text-sm text-slate-300">{label}</p>
      {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
    </div>
    <p className="text-sm font-semibold text-slate-100 tabular-nums whitespace-nowrap">{value}</p>
  </div>
);

const SummaryPanel = () => {
  const { model, inputs, comparison, designPass } = useLiftAdvisor();

  if (!model) {
    return (
      <div className="rounded-md border border-amber-900/60 bg-amber-950/30 p-3">
        <p className="text-[11px] text-amber-200/80">
          The well model is incomplete, so nothing can be screened or designed against it.
        </p>
      </div>
    );
  }

  const best = comparison.workable[0];
  const engineBacked = comparison.rows.filter((r) => r.hasEngine);
  return (
    <div className="space-y-2">
      <Row
        label="Target"
        value={`${fmt(Number(inputs.duty.targetRateStbd))} stb/d`}
        hint={`at ${fmt(Number(inputs.duty.wctPct))} percent water`}
      />
      <Row
        label="Absolute open flow"
        value={`${fmt(model.ipr?.qmax)} stb/d`}
        hint="what the inflow can deliver at zero bottomhole pressure"
      />
      <Row label="Depth" value={`${fmt(model.tvdMax)} ft`} />
      <Row label="Gas-oil ratio" value={`${fmt(Number(inputs.fluid.gor))} scf/stb`} />

      <div className="pt-2">
        {!designPass ? (
          <p className="text-[11px] text-slate-500 flex items-start gap-1">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Screening only so far. Run the designs to find out which methods actually work on this
            well.
          </p>
        ) : best ? (
          <div className="rounded-md border border-emerald-900/60 bg-emerald-950/20 p-2 space-y-1">
            <p className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> {best.label} designs on this well
            </p>
            <p className="text-[11px] text-slate-400">{best.design.equipment}</p>
            <p className="text-[11px] text-slate-600">
              {comparison.workable.length} of {engineBacked.length} engine-backed methods work here.
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-amber-900/60 bg-amber-950/30 p-2">
            <p className="text-[11px] text-amber-300">
              None of the four designs on this well at that target. The refusals say why.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SummaryPanel;
