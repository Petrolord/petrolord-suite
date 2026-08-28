// Where the duty sits on the curve (Pump Curve tab): the best
// efficiency point, the published range, and the affinity-law mapping
// that puts the duty back onto the reference-speed curve. The last one
// matters because a VSD design is read off the reference curve at the
// equivalent rate, and that is the number the vendor's range applies to.
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useEsp } from '@/contexts/EspDesignContext';

const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

const REGION = {
  recommended: { label: 'Inside the recommended range', className: 'text-emerald-400' },
  downthrust: { label: 'Downthrust: left of the range', className: 'text-amber-300' },
  upthrust: { label: 'Upthrust: right of the range', className: 'text-red-300' },
};

const Row = ({ label, value, hint }) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-slate-800/60 last:border-0">
    <div>
      <p className="text-sm text-slate-300">{label}</p>
      {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
    </div>
    <p className="text-sm font-semibold text-slate-100 tabular-nums whitespace-nowrap">{value}</p>
  </div>
);

const StageDetailPanel = () => {
  const { design, curve } = useEsp();
  if (!design || !curve?.ok) return null;

  const { stage } = design.sized;
  const region = REGION[stage.region] || { label: stage.region, className: 'text-slate-400' };
  const bep = curve.bep || {};

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          The duty on the stage curve
          <span className={`block text-xs font-normal mt-0.5 ${region.className}`}>
            {region.label}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Row
          label="Rate through the pump"
          value={`${fmt(design.duty.pumpIntakeBpd)} bbl/d`}
          hint={`${fmt(design.qoStbd)} stb/d oil plus water and the gas the separator left, at intake conditions`}
        />
        <Row
          label="Equivalent rate on the published curve"
          value={`${fmt(stage.qRefBpd)} bbl/d`}
          hint={`Affinity laws back to ${fmt(curve.refHz)} Hz from ${fmt(design.hz)} Hz`}
        />
        <Row
          label="Published range"
          value={`${fmt(curve.qMin)} to ${fmt(curve.qMax)} bbl/d`}
          hint={stage.inRange
            ? 'The duty is inside it, so head and efficiency are read, not extrapolated.'
            : 'The duty is outside it: head and efficiency here are an extrapolation.'}
        />
        <Row
          label="Best efficiency point"
          value={Number.isFinite(bep.qBpd) ? `${fmt(bep.qBpd)} bbl/d` : '--'}
          hint={Number.isFinite(bep.efficiency)
            ? `${fmt(bep.efficiency * 100, 1)} percent at ${fmt(bep.headFt, 1)} ft per stage`
            : 'No efficiency points were given, so there is no best efficiency point to report.'}
        />
        <Row
          label="Head per stage at the duty"
          value={`${fmt(stage.headFt, 2)} ft`}
          hint={`${fmt(design.sized.stages)} stages make ${fmt(design.sized.headMadeFt)} ft`}
        />
        <Row
          label="Brake power per stage"
          value={Number.isFinite(stage.bhpPerStage) ? `${fmt(stage.bhpPerStage, 3)} hp` : '--'}
        />
        {curve.source === 'reference-model' && (
          <p className="text-[11px] text-slate-600 pt-3">
            This is a reference model stage: a shape from four named parameters, used so a sizing
            exercise has something physical to work with. For a real design, enter the curve points
            from the vendor's published pump curve.
          </p>
        )}
        {(curve.warnings || []).length > 0 && (
          <ul className="text-[11px] text-amber-200/80 space-y-1 list-disc pl-4 pt-3">
            {curve.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default StageDetailPanel;
