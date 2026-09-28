// The gas, the parcel, the route envelopes and the counterfactual (DS10).
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  useFlareToValue, GAS_REFERENCE_NOTE, ROUTE_TEMPLATE_NOTE,
} from '@/contexts/FlareToValueContext';

let cellSeq = 0;
// FLARE-T1-002: inside a route's own card the visible label drops the route
// name (it read "Compressed natural gas Minimum volume" on three lines);
// `scope` keeps the full name as the input's accessible label.
const Cell = ({ label, value, onChange, unit, placeholder, type = 'number', scope }) => {
  const id = React.useMemo(() => `fv-${(cellSeq += 1)}`, []);
  const text = `${label}${unit ? ` (${unit})` : ''}`;
  return (
    <div>
      <Label htmlFor={id} className="text-[10px] text-pl-muted">{text}</Label>
      <Input id={id} type={type} step={type === 'number' ? 'any' : undefined}
        aria-label={scope ? `${scope} ${text}` : undefined}
        value={value ?? ''} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 text-xs" />
    </div>
  );
};

const Group = ({ title, children, note }) => (
  <div>
    <h2 className="text-sm font-semibold text-pl-text mb-1">{title}</h2>
    {note && <p className="text-[10px] text-pl-muted mb-1.5">{note}</p>}
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
        note="A flare's destruction efficiency is most of its footprint and it is contested, so it is required rather than assumed. So is the methane potential, and the assessment report it came from is yours to pick. The combustion efficiency (the share oxidised to CO2) is optional; left blank, the destruction efficiency stands in for it and the results say so.">
        <Cell label="Volume" unit="MMscfd" value={inputs.parcel.volumeMMscfd} onChange={(v) => setSection('parcel', { volumeMMscfd: v })} />
        <Cell label="On stream" unit="days/yr" value={inputs.parcel.onstreamDays} onChange={(v) => setSection('parcel', { onstreamDays: v })} />
        <Cell label="Flare destruction efficiency" unit="fraction" value={inputs.parcel.flareDestructionEfficiency} placeholder="required" onChange={(v) => setSection('parcel', { flareDestructionEfficiency: v })} />
        <Cell label="Flare combustion efficiency" unit="fraction" value={inputs.parcel.flareCombustionEfficiency} placeholder="optional" onChange={(v) => setSection('parcel', { flareCombustionEfficiency: v })} />
        <Cell label="Methane GWP" value={inputs.parcel.gwpMethane} placeholder="required" onChange={(v) => setSection('parcel', { gwpMethane: v })} />
      </Group>

      <Group title="The counterfactual"
        note="No abatement is reported until this is stated. Only the share of the flare the credited route recovers is avoided: the gas it does not recover is still flared. The flare's gross emission is the starting point, and the abatement depends on what the recovered product displaces: recover the gas and somebody burns it, and whether that is better or worse depends entirely on what it displaces.">
        <Cell label="What the product displaces" type="text" value={inputs.counterfactual.label} placeholder="required" onChange={(v) => setSection('counterfactual', { label: v })} />
        <Cell label="Product burned" unit="tCO2e/yr" value={inputs.counterfactual.productCombustionTonnesCo2ePerYear} placeholder="required" onChange={(v) => setSection('counterfactual', { productCombustionTonnesCo2ePerYear: v })} />
        <Cell label="Fuel displaced" unit="tCO2e/yr" value={inputs.counterfactual.displacedFuelTonnesCo2ePerYear} placeholder="required" onChange={(v) => setSection('counterfactual', { displacedFuelTonnesCo2ePerYear: v })} />
      </Group>

      <div>
        <h2 className="text-sm font-semibold text-pl-text mb-1">The routes</h2>
        <p className="text-[10px] text-pl-muted mb-1.5">{ROUTE_TEMPLATE_NOTE}</p>
        {inputs.routes.map((r) => (
          <div key={r.id} className="rounded-lg border border-pl-border p-2 mb-2">
            <p className="text-[11px] font-medium text-pl-text mb-1.5">{r.label}</p>
            <div className="grid grid-cols-2 gap-2">
              {r.requirements.map((q) => (
                <Cell key={q.key} scope={r.label} label={q.label.charAt(0).toUpperCase() + q.label.slice(1)} unit={q.unit}
                  value={q.limit} placeholder="unset"
                  onChange={(v) => setRequirement(r.id, q.key, v)} />
              ))}
              <Cell scope={r.label} label="Yield" unit={`${r.productUnitLabel}/Mscf`} value={r.productUnitPerMscf} onChange={(v) => setRoute(r.id, { productUnitPerMscf: v })} />
              <Cell scope={r.label} label="Recovery" unit="fraction" value={r.recoveryFraction} onChange={(v) => setRoute(r.id, { recoveryFraction: v })} />
              <Cell scope={r.label} label="Price" unit={`per ${r.productUnitLabel}`} value={r.pricePerProductUnit} onChange={(v) => setRoute(r.id, { pricePerProductUnit: v })} />
              <Cell scope={r.label} label="Reference capex" value={r.referenceCapitalCost} onChange={(v) => setRoute(r.id, { referenceCapitalCost: v })} />
              <Cell scope={r.label} label="Reference capacity" unit="MMscfd" value={r.referenceCapacityMMscfd} onChange={(v) => setRoute(r.id, { referenceCapacityMMscfd: v })} />
              <Cell scope={r.label} label="Fixed opex" unit="/yr" value={r.fixedOpexPerYear} onChange={(v) => setRoute(r.id, { fixedOpexPerYear: v })} />
              <Cell scope={r.label} label="Variable opex" unit="/Mscf" value={r.variableOpexPerMscf} onChange={(v) => setRoute(r.id, { variableOpexPerMscf: v })} />
            </div>
          </div>
        ))}
      </div>

      <Group title="Carbon credits"
        note="Whether the project needs credits is a different question from what they are worth, and it is the one a bid turns on.">
        <Cell label="Credit prices" type="text" value={inputs.credits.prices} onChange={(v) => setSection('credits', { prices: v })} />
        <Cell label="Hurdle margin" unit="/yr" value={inputs.credits.hurdleMarginPerYear} onChange={(v) => setSection('credits', { hurdleMarginPerYear: v })} />
        <div>
          <Label htmlFor="fv-route" className="text-[10px] text-pl-muted">Route the credits apply to</Label>
          <NativeSelect compact id="fv-route" value={inputs.credits.appliesToRouteId}
            onChange={(e) => setSection('credits', { appliesToRouteId: e.target.value })}
            className="h-7">
            {inputs.routes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </NativeSelect>
        </div>
      </Group>
    </div>
  );
};

export default FlareInputs;
