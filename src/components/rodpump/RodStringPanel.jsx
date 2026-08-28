// Rod string inputs (left rail, Rod String tab). A taper is typed as
// "size, length" per line, top section first, and the sizes are read as
// the fractions they are.
import React, { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useRodPump } from '@/contexts/RodPumpDesignContext';
import { Field, NumberInput } from './fields';

const RodStringPanel = () => {
  const { inputs, setSection, rodGrades, rodSizes, string, proposeTaper } = useRodPump();
  const [taperSizes, setTaperSizes] = useState('7/8,3/4');

  return (
    <div className="space-y-4">
      <Field label="Rod grade">
        <Select value={inputs.rods.gradeId} onValueChange={(v) => setSection('rods', 'gradeId', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
            {rodGrades.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.label} ({g.minTensilePsi.toLocaleString()} psi minimum tensile)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        label="Service factor"
        hint="Multiplies the modified Goodman allowable. It stands for the fluid, the corrosion and your own practice, so there is no default that could stand in for knowing it."
      >
        <NumberInput section="rods" name="serviceFactor" step="0.05" />
      </Field>

      <Field
        label="Taper (size, length in feet)"
        hint="One section per line, heaviest at the top. Sizes are read as fractions: 7/8 is seven eighths of an inch."
      >
        <Textarea
          rows={5}
          value={inputs.rods.sectionsText}
          onChange={(e) => setSection('rods', 'sectionsText', e.target.value)}
          className="bg-slate-800 border-slate-700 font-mono text-xs"
        />
      </Field>

      <div className="rounded-md border border-slate-800 bg-slate-950/40 p-2 space-y-2">
        <p className="text-[11px] text-slate-500">
          Propose lengths for these sizes so every section carries the same peak stress:
        </p>
        <div className="flex gap-2">
          <Select value={taperSizes} onValueChange={setTaperSizes}>
            <SelectTrigger className="h-8 bg-slate-800 border-slate-700 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              <SelectItem value="7/8">7/8 only</SelectItem>
              <SelectItem value="7/8,3/4">7/8 and 3/4</SelectItem>
              <SelectItem value="1,7/8,3/4">1, 7/8 and 3/4</SelectItem>
              <SelectItem value="7/8,3/4,5/8">7/8, 3/4 and 5/8</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm" variant="outline" className="h-8 shrink-0"
            onClick={() => proposeTaper(taperSizes.split(','))}
          >
            <Wand2 className="w-3 h-3 mr-1" /> Propose
          </Button>
        </div>
      </div>

      {string?.ok && (
        <div className="border-t border-slate-800 pt-3 space-y-1">
          <p className="text-[11px] text-slate-500">
            {string.sections.length} section{string.sections.length === 1 ? '' : 's'},{' '}
            {Math.round(string.lengthFt).toLocaleString()} ft,{' '}
            {Math.round(string.weightAirLb).toLocaleString()} lb in air and{' '}
            {Math.round(string.weightFluidLb).toLocaleString()} lb buoyed.
          </p>
          <p className="text-[11px] text-slate-600">
            Stiffness {string.krLbPerIn.toFixed(1)} lb/in. Available sizes:{' '}
            {rodSizes.map((r) => r.label).join(', ')}.
          </p>
        </div>
      )}
      {string && !string.ok && (
        <div className="rounded-md border border-amber-900/60 bg-amber-950/30 p-2">
          <ul className="text-[11px] text-amber-200/80 space-y-1 list-disc pl-4">
            {string.errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}
      {string?.warnings?.length > 0 && (
        <div className="rounded-md border border-amber-900/60 bg-amber-950/30 p-2">
          {string.warnings.map((w) => (
            <p key={w.code} className="text-[11px] text-amber-200/80">{w.message}</p>
          ))}
        </div>
      )}
    </div>
  );
};

export default RodStringPanel;
