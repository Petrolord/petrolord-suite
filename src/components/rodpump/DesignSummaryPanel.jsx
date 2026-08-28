// Design summary (right rail). The numbers a rod pump designer checks
// first, and a refusal with reasons when the design cannot run.
import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useRodPump } from '@/contexts/RodPumpDesignContext';
import { fmt, Row } from './fields';

const DesignSummaryPanel = () => {
  const { result, design, string } = useRodPump();

  if (!result.ok || !design) {
    return (
      <div className="rounded-md border border-amber-900/60 bg-amber-950/30 p-3 space-y-2">
        <p className="text-xs font-semibold text-amber-300 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" /> Design cannot run
        </p>
        <ul className="text-[11px] text-amber-200/80 space-y-1 list-disc pl-4">
          {result.errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      </div>
    );
  }

  const warnings = design.warnings || [];
  const worst = design.worstSection;

  return (
    <div className="space-y-2">
      <Row
        label="Production"
        value={`${fmt(design.producedBpd, 1)} bbl/d`}
        hint={`Target ${fmt(design.qoStbd)} stb/d oil at ${fmt(design.wct * 100, 0)} percent water`}
      />
      <Row
        label="Plunger stroke"
        value={`${fmt(design.plungerStrokeIn, 1)} in`}
        hint={`of a ${fmt(design.strokeIn)} in surface stroke`}
      />
      <Row
        label="Barrel fillage"
        value={`${fmt(design.gas.fillage * 100, 1)} %`}
        hint={design.gas.fillage > 0.99 ? 'Full: no free gas at intake' : 'Free gas is taking barrel volume'}
      />
      <Row
        label="Submergence"
        value={`${fmt(design.intake.submergenceFt)} ft`}
        hint={`Intake at ${fmt(design.intake.pipPsia)} psia`}
      />
      <Row label="Fluid load" value={`${fmt(design.fluidLoadLb)} lb`} />
      <Row
        label="Peak rod load"
        value={`${fmt(design.pprlLb)} lb`}
        hint={`Minimum ${fmt(design.mprlLb)} lb, buoyed string ${fmt(string.weightFluidLb)} lb`}
      />
      <Row
        label="Peak torque"
        value={design.balance ? `${fmt(design.balance.peakTorqueInLb)} in-lb` : '--'}
        hint={design.balance ? `Counterbalance ${fmt(design.balance.counterbalanceEffectLb)} lb` : null}
      />
      <Row
        label="Rod loading"
        value={worst ? `${fmt(worst.loadingPct)} %` : '--'}
        hint={worst ? `of modified Goodman, on the ${worst.label} section` : null}
      />

      <div className="pt-2">
        {warnings.length === 0 ? (
          <p className="text-[11px] text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> The string, the unit and the barrel are all inside their limits.
          </p>
        ) : (
          <div className="rounded-md border border-amber-900/60 bg-amber-950/30 p-2">
            <p className="text-[11px] font-semibold text-amber-300">
              {warnings.length} thing{warnings.length === 1 ? '' : 's'} to look at
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DesignSummaryPanel;
