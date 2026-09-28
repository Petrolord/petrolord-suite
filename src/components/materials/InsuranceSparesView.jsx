// Insurance spares: expected holding cost against expected downtime cost (SC3).
import React from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS,
} from '@/utils/chartTheme';
import { useMaterialsSpares } from '@/contexts/MaterialsSparesContext';
import { fillFromItem, fmtNum } from '@/utils/supplychain/materialsAdapters';
import {
  Basis, ItemFill, Note, NumField, Panel, ResultGate, Stat,
} from './common';

const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

const SparesInputs = () => {
  const { inputs, items, setSection } = useMaterialsSpares();
  const s = inputs.spares;
  const set = (patch) => setSection('spares', patch);
  return (
    <Panel title="Insurance spare inputs" testId="spares-inputs">
      <ItemFill items={items} value={s.itemId} onFill={(it) => set(fillFromItem('spares', it))} testId="spares-item" note="Copies the item's unit cost." />
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Failures a year across the installed units" testId="spares-rate" value={s.failuresPerYear} onChange={(v) => set({ failuresPerYear: v })} />
        <NumField label="Replacement lead time (days)" testId="spares-lt" value={s.leadTimeDays} onChange={(v) => set({ leadTimeDays: v })} />
        <NumField label="Days in a year" testId="spares-days" value={s.daysPerYear} onChange={(v) => set({ daysPerYear: v })} />
        <NumField label="Unit cost of a spare" testId="spares-unitcost" value={s.unitCost} onChange={(v) => set({ unitCost: v })} />
        <NumField label="Holding rate (fraction a year)" testId="spares-holdingrate" value={s.holdingRate} onChange={(v) => set({ holdingRate: v })} />
        <NumField label="Downtime cost a day for each unit down" testId="spares-downtime" value={s.downtimeCostPerDay} onChange={(v) => set({ downtimeCostPerDay: v })} />
        <NumField label="Largest number of spares to consider" testId="spares-max" value={s.maxSpares} onChange={(v) => set({ maxSpares: v })} />
      </div>
    </Panel>
  );
};

const SparesResults = () => {
  const { results } = useMaterialsSpares();
  return (
    <ResultGate result={results.spares} testId="spares">
      {(r) => {
        const data = r.options.map((o) => ({
          n: o.spares, holding: o.holdingCost, downtime: o.downtimeCost, total: o.totalCost,
        }));
        return (
          <Panel title="Insurance spares" testId="spares-results">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Spares to hold" value={String(r.spares)} testId="spares-best" />
              <Stat label="Total cost a year" value={fmtNum(r.totalCost, 2)} testId="spares-total" />
              <Stat label="Mean orders outstanding" value={fmtNum(r.meanOutstanding, 6)} testId="spares-mean" />
            </div>
            {r.atSearchLimit ? <Note tone="warn" testId="spares-limit">The cheapest option is at the largest number considered, so a larger stock may cost less. Raise the largest number of spares.</Note> : null}
            <div className="overflow-hidden rounded-lg border border-pl-border">
              <ChartFrame height={240} exportFilename="insurance-spares">
                <ComposedChart data={data} margin={{ top: 16, right: 20, left: 10, bottom: 8 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="n" tick={tick} label={{ value: 'Spares held', position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 11 }} />
                  <YAxis tick={tick} tickFormatter={(v) => fmtNum(v, 0)} width={90} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmtNum(v, 2)} />
                  <Legend {...LEGEND_PROPS} />
                  <Bar dataKey="holding" stackId="c" name="Holding a year" fill="#2563eb" isAnimationActive={false} />
                  <Bar dataKey="downtime" stackId="c" name="Expected downtime a year" fill="#d97706" isAnimationActive={false} />
                  <Line dataKey="total" name="Total a year" stroke="#0f172a" dot={{ r: 3 }} isAnimationActive={false} />
                </ComposedChart>
              </ChartFrame>
            </div>
            <table className="w-full text-xs">
              <thead className="text-left text-pl-muted"><tr><th className="p-1">Spares</th><th className="p-1 text-right">P(no shortage)</th><th className="p-1 text-right">Fill rate</th><th className="p-1 text-right">Expected units down</th><th className="p-1 text-right">Holding</th><th className="p-1 text-right">Downtime</th><th className="p-1 text-right">Total</th></tr></thead>
              <tbody>
                {r.options.map((o) => (
                  <tr key={o.spares} className={`border-t border-pl-border ${o.spares === r.spares ? 'text-pl-success-text' : 'text-pl-text'}`} data-testid={`spares-row-${o.spares}`}>
                    <td className="p-1">{o.spares}</td>
                    <td className="p-1 text-right font-mono">{fmtNum(o.probabilityNoShortage, 6)}</td>
                    <td className="p-1 text-right font-mono">{fmtNum(o.fillRate, 6)}</td>
                    <td className="p-1 text-right font-mono">{fmtNum(o.expectedUnitsDown, 6)}</td>
                    <td className="p-1 text-right font-mono">{fmtNum(o.holdingCost, 2)}</td>
                    <td className="p-1 text-right font-mono">{fmtNum(o.downtimeCost, 2)}</td>
                    <td className="p-1 text-right font-mono" data-testid={`spares-total-${o.spares}`}>{fmtNum(o.totalCost, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Basis reason={r.reason} basis={r.basis} testId="spares-basis" />
          </Panel>
        );
      }}
    </ResultGate>
  );
};

const InsuranceSparesView = () => (
  <div className="space-y-4">
    <Note>
      An insurance spare is held against a failure that stops production. Each failure takes a spare and orders a replacement,
      so the replacements outstanding are Poisson. The planner costs every stock from 0 up to your largest number and picks the
      cheapest; ties go to fewer spares.
    </Note>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <SparesInputs />
      <SparesResults />
    </div>
  </div>
);

export default InsuranceSparesView;
