// KO drum and radiation tabs: inputs (left) and results (main).
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRelief } from '@/contexts/ReliefStudioContext';
import { fmt, Stat, ErrorNote, Field, NumberInput, WarnNote } from './fields';

export const DrumInputs = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2">
      <Field label="Vapor rate (MMscfd)"><NumberInput section="drum" name="qVaporMMscfd" step="0.1" /></Field>
      <Field label="Drum pressure (psia)"><NumberInput section="drum" name="pPsia" /></Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Temperature (F)"><NumberInput section="drum" name="tF" /></Field>
      <Field label="Gas gravity"><NumberInput section="drum" name="gasSg" step="0.01" /></Field>
    </div>
    <Field label="Droplet to stop (micron)" hint="API 521 practice sizes flare drums for 300 to 600 micron.">
      <NumberInput section="drum" name="dropletMicron" />
    </Field>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Liquid density (lb/ft3)"><NumberInput section="drum" name="rhoLLbFt3" step="0.1" /></Field>
      <Field label="Vapor density (lb/ft3)" hint="Leave blank for ideal gas at drum conditions.">
        <NumberInput section="drum" name="rhoVLbFt3" step="0.01" />
      </Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Vapor viscosity (cp)"><NumberInput section="drum" name="muVCp" step="0.001" /></Field>
      <Field label="Drum diameter (ft)"><NumberInput section="drum" name="diameterFt" step="0.5" /></Field>
    </div>
    <Field label="Liquid holdup fraction"><NumberInput section="drum" name="liquidFraction" step="0.05" /></Field>
  </div>
);

export const DrumResults = () => {
  const { drum } = useRelief();
  if (drum.error) return <ErrorNote>{drum.error}</ErrorNote>;
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Knockout drum (horizontal)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Dropout velocity" value={fmt(drum.udFtS, 2)} unit="ft/s"
            hint={`drag C = ${fmt(drum.dragC, 2)}, iterated`} />
          <Stat label="Vapor velocity" value={fmt(drum.vVaporFtS, 2)} unit="ft/s" />
          <Stat label="Required length" value={fmt(drum.requiredLengthFt, 1)} unit="ft" />
          <Stat label="L/D" value={fmt(drum.ld, 2)}
            accent={drum.ld > 6 || drum.ld < 2 ? 'text-amber-400' : 'text-emerald-400'} />
        </div>
        {drum.note && <WarnNote>{drum.note}</WarnNote>}
        <p className="text-[12px] text-slate-500">
          The droplet must fall across the vapor space before the gas carries it the length of the
          drum. Change the diameter and read the length it demands; the L/D column is the judgment.
        </p>
      </CardContent>
    </Card>
  );
};

export const RadiationInputs = () => {
  const { inputs, setSection, radiationLevels } = useRelief();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Relief rate (lb/hr)"><NumberInput section="radiation" name="reliefWLbHr" /></Field>
        <Field label="LHV (Btu/lb)"><NumberInput section="radiation" name="lhvBtuLb" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Fraction radiated" hint="0.2 to 0.4 typical; fuel and tip dependent.">
          <NumberInput section="radiation" name="fractionRadiated" step="0.01" />
        </Field>
        <Field label="Transmissivity"><NumberInput section="radiation" name="transmissivity" step="0.01" /></Field>
      </div>
      <Field label="Distance to check (m)"><NumberInput section="radiation" name="distanceM" /></Field>
      <Field label="Allowable intensity">
        <Select value={inputs.radiation.allowableKwM2} onValueChange={(v) => setSection('radiation', 'allowableKwM2', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            {radiationLevels.map((l) => (
              <SelectItem key={l.kWm2} value={String(l.kWm2)}>{l.kWm2} kW/m2: {l.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
};

export const RadiationResults = () => {
  const { radiation, inputs } = useRelief();
  if (radiation.error) return <ErrorNote>{radiation.error}</ErrorNote>;
  const allowable = parseFloat(inputs.radiation.allowableKwM2);
  const over = radiation.kWm2 > allowable;
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Flare radiation (API 521 point source)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Heat release" value={fmt(radiation.qKw / 1000, 1)} unit="MW" />
          <Stat label="At the stated distance" value={fmt(radiation.kWm2, 2)} unit="kW/m2"
            accent={over ? 'text-red-400' : 'text-emerald-400'}
            hint={over ? 'above the allowable' : 'inside the allowable'} />
          <Stat label="Distance the allowable demands" value={fmt(radiation.requiredDistanceM, 0)} unit="m"
            hint="the same model inverted; a stack height or a sterile radius buys this" />
        </div>
        <p className="text-[12px] text-slate-500">
          The point-source model ignores flame length and wind tilt, so treat it as a screening
          answer: adequate for a first stack height, not for a detail design near the limits.
        </p>
      </CardContent>
    </Card>
  );
};
