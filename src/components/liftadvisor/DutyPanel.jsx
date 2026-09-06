// What the well is being asked to do, and what the facility can supply
// (left rail).
//
// The split matters. The duty and the facility are NOT properties of
// the well, so neither is ever written to the shared well record: a
// target rate is a decision and a compressor is a facility, while the
// record holds only what the well is.
import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useLiftAdvisor } from '@/contexts/LiftAdvisorContext';
import { Field, NumberInput, fmt } from './fields';

const Toggle = ({ id, label, hint }) => {
  const { inputs, setSection } = useLiftAdvisor();
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={id}
        checked={!!inputs.facility[id]}
        onCheckedChange={(v) => setSection('facility', id, !!v)}
      />
      <div>
        <Label htmlFor={id} className="text-xs text-slate-400">{label}</Label>
        {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
      </div>
    </div>
  );
};

const DutyPanel = () => {
  const { model, inputs } = useLiftAdvisor();
  const aof = model?.ipr?.qmax;
  // The rate at this door is LIQUID and the open flow is OIL (item 19),
  // so the two are only comparable through the water cut.
  const wctPct = Math.min(Math.max(parseFloat(inputs.duty.wctPct) || 0, 0), 99.9);

  return (
    <div className="space-y-4">
      <Field
        label="Target liquid rate (bbl/d)"
        hint={Number.isFinite(aof)
          ? `Oil plus water. This inflow's absolute open flow is ${fmt(aof)} stb/d of OIL, so at ${fmt(wctPct, 0)} percent water cut the most liquid it can deliver is about ${fmt(aof / Math.max(1 - wctPct / 100, 1e-6))} bbl/d. No lift method makes a well give more than it can deliver.`
          : 'Oil plus water: what you want the well to make.'}
      >
        <NumberInput section="duty" name="targetRateStbd" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Water cut (%)"><NumberInput section="duty" name="wctPct" /></Field>
        <Field label="Wellhead pressure (psia)"><NumberInput section="duty" name="whp" /></Field>
      </div>

      <div className="border-t border-slate-800 pt-3 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
          The facility
        </p>
        <p className="text-[11px] text-slate-600">
          None of this belongs to the well, so none of it is written to the shared well record. A
          compressor is a facility; a target rate is a decision.
        </p>
        <Toggle id="powerAvailable" label="Electrical supply at the wellsite" />
        <Toggle id="gasAvailable" label="Injection gas and compression" />
        <Toggle id="isOffshore" label="Offshore" hint="Deck space and intervention cost drive the choice hard." />
        <Toggle id="hasSand" label="Produces sand" />
        <Toggle id="isHorizontal" label="Horizontal completion" />
      </div>

      {inputs.facility.gasAvailable && (
        <div className="border-t border-slate-800 pt-3 space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
            Injection gas
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Surface pressure (psig)"><NumberInput section="facility" name="injectionPsig" /></Field>
            <Field label="Rate available (Mscf/d)"><NumberInput section="facility" name="injectionMscfd" /></Field>
          </div>
          <Field label="Injection gas gravity"><NumberInput section="facility" name="injGasSg" step="0.01" /></Field>
        </div>
      )}

      <div className="border-t border-slate-800 pt-3 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
          Equipment assumptions
        </p>
        <p className="text-[11px] text-slate-600">
          A screening-grade pass has to choose equipment before it can design anything. These are
          the defaults it starts from; every result names what it actually used, and the studio
          links design the thing properly.
        </p>
        <Field label="Intake separator efficiency (%)" hint="ESP">
          <NumberInput section="facility" name="separatorEfficiencyPct" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Casing pressure (psia)" hint="plunger"><NumberInput section="facility" name="casingPressurePsia" /></Field>
          <Field label="Slug length (ft)" hint="plunger"><NumberInput section="facility" name="slugLengthFt" /></Field>
        </div>
      </div>
    </div>
  );
};

export default DutyPanel;
