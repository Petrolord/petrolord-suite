// The bean and the line it flows into (left rail).
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useChoke } from '@/contexts/ChokePerformanceContext';
import { Field, NumberInput } from './fields';

const ChokePanel = () => {
  const {
    inputs, setSection, model, chokeCoeffs, fitted, applyCPreset, erosionalPresets,
  } = useChoke();
  const isGas = model?.phase === 'gas';

  return (
    <div className="space-y-4">
      <Field
        label="Bean size (64ths)"
        hint="A 32/64 bean is half an inch. The Performance tab sizes it for a target rate."
      >
        <NumberInput section="choke" name="s64" />
      </Field>
      <Field
        label="Downstream pressure (psia)"
        hint="The flowline or separator the choke discharges into. It is what decides whether the flow is still critical."
      >
        <NumberInput section="choke" name="pDownstream" />
      </Field>

      {isGas ? (
        <div className="border-t border-slate-800 pt-3 space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Gas</p>
          <Field label="Gas gravity (air = 1)"><NumberInput section="choke" name="gasSg" step="0.01" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Heat capacity ratio k"><NumberInput section="choke" name="k" step="0.01" /></Field>
            <Field label="Discharge coefficient"><NumberInput section="choke" name="cd" step="0.01" /></Field>
          </div>
          <Field label="Hydrate margin wanted (F)" hint="How far above the screening hydrate temperature you want to stay.">
            <NumberInput section="choke" name="hydrateMarginF" />
          </Field>
          <p className="text-[11px] text-slate-600">
            The gas choke carries its own critical ratio from the heat capacity ratio, so sonic and
            subsonic are decided thermodynamically rather than by a rule of thumb.
          </p>
        </div>
      ) : (
        <div className="border-t border-slate-800 pt-3 space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Produced fluid</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Gas-liquid ratio (scf/stb)"><NumberInput section="choke" name="glr" /></Field>
            <Field label="Water cut (%)"><NumberInput section="choke" name="wctPct" /></Field>
          </div>
          <Field
            label="Correlation"
            hint="The five published sets span a factor of twelve in their leading constant. They are not interchangeable."
          >
            <Select
              value={inputs.choke.correlation}
              onValueChange={(v) => setSection('choke', 'correlation', v)}
            >
              <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                {Object.entries(chokeCoeffs).map(([id, k]) => (
                  <SelectItem key={id} value={id}>
                    {id.charAt(0).toUpperCase() + id.slice(1)} (c {k.c}, m {k.m}, n {k.n})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-start gap-2">
            <Checkbox
              id="useFitted"
              checked={inputs.choke.useFitted}
              onCheckedChange={(v) => setSection('choke', 'useFitted', !!v)}
              disabled={!fitted?.ok}
            />
            <div>
              <Label htmlFor="useFitted" className="text-xs text-slate-400">
                Use the coefficients fitted to this well
              </Label>
              <p className="text-[11px] text-slate-600">
                {fitted?.ok
                  ? `c ${fitted.c.toFixed(2)}, m ${fitted.m.toFixed(3)}, n ${fitted.n.toFixed(3)} from ${fitted.points.length} test${fitted.points.length === 1 ? '' : 's'}.`
                  : 'Fit one on the Coefficients tab first.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-slate-800 pt-3 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Flowline</p>
        <Field label="Inside diameter (in)"><NumberInput section="wellhead" name="flowlineIdIn" step="0.01" /></Field>
        <Field
          label="Erosional service"
          hint="RP 14E is explicit that its own C values are conservative and allows higher where the fluid is clean and corrosion is controlled."
        >
          <Select value={inputs.wellhead.cPreset} onValueChange={applyCPreset}>
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              {erosionalPresets.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label} (C = {p.c})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="C factor"><NumberInput section="wellhead" name="cFactor" /></Field>
      </div>
    </div>
  );
};

export default ChokePanel;
