// The potential set, the sources, the factors and the measures (DS9).
import React from 'react';
import { Trash2, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useCarbonAbatement } from '@/contexts/CarbonAbatementContext';

let cellSeq = 0;
const Cell = ({ label, value, onChange, unit, placeholder, type = 'number' }) => {
  const id = React.useMemo(() => `ca-${(cellSeq += 1)}`, []);
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

const CarbonInputs = () => {
  const {
    inputs, setSection, setLine, setMeasure, addMeasure, removeMeasure,
  } = useCarbonAbatement();

  return (
    <div className="space-y-4">
      <Group title="Global warming potentials"
        note="No values are shipped. They differ between IPCC assessment reports by enough to move a methane-heavy inventory by a fifth, and an inventory on one report is not comparable with one on another. Name the set you are using.">
        <Cell label="Assessment report" type="text" value={inputs.gwp.label}
          placeholder="required" onChange={(v) => setSection('gwp', { label: v })} />
        <Cell label="CH4" value={inputs.gwp.ch4} placeholder="required" onChange={(v) => setSection('gwp', { ch4: v })} />
        <Cell label="N2O" value={inputs.gwp.n2o} onChange={(v) => setSection('gwp', { n2o: v })} />
      </Group>

      <Group title="Combustion"
        note="CO2 comes from the carbon in the fuel, not from a factor: every carbon atom into the burner leaves as CO2. It is conservation of mass and needs no source document.">
        <Cell label="Fuel burned" unit="kmol/yr" value={inputs.combustion.fuelKmolPerYear} onChange={(v) => setSection('combustion', { fuelKmolPerYear: v })} />
        <Cell label="Carbon per kmol" value={inputs.combustion.carbonPerKmolFuel} onChange={(v) => setSection('combustion', { carbonPerKmolFuel: v })} />
        <Cell label="Destruction efficiency" unit="fraction" value={inputs.combustion.destructionEfficiencyFraction} onChange={(v) => setSection('combustion', { destructionEfficiencyFraction: v })} />
      </Group>

      <Group title="Flaring"
        note="A flare's destruction efficiency is the whole answer and it is contested, so it is asked for rather than assumed. Carbon that escapes is counted as methane.">
        <Cell label="Gas flared" unit="kmol/yr" value={inputs.flare.fuelKmolPerYear} onChange={(v) => setSection('flare', { fuelKmolPerYear: v })} />
        <Cell label="Carbon per kmol" value={inputs.flare.carbonPerKmolFuel} onChange={(v) => setSection('flare', { carbonPerKmolFuel: v })} />
        <Cell label="Destruction efficiency" unit="fraction" value={inputs.flare.destructionEfficiencyFraction} placeholder="required" onChange={(v) => setSection('flare', { destructionEfficiencyFraction: v })} />
      </Group>

      <div>
        <h2 className="text-sm font-semibold text-white mb-1">Factor-based sources</h2>
        <p className="text-[10px] text-slate-500 mb-1.5">
          A factor without its source and version is not an auditable number. The inventory is
          still computed without them; it is marked not reportable and says which lines are why.
        </p>
        {inputs.lines.map((l) => (
          <div key={l.id} className="rounded border border-slate-800 bg-slate-900/60 p-2 mb-2">
            <p className="text-[11px] text-slate-300 mb-1.5">{`${l.label} (Scope ${l.scope}, ${l.gas})`}</p>
            <div className="grid grid-cols-2 gap-2">
              <Cell label="Activity" unit={l.activityUnit} value={l.activity} onChange={(v) => setLine(l.id, { activity: v })} />
              <Cell label="Factor" unit={l.factorUnit} value={l.factorValue} placeholder="required" onChange={(v) => setLine(l.id, { factorValue: v })} />
              <Cell label={`${l.label} source`} type="text" value={l.source} placeholder="required" onChange={(v) => setLine(l.id, { source: v })} />
              <Cell label={`${l.label} version`} type="text" value={l.version} placeholder="required" onChange={(v) => setLine(l.id, { version: v })} />
            </div>
          </div>
        ))}
      </div>

      <Group title="Carbon intensity"
        note="An intensity is meaningless without saying what is on the bottom. Per tonne charged and per tonne of saleable product are different numbers for the same plant.">
        <Cell label="Denominator" value={inputs.intensity.denominatorValue} onChange={(v) => setSection('intensity', { denominatorValue: v })} />
        <Cell label="Denominator unit" type="text" value={inputs.intensity.denominatorUnit} onChange={(v) => setSection('intensity', { denominatorUnit: v })} />
        <Cell label="Boundary" type="text" value={inputs.intensity.boundaryLabel} placeholder="required" onChange={(v) => setSection('intensity', { boundaryLabel: v })} />
      </Group>

      <Group title="The plan">
        <Cell label="Discount rate" unit="fraction" value={inputs.plan.discountRate} onChange={(v) => setSection('plan', { discountRate: v })} />
        <Cell label="Target reduction" unit="% by the end" value={inputs.plan.targetReductionPercentByEnd} onChange={(v) => setSection('plan', { targetReductionPercentByEnd: v })} />
        <Cell label="Start year" value={inputs.plan.startYear} onChange={(v) => setSection('plan', { startYear: v })} />
        <Cell label="End year" value={inputs.plan.endYear} onChange={(v) => setSection('plan', { endYear: v })} />
      </Group>

      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-white">Abatement measures</h2>
          <Button size="sm" variant="outline" className="h-6 text-[11px] border-slate-700" onClick={addMeasure}>
            <Plus className="w-3 h-3 mr-1" /> Measure
          </Button>
        </div>
        <p className="text-[10px] text-slate-500 mb-1.5">
          Two measures acting on the same source do not abate twice. Name what each one acts on and
          the curve will say where they interact.
        </p>
        {inputs.measures.map((m) => (
          <div key={m.id} className="rounded border border-slate-800 bg-slate-900/60 p-2 mb-2">
            <div className="flex items-center gap-1 mb-1.5">
              <Input value={m.label} aria-label={`Measure name ${m.label}`}
                onChange={(e) => setMeasure(m.id, { label: e.target.value })}
                className="h-7 bg-slate-950 border-slate-700 text-xs" />
              <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500 hover:text-red-400"
                aria-label={`Remove ${m.label}`} onClick={() => removeMeasure(m.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Cell label="Capital" value={m.capitalCost} onChange={(v) => setMeasure(m.id, { capitalCost: v })} />
              <Cell label="Life" unit="yr" value={m.lifeYears} onChange={(v) => setMeasure(m.id, { lifeYears: v })} />
              <Cell label="Annual saving" value={m.annualSavings} onChange={(v) => setMeasure(m.id, { annualSavings: v })} />
              <Cell label="Annual cost" value={m.annualCost} onChange={(v) => setMeasure(m.id, { annualCost: v })} />
              <Cell label="Abatement" unit="tCO2e/yr" value={m.tonnesAbatedPerYear} onChange={(v) => setMeasure(m.id, { tonnesAbatedPerYear: v })} />
              <Cell label="Start year" value={m.startYear} onChange={(v) => setMeasure(m.id, { startYear: v })} />
              <Cell label="Acts on" type="text" value={m.actsOn} onChange={(v) => setMeasure(m.id, { actsOn: v })} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CarbonInputs;
