// Safety stock and the reorder point: normal demand and Poisson demand (SC3).
import React from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine, Tooltip, XAxis, YAxis,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { useMaterialsSpares } from '@/contexts/MaterialsSparesContext';
import { fillFromItem, fmtNum } from '@/utils/supplychain/materialsAdapters';
import {
  Basis, ItemFill, Note, NumField, Panel, ResultGate, RoundingField, SelectField, Stat,
} from './common';

const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

const MEASURE_OPTIONS = [
  { value: 'cycle-service', label: 'Cycle service level: probability of no stockout in a cycle' },
  { value: 'fill-rate', label: 'Fill rate: fraction of demand met from stock' },
];

const NormalInputs = () => {
  const { inputs, items, setSection } = useMaterialsSpares();
  const s = inputs.safety;
  const set = (patch) => setSection('safety', patch);
  return (
    <Panel title="Normal demand inputs" testId="safety-inputs">
      <ItemFill items={items} value={s.itemId} onFill={(it) => set(fillFromItem('safety', it))} testId="safety-item" note="Copies the item's monthly usage into the mean demand, so the period is a month; state the lead time and review period in months too." />
      <p className="text-[11px] text-pl-muted">Demand, lead time and review period all in the one period you choose.</p>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Mean demand a period" testId="safety-demand" value={s.demandMean} onChange={(v) => set({ demandMean: v })} />
        <NumField label="Standard deviation of demand a period" testId="safety-demandsd" value={s.demandSd} onChange={(v) => set({ demandSd: v })} />
        <NumField label="Mean lead time (periods)" testId="safety-lt" value={s.leadTime} onChange={(v) => set({ leadTime: v })} />
        <NumField label="Standard deviation of lead time" testId="safety-ltsd" value={s.leadTimeSd} onChange={(v) => set({ leadTimeSd: v })} />
        <NumField label="Review period (0 for continuous review)" testId="safety-review" value={s.reviewPeriod} onChange={(v) => set({ reviewPeriod: v })} />
        <NumField label="Order quantity (needed for a fill rate)" testId="safety-q" value={s.orderQuantity} onChange={(v) => set({ orderQuantity: v })} placeholder="optional for a cycle service level" />
      </div>
      <SelectField label="Service measure" testId="safety-measure" value={s.serviceMeasure} onChange={(v) => set({ serviceMeasure: v })} options={MEASURE_OPTIONS} />
      <NumField label="Service level (between 0 and 1)" testId="safety-level" value={s.serviceLevel} onChange={(v) => set({ serviceLevel: v })} />
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="Safety factor k read as"
          testId="safety-krule"
          value={s.kRule}
          onChange={(v) => set({ kRule: v })}
          options={[{ value: 'none', label: 'Exact (no rounding)' }, { value: 'nearest', label: 'Rounded to decimals, as from a table' }]}
        />
        {s.kRule === 'nearest' ? <NumField label="Decimals" testId="safety-kdecimals" value={s.kDecimals} onChange={(v) => set({ kDecimals: v })} /> : <div />}
        <SelectField
          label="Minimum safety factor"
          testId="safety-minmode"
          value={s.minimumMode}
          onChange={(v) => set({ minimumMode: v })}
          options={[{ value: 'none', label: 'No floor' }, { value: 'value', label: 'A stated floor' }]}
        />
        {s.minimumMode === 'value' ? <NumField label="Floor on k" testId="safety-min" value={s.minimumSafetyFactor} onChange={(v) => set({ minimumSafetyFactor: v })} /> : <div />}
      </div>
      <RoundingField label="Rounding rule for the stock level held" testId="safety-rounding" value={s.rounding} onChange={(rounding) => set({ rounding })} />
    </Panel>
  );
};

const NormalResults = () => {
  const { results } = useMaterialsSpares();
  return (
    <ResultGate result={results.safety} testId="safety">
      {(r) => (
        <Panel title={`Safety stock, ${r.policy}`} testId="safety-results">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Safety factor k" value={fmtNum(r.safetyFactor, 4)} testId="safety-k" />
            <Stat label="Sigma over the protection period" value={fmtNum(r.sigma, 4)} testId="safety-sigma" />
            <Stat label="Safety stock" value={fmtNum(r.safetyStock, 4)} testId="safety-ss" />
            <Stat label="Demand over the protection period" value={fmtNum(r.demandOverProtection, 4)} testId="safety-mu" />
            <Stat label={r.policy.startsWith('periodic') ? 'Order-up-to level' : 'Reorder point'} value={fmtNum(r.level, 4)} testId="safety-level-out" />
            <Stat label="Held as" value={fmtNum(r.levelRounded, 2)} testId="safety-held" />
            <Stat label="Cycle service achieved" value={fmtNum(r.achievedCycleService, 4)} testId="safety-achieved" />
            <Stat label="Expected units short a cycle" value={fmtNum(r.expectedShortPerCycle, 4)} testId="safety-short" />
            <Stat label="Fill rate achieved" value={r.achievedFillRate === null ? 'needs an order quantity' : fmtNum(r.achievedFillRate, 4)} testId="safety-fill" />
          </div>
          <Basis reason={r.reason} basis={r.basis} testId="safety-basis" />
        </Panel>
      )}
    </ResultGate>
  );
};

