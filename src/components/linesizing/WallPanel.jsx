// Wall tab: Barlow under the code's design factors, and the same
// equation read the other way as an MAOP of the wall you actually have.
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLineSizing } from '@/contexts/LineSizingContext';
import { fmt, Stat, ErrorNote, Field, NumberInput } from './fields';

const WallInputs = () => {
  const { inputs, setSection } = useLineSizing();
  const isB318 = inputs.wall.code === 'B31.8';
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Outside diameter (in)"><NumberInput section="wall" name="odIn" step="0.001" /></Field>
        <Field label="Design pressure (psig)"><NumberInput section="wall" name="designPsig" /></Field>
      </div>
      <Field label="SMYS (psi)" hint="X52 is 52,000; B is 35,000."><NumberInput section="wall" name="smysPsi" /></Field>
      <Field label="Design code">
        <Select value={inputs.wall.code} onValueChange={(v) => setSection('wall', 'code', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="B31.4">B31.4 (liquid lines, F = 0.72)</SelectItem>
            <SelectItem value="B31.8">B31.8 (gas lines, location classes)</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {isB318 && (
        <Field
          label="Location class"
          hint="The class is about who lives near the line. Assuming Class 1 near a school is the mistake the classes exist to prevent."
        >
          <Select value={inputs.wall.locationClass} onValueChange={(v) => setSection('wall', 'locationClass', v)}>
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Class 1 (F = 0.72)</SelectItem>
              <SelectItem value="2">Class 2 (F = 0.60)</SelectItem>
              <SelectItem value="3">Class 3 (F = 0.50)</SelectItem>
              <SelectItem value="4">Class 4 (F = 0.40)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Joint factor E"><NumberInput section="wall" name="jointFactor" step="0.01" /></Field>
        <Field label="Temp derate T"><NumberInput section="wall" name="tempDerate" step="0.001" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Corrosion allowance (in)"><NumberInput section="wall" name="corrosionAllowanceIn" step="0.001" /></Field>
        <Field label="Actual wall (in)"><NumberInput section="wall" name="actualWallIn" step="0.001" /></Field>
      </div>
    </div>
  );
};

const WallResults = () => {
  const { wall } = useLineSizing();
  if (wall.error) return <ErrorNote>{wall.error}</ErrorNote>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Design factor" value={fmt(wall.designFactor, 2)} />
        <Stat label="Pressure wall" value={fmt(wall.tPressureIn, 4)} unit="in" />
        <Stat label="Required wall" value={fmt(wall.tRequiredIn, 4)} unit="in" hint="corrosion allowance included" />
        <Stat
          label="Verdict"
          value={wall.pass === null ? 'enter a wall' : wall.pass ? 'ADEQUATE' : 'TOO THIN'}
          accent={wall.pass === null ? 'text-slate-400' : wall.pass ? 'text-emerald-400' : 'text-red-400'}
        />
      </div>
      {wall.maop !== null && (
        <Stat label="MAOP of the stated wall" value={fmt(wall.maop, 0)} unit="psig"
          hint="the same Barlow read the other way, net of corrosion allowance" />
      )}
      {wall.maopError && <ErrorNote>{wall.maopError}</ErrorNote>}
    </div>
  );
};

const WallPanel = () => (
  <Card className="bg-slate-900/60 border-slate-800">
    <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Wall thickness and MAOP</CardTitle></CardHeader>
    <CardContent><WallResults /></CardContent>
  </Card>
);

export { WallInputs };
export default WallPanel;
