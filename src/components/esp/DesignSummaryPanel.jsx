// Design summary (right rail). The numbers a designer checks before
// looking at anything else, and a refusal with reasons when the design
// cannot run rather than a defaulted answer.
import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useEsp } from '@/contexts/EspDesignContext';

const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

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
  const { result, design, curve } = useEsp();

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

  const { duty, sized, electrical } = design;
  const warnings = design.warnings || [];

  return (
    <div className="space-y-2">
      <Row
        label="Stages"
        value={fmt(sized.stages)}
        hint={curve.source === 'vendor' ? 'On the vendor curve you entered' : 'On a reference model stage'}
      />
      <Row label="Total dynamic head" value={`${fmt(duty.tdhFt)} ft`} />
      <Row
        label="Pump intake pressure"
        value={`${fmt(duty.intake.pipPsia)} psia`}
        hint={`Flowing bottomhole ${fmt(duty.intake.pwfPsia)} psia`}
      />
      <Row
        label="Rate through the pump"
        value={`${fmt(duty.pumpIntakeBpd)} bbl/d`}
        hint="In situ at intake conditions"
      />
      <Row
        label="Gas through the pump"
        value={`${fmt(duty.intake.gas.gvfThroughPump * 100, 1)} %`}
        hint={{
          standard: 'A standard stage handles this',
          gasHandler: 'Gas handler territory',
          separatorRequired: 'Above the separator limit',
        }[duty.intake.gas.verdict]}
      />
      <Row label="Shaft power" value={`${fmt(sized.shaftHp, 1)} hp`} />
      <Row
        label="Motor load"
        value={sized.motorLoad ? `${fmt(sized.motorLoad.loadFraction * 100)} %` : '--'}
        hint={sized.motorLoad ? `of ${fmt(sized.motorLoad.nameplateHp)} hp nameplate` : null}
      />
      <Row
        label="Cable"
        value={electrical.cable ? electrical.cable.label : 'none qualifies'}
        hint={electrical.requirement
          ? `${fmt(electrical.requirement.dropPct, 1)} % drop, ${fmt(electrical.requirement.surfaceVolts)} V at surface`
          : 'No conductor meets the drop limit'}
      />

      <div className="pt-2">
        {warnings.length === 0 ? (
          <p className="text-[11px] text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> The duty sits inside the pump's published range.
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
