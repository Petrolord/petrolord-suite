// Configuration: crudes, units, products and the period (DS3).
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRefineryPlanning } from '@/contexts/RefineryPlanningContext';

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

const YieldGrid = ({ kind, row, streams, exclude }) => {
  const { setYield } = useRefineryPlanning();
  return (
    <div className="grid grid-cols-3 gap-2 mt-2">
      {streams.filter((s) => s !== exclude).map((s) => (
        <Cell
          key={s} label={s}
          value={row.yields?.[s] ?? ''}
          onChange={(v) => setYield(kind, row.id, s, v)}
        />
      ))}
    </div>
  );
};

const ConfigPanel = () => {
  const {
    inputs, setCrude, setUnit, setProduct, setRecipe, setPeriod, plan,
  } = useRefineryPlanning();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-white mb-2">Period</h2>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-[10px] text-slate-400">Start</Label>
            <Input
              type="date" value={inputs.periodStart}
              onChange={(e) => setPeriod({ periodStart: e.target.value })}
              className="h-7 bg-slate-950 border-slate-700 text-xs"
            />
          </div>
          <Cell label="Days" value={inputs.periodDays} onChange={(v) => setPeriod({ periodDays: v })} />
          <Cell label="Cargo" unit="bbl" value={inputs.cargoSize} onChange={(v) => setPeriod({ cargoSize: v })} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-white mb-2">Crudes</h2>
        <p className="text-[11px] text-slate-500 mb-2">
          Yields are volume fractions of the crude into each stream, and they are data rather than
          something this app predicts. A refinery&apos;s own come from its assays; the Crude Assay
          Studio is where the straight-run ones are worked out.
        </p>
        {inputs.crudes.map((c) => (
          <div key={c.id} className="rounded border border-slate-800 bg-slate-900/60 p-2 mb-2">
            <Input
              value={c.name}
              onChange={(e) => setCrude(c.id, { name: e.target.value })}
              className="h-7 bg-slate-950 border-slate-700 text-sm font-medium mb-2"
            />
            <div className="grid grid-cols-2 gap-2">
              <Cell label="Cost" unit="$/bbl" value={c.cost} onChange={(v) => setCrude(c.id, { cost: v })} />
              <Cell label="Available" unit="bbl" value={c.available} onChange={(v) => setCrude(c.id, { available: v })} />
            </div>
            <YieldGrid kind="crudes" row={c} streams={inputs.streams} exclude="reformate" />
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-white mb-2">Units</h2>
        {inputs.units.map((u) => {
          const run = plan.status === 'optimal' ? plan.unitRuns.find((r) => r.id === u.id) : null;
          return (
            <div key={u.id} className="rounded border border-slate-800 bg-slate-900/60 p-2 mb-2">
              <Input
                value={u.name}
                onChange={(e) => setUnit(u.id, { name: e.target.value })}
                className="h-7 bg-slate-950 border-slate-700 text-sm font-medium mb-2"
              />
              <div className="grid grid-cols-3 gap-2">
                <Cell label="Capacity" unit="bbl" value={u.capacity} onChange={(v) => setUnit(u.id, { capacity: v })} />
                <Cell label="Opex" unit="$/bbl" value={u.opex} onChange={(v) => setUnit(u.id, { opex: v })} />
                <div>
                  <Label className="text-[10px] text-slate-400">Feed stream</Label>
                  <Input
                    value={u.feed ?? ''}
                    onChange={(e) => setUnit(u.id, { feed: e.target.value })}
                    className="h-7 bg-slate-950 border-slate-700 text-xs"
                  />
                </div>
              </div>
              <YieldGrid kind="units" row={u} streams={inputs.streams} />
              {run && run.utilisation !== null && (
                <p className="text-[11px] text-slate-400 mt-1">
                  Running at {(run.utilisation * 100).toFixed(0)}% of capacity.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-white mb-2">Products</h2>
        {inputs.products.map((p) => (
          <div key={p.id} className="rounded border border-slate-800 bg-slate-900/60 p-2 mb-2">
            <Input
              value={p.name}
              onChange={(e) => setProduct(p.id, { name: e.target.value })}
              className="h-7 bg-slate-950 border-slate-700 text-sm font-medium mb-2"
            />
            <div className="grid grid-cols-3 gap-2">
              <Cell label="Price" unit="$/bbl" value={p.price} onChange={(v) => setProduct(p.id, { price: v })} />
              <Cell label="Min" unit="bbl" value={p.minDemand} onChange={(v) => setProduct(p.id, { minDemand: v })} />
              <Cell label="Max" unit="bbl" value={p.maxDemand} onChange={(v) => setProduct(p.id, { maxDemand: v })} />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {inputs.streams.map((s) => (
                <Cell
                  key={s} label={s}
                  value={p.recipe?.[s] ?? ''}
                  onChange={(v) => setRecipe(p.id, s, v)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConfigPanel;
