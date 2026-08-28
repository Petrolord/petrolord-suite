// Surface unit and pump size (left rail). The geometry is either a
// GENERIC conventional linkage scaled to the stroke, or the dimensions
// typed off a real unit's drawing. There is no list of named units with
// dimensions behind them, because those dimensions are manufacturer
// data and differ between makers for the same API designation.
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useRodPump } from '@/contexts/RodPumpDesignContext';
import { Field, NumberInput } from './fields';

const UnitPanel = () => {
  const { inputs, setSection, plungerSizes, unit } = useRodPump();
  const u = inputs.unit;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Stroke length (in)"><NumberInput section="unit" name="strokeIn" /></Field>
        <Field label="Pumping speed (spm)"><NumberInput section="unit" name="spm" step="0.1" /></Field>
      </div>

      <Field label="Plunger diameter (in)">
        <Select
          value={String(u.plungerDIn)}
          onValueChange={(v) => setSection('unit', 'plungerDIn', v)}
        >
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
            {plungerSizes.map((d) => (
              <SelectItem key={d} value={String(d)}>{d} in</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        label="Unit designation"
        hint="Parsed for the three ratings a design is checked against: gearbox torque, structural capacity and stroke."
      >
        <Input
          value={u.unitDesignation}
          onChange={(e) => setSection('unit', 'unitDesignation', e.target.value)}
          placeholder="C-228D-200-74"
          className="h-9 bg-slate-800 border-slate-700"
        />
      </Field>

      <Field label="Beam geometry">
        <Select value={u.unitSource} onValueChange={(v) => setSection('unit', 'unitSource', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
            <SelectItem value="generic">Generic conventional, scaled to the stroke</SelectItem>
            <SelectItem value="dimensions">Dimensions off the unit drawing</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {u.unitSource === 'generic' ? (
        <p className="text-[11px] text-slate-600">
          A self-consistent conventional four-bar that achieves the stroke above. It is not any
          manufacturer's unit and carries no dimensions from one. For a real design, enter the
          measurements from the unit's own drawing.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="A: saddle to polished rod"><NumberInput section="unit" name="aIn" /></Field>
            <Field label="C: saddle to equalizer"><NumberInput section="unit" name="cIn" /></Field>
            <Field label="P: pitman"><NumberInput section="unit" name="pIn" /></Field>
            <Field label="R: crank radius"><NumberInput section="unit" name="rIn" /></Field>
            <Field label="Crank behind saddle"><NumberInput section="unit" name="crankBehindIn" /></Field>
            <Field label="Crank below saddle"><NumberInput section="unit" name="crankBelowIn" /></Field>
          </div>
          <p className="text-[11px] text-slate-600">
            All in inches. The stroke is then whatever this linkage actually produces, which is the
            point of entering it.
          </p>
        </>
      )}

      {unit && !unit.ok && (
        <div className="rounded-md border border-amber-900/60 bg-amber-950/30 p-2">
          <p className="text-[11px] text-amber-300 flex items-start gap-1">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {unit.error}
          </p>
        </div>
      )}
      {unit?.ok && (
        <p className="text-[11px] text-slate-600">
          This linkage gives a {unit.kin.strokeIn.toFixed(1)} in stroke and spends{' '}
          {(unit.kin.upstrokeFraction * 100).toFixed(1)} percent of each revolution on the upstroke.
          A conventional unit is never the even 50 percent a sine wave would give.
        </p>
      )}

      <div className="border-t border-slate-800 pt-3 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Solver</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Structural unbalance (lb)"><NumberInput section="unit" name="structuralUnbalanceLb" /></Field>
          <Field label="Crank offset (deg)"><NumberInput section="unit" name="crankOffsetDeg" /></Field>
        </div>
        <Field
          label="Damping ratio"
          hint="Fraction of critical for the string's fundamental. It stands for drag on the rods and the fluid they move through, so it is calibrated against a measured card rather than derived. Field strings sit between about 0.05 and 0.15."
        >
          <NumberInput section="unit" name="dampingRatio" step="0.01" />
        </Field>
      </div>
    </div>
  );
};

export default UnitPanel;
