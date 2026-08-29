// Configuration, scale, costs and prices (DS4).
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useModularRefinery } from '@/contexts/ModularRefineryContext';

const Cell = ({ label, value, onChange, unit }) => (
  <div>
    <Label className="text-[10px] text-slate-400">{label}{unit ? ` (${unit})` : ''}</Label>
    <Input
      type="number" step="any" value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 bg-slate-950 border-slate-700 text-xs"
    />
  </div>
);

const FeasibilityPanel = () => {
  const {
    inputs, set, setPrice, configuration, configurations, scenarios, slate,
  } = useModularRefinery();

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-slate-400">Configuration</Label>
        <Select value={inputs.configurationId} onValueChange={(v) => set({ configurationId: v, yieldOverrides: null })}>
          <SelectTrigger className="h-8 bg-slate-950 border-slate-700 text-sm mt-1"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
            {Object.values(configurations).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-slate-500 mt-2">{configuration.description}</p>
        <p className="text-[11px] text-slate-500 mt-1">
          Units: {configuration.units.join(', ')}.
        </p>
      </div>

      <div>
        <Label className="text-xs text-slate-400">Crude supply scenario</Label>
        <Select value={inputs.scenarioId} onValueChange={(v) => set({ scenarioId: v })}>
          <SelectTrigger className="h-8 bg-slate-950 border-slate-700 text-sm mt-1"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
            {scenarios.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-amber-300/80 mt-2">
          Crude supply is what actually decides these projects, so it sits here beside the capacity
          rather than in an appendix. These are named futures, not probabilities: attaching an
          invented likelihood to each would not be honest.
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-white mb-2">Plant</h2>
        <div className="grid grid-cols-2 gap-2">
          <Cell label="Capacity" unit="bpd" value={inputs.capacityBpd} onChange={(v) => set({ capacityBpd: v })} />
          <Cell label="On-stream" unit="days/yr" value={inputs.onstreamDays} onChange={(v) => set({ onstreamDays: v })} />
          <Cell label="Construction" unit="years" value={inputs.constructionYears} onChange={(v) => set({ constructionYears: v })} />
          <Cell label="Project life" unit="years" value={inputs.projectLife} onChange={(v) => set({ projectLife: v })} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-white mb-2">Capital reference and scaling</h2>
        <div className="grid grid-cols-2 gap-2">
          <Cell label="Reference cost" unit="$" value={inputs.baseCost} onChange={(v) => set({ baseCost: v })} />
          <Cell label="At capacity" unit="bpd" value={inputs.baseCapacity} onChange={(v) => set({ baseCapacity: v })} />
          <Cell label="Modular exponent" value={inputs.modularExponent} onChange={(v) => set({ modularExponent: v })} />
          <Cell label="Stick-built exponent" value={inputs.stickBuiltExponent} onChange={(v) => set({ stickBuiltExponent: v })} />
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          Replace the reference point with a vendor quotation for a real study. The exponents are
          here rather than buried because the difference between them is the entire argument for or
          against a modular project.
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-white mb-2">Costs</h2>
        <div className="grid grid-cols-2 gap-2">
          <Cell label="Crude" unit="$/bbl" value={inputs.crudeCostPerBbl} onChange={(v) => set({ crudeCostPerBbl: v })} />
          <Cell label="Variable opex" unit="$/bbl" value={inputs.variableOpexPerBbl} onChange={(v) => set({ variableOpexPerBbl: v })} />
          <Cell label="Fixed opex" unit="$/yr" value={inputs.fixedOpexPerYear} onChange={(v) => set({ fixedOpexPerYear: v })} />
          <Cell label="Discount rate" unit="%" value={inputs.discountRate} onChange={(v) => set({ discountRate: v })} />
          <Cell label="Tax rate" unit="%" value={inputs.taxRate} onChange={(v) => set({ taxRate: v })} />
          <Cell label="Royalty" unit="%" value={inputs.royaltyRate} onChange={(v) => set({ royaltyRate: v })} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-white mb-2">Product prices</h2>
        <div className="grid grid-cols-2 gap-2">
          {slate.rows.map((r) => (
            <Cell
              key={r.id}
              label={`${r.id} (${(r.yieldFraction * 100).toFixed(1)}%)`}
              unit="$/bbl"
              value={inputs.prices[r.id] ?? ''}
              onChange={(v) => setPrice(r.id, v)}
            />
          ))}
        </div>
        {slate.unpriced.length > 0 && (
          <p className="text-[11px] text-amber-300 mt-2">
            No price for {slate.unpriced.join(', ')}. Those products contribute nothing to the value,
            so the project is understated until they are priced.
          </p>
        )}
        <p className="text-[11px] text-slate-500 mt-2">
          Yields are the configuration&apos;s screening defaults. A real study takes them from the
          crude&apos;s own assay, which is what the Crude Assay Studio computes.
        </p>
      </div>
    </div>
  );
};

export default FeasibilityPanel;
