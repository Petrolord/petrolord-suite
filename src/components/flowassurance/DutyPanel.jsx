// What the well is doing today, and what the choke does to it.
//
// This is DUTY, not the well: a rate, a water cut and a wellhead
// pressure are what the well was flowing on the day, so they stay with
// the study rather than going into the shared per-well record (P6.5).
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useFlowAssurance } from '@/contexts/FlowAssuranceContext';
import { Field, NumberInput, fmt } from './fields';

const DutyPanel = () => {
  const { inputs, setSection, model, analysis } = useFlowAssurance();
  const isGas = model?.phase === 'gas';
  const choke = analysis?.choke;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Producing rate</p>
        {isGas ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Gas rate (Mscf/d)"><NumberInput section="duty" name="qgMscfd" /></Field>
            <Field label="Water-gas ratio (bbl/MMscf)"><NumberInput section="duty" name="wgr" /></Field>
            <Field label="Condensate-gas ratio (bbl/MMscf)"><NumberInput section="duty" name="cgr" /></Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Oil rate (stb/d)"><NumberInput section="duty" name="qoStbd" /></Field>
            <Field label="Water cut (%)"><NumberInput section="duty" name="wctPct" /></Field>
            <Field label="Gas-oil ratio (scf/stb)"><NumberInput section="duty" name="gor" /></Field>
          </div>
        )}
        <Field
          label="Wellhead pressure (psia)"
          hint="Where the trace starts on the surface side. The wellbore is marched down from here to the perforations."
        >
          <NumberInput section="duty" name="whpPsia" />
        </Field>
      </div>

      <div className="border-t border-slate-800 pt-3 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">The choke</p>
        <Field
          label="Downstream pressure (psia)"
          hint="The flowline inlet. The drop across the bean is what cools the fluid."
        >
          <NumberInput section="choke" name="pDownPsia" />
        </Field>
        <Field
          label="Joule-Thomson coefficient (F per psi)"
          hint="A flash property, not a constant. Roughly 0.02 to 0.08 for natural gas; near zero, occasionally slightly negative, for a liquid. Nothing here guesses it for you, because it is the single number that decides whether the wellhead sits inside the hydrate region."
        >
          <NumberInput section="choke" name="jtCoeffFPerPsi" step="0.001" />
        </Field>
        {choke?.ok && (
          <p className="text-[11px] text-cyan-300">
            {fmt(choke.dpPsi)} psi across the bean cools the stream {fmt(choke.coolingF, 1)} F, to{' '}
            {fmt(choke.tDownF, 1)} F.
          </p>
        )}
        {choke && !choke.ok && (
          <p className="text-[11px] text-rose-400">{choke.error}</p>
        )}
      </div>

      <div className="border-t border-slate-800 pt-3 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Fluid heat capacity</p>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Oil"><NumberInput section="thermal" name="cpOil" step="0.01" /></Field>
          <Field label="Water"><NumberInput section="thermal" name="cpWater" step="0.01" /></Field>
          <Field label="Gas"><NumberInput section="thermal" name="cpGas" step="0.01" /></Field>
        </div>
        <p className="text-[11px] text-slate-600">
          Btu/lb-F. Mixed by mass, which is exact; only the three components are representative.
          Override them if you have real numbers.
        </p>
        {analysis?.mass?.ok && (
          <p className="text-[11px] text-slate-500">
            {fmt(analysis.mass.massRateLbHr)} lb/hr at a mixture heat capacity of{' '}
            {fmt(analysis.mass.cpBtuLbF, 3)} Btu/lb-F.
          </p>
        )}
      </div>

      <div className="border-t border-slate-800 pt-3 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Hydrate boundary</p>
        <Field
          label="Gas gravity for the boundary"
          hint="Blank uses the well record's gas gravity. Override it if the hydrate curve was matched to a different one."
        >
          <NumberInput section="hydrate" name="gasSg" step="0.01" />
        </Field>
        <Field
          label="Wax appearance temperature (F)"
          hint="MEASURED only. There is no wax correlation in this studio: a WAT from an API gravity would be a fiction dressed as an answer. Leave it blank and the wax question is not answered."
        >
          <NumberInput section="hydrate" name="watF" />
        </Field>
      </div>

      <div className="border-t border-slate-800 pt-3 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Inhibitor</p>
        <Field label="Inhibitor">
          <Select
            value={inputs.inhibitor.inhibitorId}
            onValueChange={(v) => setSection('inhibitor', 'inhibitorId', v)}
          >
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              <SelectItem value="methanol">Methanol</SelectItem>
              <SelectItem value="meg">Monoethylene glycol (MEG)</SelectItem>
              <SelectItem value="deg">Diethylene glycol (DEG)</SelectItem>
              <SelectItem value="teg">Triethylene glycol (TEG)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Safety margin (F)"><NumberInput section="inhibitor" name="safetyMarginF" /></Field>
          <Field
            label="Lean strength (wt %)"
            hint="Recovered MEG comes back at 80 to 90."
          >
            <NumberInput section="inhibitor" name="leanWtPct" />
          </Field>
        </div>
        <Field
          label="Water rate (bbl/d)"
          hint="Blank uses the produced water from the duty above. The dose is a mass balance on the aqueous phase, so this is the number it balances against."
        >
          <NumberInput section="inhibitor" name="waterRateBpd" />
        </Field>
      </div>
    </div>
  );
};

export default DutyPanel;
