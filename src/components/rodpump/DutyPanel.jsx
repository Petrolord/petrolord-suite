// The duty (left rail): the rate this installation is being sized for
// and the conditions the pump sees at depth.
import React from 'react';
import { Field, NumberInput } from './fields';

const DutyPanel = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2">
      <Field label="Design oil rate (stb/d)"><NumberInput section="duty" name="designRateStbd" /></Field>
      <Field label="Water cut (%)"><NumberInput section="duty" name="wctPct" /></Field>
    </div>
    <Field
      label="Wellhead pressure (psia)"
      hint="Adds to the fluid load, because the plunger has to lift the column and push against this."
    >
      <NumberInput section="duty" name="whp" />
    </Field>
    <Field
      label="Pump setting depth (ft TVD)"
      hint="Above the perforations. Deeper gives more submergence and better fillage, at the cost of a longer, heavier rod string."
    >
      <NumberInput section="duty" name="pumpTvdFt" />
    </Field>
    <Field
      label="Annulus gradient (psi/ft)"
      hint="The column between the perforations and the intake. It carries whatever gas has broken out, so it is lighter than the produced liquid; using the liquid gradient here overstates the submergence."
    >
      <NumberInput section="duty" name="annulusGradPsiPerFt" step="0.01" />
    </Field>

    <div className="border-t border-slate-800 pt-3 space-y-3">
      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Pump</p>
      <Field
        label="Gas anchor efficiency (%)"
        hint="Free gas the anchor sends up the annulus instead of into the barrel. A vendor or measured number: no separator efficiency is correlated here."
      >
        <NumberInput section="duty" name="separatorEfficiencyPct" />
      </Field>
      <Field
        label="Volumetric efficiency (%)"
        hint="Slippage past the plunger and shrinkage on the way to the tank. Measured, not modelled."
      >
        <NumberInput section="duty" name="pumpEfficiencyPct" />
      </Field>
    </div>
  </div>
);

export default DutyPanel;
