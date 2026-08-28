// Motor and cable inputs (left rail, Electrical tab). The nameplate is
// typed off the motor being run; the frame list only fills the three
// numbers so a sizing run has somewhere to start.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
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
      value={inputs.motor[name] ?? ''}
      onChange={(e) => setSection('motor', name, e.target.value)}
      className="h-9 bg-slate-800 border-slate-700"
    />
  );
};

const MotorCablePanel = () => {
  const { inputs, motorFrames, applyMotorFrame } = useEsp();

  return (
    <div className="space-y-4">
      <Field
        label="Start from a motor frame"
        hint="Common submersible nameplate combinations. Selecting one fills the three numbers below; all of them stay editable."
      >
        <Select value={inputs.motor.motorFrameId} onValueChange={applyMotorFrame}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
            {motorFrames.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.hp} hp, {m.volts} V, {m.amps} A ({m.seriesOdIn} in)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="grid grid-cols-3 gap-2">
        <Field label="Nameplate hp"><NumberInput name="nameplateHp" /></Field>
        <Field label="Volts"><NumberInput name="nameplateVolts" /></Field>
        <Field label="Amps"><NumberInput name="nameplateAmps" /></Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Motor efficiency (%)"><NumberInput name="motorEfficiencyPct" /></Field>
        <Field label="Power factor"><NumberInput name="powerFactor" step="0.01" /></Field>
      </div>

      <div className="border-t border-slate-800 pt-3 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Cable</p>
        <Field
          label="Cable length (ft)"
          hint="Measured depth to the motor plus the surface run to the switchboard."
        >
          <NumberInput name="cableLengthFt" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Average cable temp (F)"><NumberInput name="cableTempF" /></Field>
          <Field label="Max voltage drop (%)"><NumberInput name="maxDropPct" /></Field>
        </div>
        <p className="text-[11px] text-slate-600">
          Conductor resistance is the published copper value with the standard temperature
          correction. Ampacity belongs to the insulation system and the well temperature, so it is
          a manufacturer number and is not assumed here.
        </p>
      </div>
    </div>
  );
};

export default MotorCablePanel;