const PoissonInputs = () => {
  const { inputs, items, setSection } = useMaterialsSpares();
  const s = inputs.poisson;
  const set = (patch) => setSection('poisson', patch);
  return (
    <Panel title="Poisson demand inputs (slow movers and spares)" testId="poisson-inputs">
      <ItemFill items={items} value={s.itemId} onFill={(it) => set(fillFromItem('poisson', it))} testId="poisson-item" note="Copies the item's monthly usage into the demand rate, so the period is a month." />
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Demand rate a period" testId="poisson-rate" value={s.demandRate} onChange={(v) => set({ demandRate: v })} />
        <NumField label="Lead time (periods)" testId="poisson-lt" value={s.leadTime} onChange={(v) => set({ leadTime: v })} />
        <NumField label="Review period (0 for continuous review)" testId="poisson-review" value={s.reviewPeriod} onChange={(v) => set({ reviewPeriod: v })} />
        <NumField label="Order quantity (needed for a fill rate)" testId="poisson-q" value={s.orderQuantity} onChange={(v) => set({ orderQuantity: v })} placeholder="optional for a cycle service level" />
      </div>
      <SelectField label="Service measure" testId="poisson-measure" value={s.serviceMeasure} onChange={(v) => set({ serviceMeasure: v })} options={MEASURE_OPTIONS} />
      <NumField label="Service level (between 0 and 1)" testId="poisson-level" value={s.serviceLevel} onChange={(v) => set({ serviceLevel: v })} hint="For a cycle service level this is read as the probability of no stockout over the lead time." />
    </Panel>
  );
};

const PoissonResults = () => {
  const { results, inputs } = useMaterialsSpares();
  return (
    <ResultGate result={results.poisson} testId="poisson">
      {(r) => {
        const data = r.rows.map((x) => ({ s: x.s, cumulative: x.cumulative, chosen: x.s === r.level }));
        const level = Number(inputs.poisson.serviceLevel);
        return (
          <Panel title="Poisson stock level" testId="poisson-results">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Mean demand over the protection period" value={fmtNum(r.mean, 4)} testId="poisson-mean" />
              <Stat label="Stock level" value={String(r.level)} testId="poisson-level-out" />
              <Stat label="Safety stock (level less mean)" value={fmtNum(r.safetyStock, 4)} testId="poisson-ss" />
              <Stat label="P(no stockout) achieved" value={fmtNum(r.achievedCycleService, 6)} testId="poisson-achieved" />
              <Stat label="Expected units short a cycle" value={fmtNum(r.expectedShortPerCycle, 6)} testId="poisson-short" />
              <Stat label="Fill rate achieved" value={r.achievedFillRate === null ? 'needs an order quantity' : fmtNum(r.achievedFillRate, 6)} testId="poisson-fill" />
            </div>
            <div className="overflow-hidden rounded-lg border border-pl-border">
              <ChartFrame height={200} exportFilename="poisson-cumulative">
                <BarChart data={data} margin={{ top: 16, right: 20, left: 10, bottom: 20 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="s" tick={tick} label={{ value: 'Stock level s', position: 'insideBottom', offset: -10, fill: CHART_COLORS.axisLabel, fontSize: 11 }} />
                  <YAxis tick={tick} domain={[0, 1]} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmtNum(v, 6)} />
                  {inputs.poisson.serviceMeasure === 'cycle-service' && Number.isFinite(level) ? <ReferenceLine y={level} stroke="#dc2626" strokeDasharray="4 4" /> : null}
                  <Bar dataKey="cumulative" name="P(X at or below s)" isAnimationActive={false}>
                    {data.map((d) => <Cell key={d.s} fill={d.chosen ? '#059669' : '#2563eb'} />)}
                  </Bar>
                </BarChart>
              </ChartFrame>
            </div>
            <Basis reason={r.reason} basis={r.basis} testId="poisson-basis" />
          </Panel>
        );
      }}
    </ResultGate>
  );
};

const SafetyStockView = () => (
  <div className="space-y-4">
    <Note>
      Normal demand suits items that move every period. Slow movers and spares, issued a few at a time, are better read with
      Poisson demand, where the stock level is a whole number of units.
    </Note>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <NormalInputs />
      <NormalResults />
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <PoissonInputs />
      <PoissonResults />
    </div>
  </div>
);

export default SafetyStockView;
