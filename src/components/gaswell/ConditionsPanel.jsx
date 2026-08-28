// Producing conditions and the liquid the well is carrying (left rail).
//
// Interfacial tension and liquid density are the two numbers the whole
// loading calculation turns on, and neither is a function of anything
// the studio knows. Water and condensate differ by a factor of three
// in tension, so they are picked and then editable, never inferred.
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useGasWell } from '@/contexts/GasWellPerformanceContext';
import { Field, NumberInput } from './fields';

const ConditionsPanel = () => {
  const {
    inputs, setSection, applyFluidPreset, turnerFluids, guidance,
  } = useGasWell();
  const c = inputs.conditions;

  return (
    <div className="space-y-4">
      <Field
        label="Wellhead pressure (psia)"
        hint="The gas column is marched down from here, and the node is solved against it."
      >
        <NumberInput section="conditions" name="whp" />
      </Field>
      <Field label="Gas gravity (air = 1)">
        <NumberInput section="conditions" name="gasSg" step="0.01" />
      </Field>

      <div className="border-t border-slate-800 pt-3 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
          The liquid being carried
        </p>
        <Field
          label="Liquid"
          hint="Turner's own values, offered as a starting point. Both numbers stay editable, because neither is a correlation."
        >
          <Select value={c.fluidPreset} onValueChange={applyFluidPreset}>
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              {turnerFluids.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tension (dyne/cm)"><NumberInput section="conditions" name="sigmaDyneCm" /></Field>
          <Field label="Density (lb/ft3)"><NumberInput section="conditions" name="rhoLiquidLbFt3" /></Field>
        </div>
        <p className="text-[11px] text-slate-600">
          Condensate holds together far less well than water, so a well making condensate can run
          slower before it loads. Getting this the wrong way round flags healthy wells.
        </p>
      </div>

      <div className="border-t border-slate-800 pt-3 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Correlation</p>
        <Field label="Critical velocity">
          <Select value={c.correlation} onValueChange={(v) => setSection('conditions', 'correlation', v)}>
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              <SelectItem value="auto">Choose by wellhead pressure</SelectItem>
              <SelectItem value="turner">Turner (with the 20 percent adjustment)</SelectItem>
              <SelectItem value="coleman">Coleman (unadjusted)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <p className="text-[11px] text-slate-600">{guidance.reason}</p>
        <p className="text-[11px] text-slate-600">
          They are one equation and one factor: Turner adjusted his theoretical velocity up 20
          percent to match field data, and Coleman, on low-pressure wells, found none was needed.
        </p>
      </div>
    </div>
  );
};

export default ConditionsPanel;
