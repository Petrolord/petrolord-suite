// The gas, the parcel, the route envelopes and the counterfactual (DS10).
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useFlareToValue, GAS_REFERENCE_NOTE, ROUTE_TEMPLATE_NOTE,
} from '@/contexts/FlareToValueContext';

let cellSeq = 0;
const Cell = ({ label, value, onChange, unit, placeholder, type = 'number' }) => {
  const id = React.useMemo(() => `fv-${(cellSeq += 1)}`, []);
  const text = `${label}${unit ? ` (${unit})` : ''}`;
  return (
    <div>
      <Label htmlFor={id} className="text-[10px] text-slate-400">{text}</Label>
      <Input id={id} type={type} step={type === 'number' ? 'any' : undefined}
        value={value ?? ''} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 bg-slate-950 border-slate-700 text-xs" />
    </div>
  );
};

const Group = ({ title, children, note }) => (
  <div>
    <h2 className="text-sm font-semibold text-white mb-1">{title}</h2>
    {note && <p className="text-[10px] text-slate-500 mb-1.5">{note}</p>}
    <div className="grid grid-cols-2 gap-2">{children}</div>
  </div>
);

const FlareInputs = () => {
  const {
    inputs, setSection, setGasRow, setRoute, setRequirement,
  } = useFlareToValue();

  return (
    <div className="space-y-4">
      <Group title="The gas" note={GAS_REFERENCE_NOTE}>
        {inputs.gas.map((g) => (
          <Cell key={g.id} label={g.label} unit="mole fraction" value={g.moleFraction}
            onChange={(v) => setGasRow(g.id, { moleFraction: v })} />
        ))}
      </Group>

      <Group title="The parcel"
        note="A flare's destruction efficiency is most of its footprint and it is contested, so it is required rather than assumed. So is the methane potential, and the assessment report it came from is yours to pick.">
        <Cell label="Volume" unit="MMscfd" value={inputs.parcel.volumeMMscfd} onChange={(v) => setSection('parcel', { volumeMMscfd: v })} />
        <Cell label="On stream" unit="days/yr" value={inputs.parcel.onstreamDays} onChange={(v) => setSection('parcel', { onstreamDays: v })} />
        <Cell label="Flare destruction efficiency" unit="fraction" value={inputs.parcel.flareDestructionEfficiency} placeholder="required" onChange={(v) => setSection('parcel', { flareDestructionEfficiency: v })} />
        <Cell label="Methane GWP" value={inputs.parcel.gwpMethane} placeholder="required" onChange={(v) => setSection('parcel', { gwpMethane: v })} />
      </Group>

      <Group title="The counterfactual"
        note="No abatement is reported until this is stated. The flare's gross emission is not the abatement: recover the gas and somebody burns it, and whether that is better or worse depends entirely on what it displaces.">
        <Cell label="What the product displaces" type="text" value={inputs.counterfactual.label} placeholder="required" onChange={(v) => setSection('counterfactual', { label: v })} />
        <Cell label="Product burned" unit="tCO2e/yr" value={inputs.counterfactual.productCombustionTonnesCo2ePerYear} placeholder="required" onChange={(v) => setSection('counterfactual', { productCombustionTonnesCo2ePerYear: v })} />
        <Cell label="Fuel displaced" unit="tCO2e/yr" value={inputs.counterfactual.displacedFuelTonnesCo2ePerYear} placeholder="required" onChange={(v) => setSection('counterfactual', { displacedFuelTonnesCo2ePerYear: v })} />
      </Group>

      <div>
        <h2 className="text-sm font-semibold text-white mb-1">The routes</h2>
        <p className="text-[10px] text-slate-500 mb-1.5">{ROUTE_TEMPLATE_NOTE}</p>
        {inputs.routes.map((r) => (
          <div key={r.id} className="rounded border border-slate-800 bg-slate-900/60 p-2 mb-2">
            <p className="text-[11px] font-medium text-slate-200 mb-1.5">{r.label}</p>
            <div className="grid grid-cols-2 gap-2">
              {r.requirements.map((q) => (
                <Cell key={q.key} label={`${r.label} ${q.label}`} unit={q.unit}
                  value={q.limit} placeholder="unset"
                  onChange={(v) => setRequirement(r.id, q.key, v)} />
              ))}
              <Cell label={`${r.label} yield`} unit={`${r.productUnitLabel}/Mscf`} value={r.productUnitPerMscf} onChange={(v) => setRoute(r.id, { productUnitPerMscf: v })} />
              <Cell label={`${r.label} recovery`} unit="fraction" value={r.recoveryFraction} onChange={(v) => setRoute(r.id, { recoveryFraction: v })} />
              <Cell label={`${r.label} price`} unit={`per ${r.productUnitLabel}`} value={r.pricePerProductUnit} onChange={(v) => setRoute(r.id, { pricePerProductUnit: v })} />
              <Cell label={`${r.label} reference capex`} value={r.referenceCapitalCost} onChange={(v) => setRoute(r.id, { referenceCapitalCost: v })} />
              <Cell label={`${r.label} reference capacity`} unit="MMscfd" value={r.referenceCapacityMMscfd} onChange={(v) => setRoute(r.id, { referenceCapacityMMscfd: v })} />
              <Cell label={`${r.label} fixed opex`} unit="/yr" value={r.fixedOpexPerYear} onChange={(v) => setRoute(r.id, { fixedOpexPerYear: v })} />
            </div>
          </div>
        ))}
      </div>

      <Group title="Carbon credits"
        note="Whether the project needs credits is a different question from what they are worth, and it is the one a bid turns on.">
        <Cell label="Credit prices" type="text" value={inputs.credits.prices} onChange={(v) => setSection('credits', { prices: v })} />
        <Cell label="Hurdle margin" unit="/yr" value={inputs.credits.hurdleMarginPerYear} onChange={(v) => setSection('credits', { hurdleMarginPerYear: v })} />
        <div>
          <Label htmlFor="fv-route" className="text-[10px] text-slate-400">Route the credits apply to</Label>
          <select id="fv-route" value={inputs.credits.appliesToRouteId}
            onChange={(e) => setSection('credits', { appliesToRouteId: e.target.value })}
            className="h-7 w-full rounded bg-slate-950 border border-slate-700 text-xs px-2 text-white">
            {inputs.routes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
      </Group>
    </div>
  );
};

export default FlareInputs;
