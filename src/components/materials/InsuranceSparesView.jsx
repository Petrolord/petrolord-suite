// Insurance spares: expected holding cost against expected downtime cost (SC3).
import React from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  NumTh, NumRow, RowLabel, NumCell,
} from '@/components/ui/numeric-table';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS,
} from '@/utils/chartTheme';
import { useMaterialsSpares } from '@/contexts/MaterialsSparesContext';
import { fillFromItem, fmtNum } from '@/utils/supplychain/materialsAdapters';
import {
  Ledger, TextCell,
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
            <Ledger>
              <thead><tr><NumTh sticky>Spares</NumTh><NumTh numeric>P(no shortage)</NumTh><NumTh numeric>Fill rate</NumTh><NumTh numeric>Expected units down</NumTh><NumTh numeric>Holding</NumTh><NumTh numeric>Downtime</NumTh><NumTh numeric>Total</NumTh></tr></thead>
              <tbody>
                {r.options.map((o) => (
                  <NumRow key={o.spares} className={o.spares === r.spares ? 'bg-pl-success-bg font-semibold' : undefined} data-testid={`spares-row-${o.spares}`}>
                    <RowLabel>
                      {o.spares}
                      {o.spares === r.spares ? <span className="ml-1.5 font-normal text-pl-success-text">chosen</span> : null}
                    </RowLabel>
                    <NumCell>{fmtNum(o.probabilityNoShortage, 6)}</NumCell>
                    <NumCell>{fmtNum(o.fillRate, 6)}</NumCell>
                    <NumCell>{fmtNum(o.expectedUnitsDown, 6)}</NumCell>
                    <NumCell>{fmtNum(o.holdingCost, 2)}</NumCell>
                    <NumCell>{fmtNum(o.downtimeCost, 2)}</NumCell>
                    <NumCell data-testid={`spares-total-${o.spares}`}>{fmtNum(o.totalCost, 2)}</NumCell>
                  </NumRow>
                ))}
              </tbody>
            </Ledger>
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
