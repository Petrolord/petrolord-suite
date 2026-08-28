// The duty (left rail): the rate this pump is being sized for and the
// conditions it sees there. Every number here moves the total dynamic
// head, so they sit together rather than being split across tabs.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEsp } from '@/contexts/EspDesignContext';

const Field = ({ label, hint, children }) => (
  <div className="space-y-1">
    <Label className="text-xs text-slate-400">{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
  </div>
);

const NumberInput = ({ name, step = 'any' }) => {
  const { inputs, setSection } = useEsp();
  return (
    <Input
      type="number"
      step={step}
      value={inputs.duty[name] ?? ''}
      onChange={(e) => setSection('duty', name, e.target.value)}
      className="h-9 bg-slate-800 border-slate-700"
    />
  );
};

const DutyPanel = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2">
      <Field label="Design oil rate (stb/d)"><NumberInput name="designRateStbd" /></Field>
      <Field label="Water cut (%)"><NumberInput name="wctPct" /></Field>
    </div>
    <Field
      label="Wellhead pressure (psia)"
      hint="The traverse that gives the discharge pressure starts here."
    >
      <NumberInput name="whp" />
    </Field>
    <Field
      label="Pump setting depth (ft TVD)"
      hint="Above the perforations. Deeper means more intake pressure and less head, but the motor has to be cooled by the flow past it."
    >
      <NumberInput name="pumpTvdFt" />
    </Field>
    <Field
      label="Annulus gradient (psi/ft)"
      hint="The column between the perforations and the intake. It carries whatever gas has broken out, so it is lighter than the produced liquid; using the liquid gradient here overstates the intake pressure and undersizes the pump."
    >
      <NumberInput name="annulusGradPsiPerFt" step="0.01" />
    </Field>

    <div className="border-t border-slate-800 pt-3 space-y-3">
      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Gas handling</p>
      <Field
        label="Intake separator efficiency (%)"
        hint="A vendor or measured number. No separator efficiency is correlated here."
      >
        <NumberInput name="separatorEfficiencyPct" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Standard stage limit (% GVF)"><NumberInput name="gvfStandardMaxPct" /></Field>
        <Field label="Gas handler limit (% GVF)"><NumberInput name="gvfHandlerMaxPct" /></Field>
      </div>
      <p className="text-[11px] text-slate-600">
        These two are operating guidance, not a correlation, which is why they are editable: below
        the first a standard stage copes, between them a gas handler is normal, above the second the
        gas has to come out ahead of the pump.
      </p>
    </div>
  </div>
);

export default DutyPanel;
