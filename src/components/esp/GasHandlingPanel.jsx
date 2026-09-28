// What the gas does at the intake (Design tab). The free gas comes out
// of the black-oil PVT at intake conditions, not out of a rule of
// thumb; what the separator removes is a user number; what is left goes
// through the stages and decides whether this is a standard pump, a gas
// handler or a job for a different lift method.
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useEsp } from '@/contexts/EspDesignContext';

const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

const VERDICT = {
  standard: {
    label: 'Standard stage',
    className: 'text-pl-success-text border-pl-success/40 bg-pl-success-bg',
    note: 'The gas through the stages is inside the standard limit.',
  },
  gasHandler: {
    label: 'Gas handler',
    className: 'text-pl-warning-text border-pl-warning/40 bg-pl-warning-bg',
    note: 'Above the standard limit: a gas handler or an advanced gas-handling stage is normal practice here.',
  },
  separatorRequired: {
    label: 'Separator, or a different lift method',
    className: 'text-pl-danger-text border-pl-danger/40 bg-pl-danger-bg',
    note: 'Above the handler limit. Take the gas out ahead of the pump, or consider gas lift, which likes this well far more than a centrifugal pump does.',
  },
};

const Row = ({ label, value, hint }) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-pl-border last:border-0">
    <div>
      <p className="text-sm text-pl-text">{label}</p>
      {hint && <p className="text-[11px] text-pl-muted">{hint}</p>}
    </div>
    <p className="text-sm font-semibold text-pl-text font-pl-mono tabular-nums whitespace-nowrap">{value}</p>
  </div>
);

const GasHandlingPanel = () => {
  const { design } = useEsp();
  if (!design) return null;
  const { stream, gas, pvt, tempF, pipPsia } = design.duty.intake;
  const verdict = VERDICT[gas.verdict] || VERDICT.standard;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Gas at the intake
          <span className="block text-xs font-normal text-pl-muted mt-0.5">
            At {fmt(pipPsia)} psia and {fmt(tempF)} F the oil holds {fmt(pvt.rs)} scf/stb in solution
            {pvt.rs >= design.gorScfStb - 0.5
              ? `, all of the produced ${fmt(design.gorScfStb)} scf/stb, so no gas is free at the intake.`
              : ` of the produced ${fmt(design.gorScfStb)} scf/stb, so ${fmt(design.gorScfStb - pvt.rs)} scf/stb is free.`}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={`rounded-md border p-2 ${verdict.className}`}>
          <p className="text-sm font-semibold">
            {fmt(gas.gvfThroughPump * 100, 1)} percent gas by volume through the pump:{' '}
            {verdict.label}
          </p>
          <p className="text-[11px] opacity-80 mt-0.5">{verdict.note}</p>
        </div>

        <div>
          <Row label="Oil at intake" value={`${fmt(stream.qoResBpd)} bbl/d`} hint={`${fmt(design.qoStbd)} stb/d at Bo ${fmt(pvt.bo, 3)}`} />
          <Row label="Water at intake" value={`${fmt(stream.qwResBpd)} bbl/d`} hint={`${fmt(design.wct * 100, 1)} percent water cut`} />
          <Row label="Free gas at intake" value={`${fmt(stream.freeGasResBpd)} bbl/d`} hint={`${fmt(stream.freeGasScfd)} scf/d`} />
          <Row
            label="Taken by the separator"
            value={`${fmt(gas.ventedResBpd)} bbl/d`}
            hint={`${fmt(gas.separatorEfficiency * 100)} percent of the free gas, up the annulus`}
          />
          <Row
            label="Swallowed by the pump"
            value={`${fmt(gas.pumpIntakeBpd)} bbl/d`}
            hint={`Liquid plus the ${fmt(gas.throughPumpGasResBpd)} bbl/d of gas the separator left`}
          />
          <Row
            label="Gas-oil ratio above the pump"
            value={`${fmt(design.duty.gorTubingScfStb)} scf/stb`}
            hint="What the discharge traverse carries: the produced ratio less what was vented"
          />
          <Row
            label="Density through the pump"
            value={`${fmt(gas.mixtureDensityLbFt3, 1)} lb/ft3`}
            hint="Heavier than the full stream, because the separator took gas out. This is the gradient the head conversion uses."
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default GasHandlingPanel;
