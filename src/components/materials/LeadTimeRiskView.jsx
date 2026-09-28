// Lead-time risk by seeded Monte Carlo (SC3). The sampling is the engine's,
// through the canonical lib/stats mulberry32 stream; the P-labels follow
// lib/conventions/percentile.js, so P90 is the LOW figure.
import React from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine, Tooltip, XAxis, YAxis,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  NumTh, NumRow, RowLabel, NumCell,
} from '@/components/ui/numeric-table';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { OUTCOME_LABELS, OUTCOME_ORDER } from '@/lib/percentileConventions';
import { useMaterialsSpares } from '@/contexts/MaterialsSparesContext';
import { fmtNum } from '@/utils/supplychain/materialsAdapters';
import {
  Ledger, TextCell,
  Basis, ItemFill, Note, NumField, Panel, ResultGate, SelectField, Stat,
} from './common';

const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

/** The P-label with the plain reading beside it: P90 is low, P10 is high. */
export const P_READING = { p90: 'low, the 10th percentile', p50: 'median', p10: 'high, the 90th percentile' };
export const pLabel = (k) => `${OUTCOME_LABELS[k]} (${P_READING[k]})`;

const DistField = ({
  title, mode, fixed, tri, onMode, onFixed, onTri, testId, unit,
}) => (
  <div className="space-y-2 rounded-md border border-pl-border p-2">
    <SelectField
      label={title}
      testId={`${testId}-mode`}
      value={mode}
      onChange={onMode}
      options={[{ value: 'fixed', label: 'A fixed value' }, { value: 'triangular', label: 'Triangular: minimum, most likely, maximum' }]}
    />
    {mode === 'fixed' ? <NumField label={`Value (${unit})`} testId={`${testId}-fixed`} value={fixed} onChange={onFixed} /> : null}
    {mode === 'triangular' ? (
      <div className="grid grid-cols-3 gap-2">
        <NumField label="Minimum" testId={`${testId}-min`} value={tri.min} onChange={(v) => onTri({ ...tri, min: v })} />
        <NumField label="Most likely" testId={`${testId}-mode-value`} value={tri.mode} onChange={(v) => onTri({ ...tri, mode: v })} />
        <NumField label="Maximum" testId={`${testId}-max`} value={tri.max} onChange={(v) => onTri({ ...tri, max: v })} />
      </div>
    ) : null}
  </div>
);

const LeadTimeInputs = () => {
  const { inputs, items, setSection } = useMaterialsSpares();
  const s = inputs.leadTime;
  const set = (patch) => setSection('leadTime', patch);
  return (
    <Panel title="Lead-time risk inputs" testId="leadtime-inputs">
      <ItemFill items={items} value={s.itemId} onFill={(it) => set({ itemId: it.id })} testId="leadtime-item" note="Names the item this simulation is for; the demand and lead time are yours to state." />
      <DistField
        title="Lead time (days)"
        unit="days"
        testId="lt-days"
        mode={s.leadTimeMode}
        fixed={s.leadTimeFixed}
        tri={s.leadTimeTri}
        onMode={(v) => set({ leadTimeMode: v })}
        onFixed={(v) => set({ leadTimeFixed: v })}
        onTri={(v) => set({ leadTimeTri: v })}
      />
      <DistField
        title="Demand (units a day)"
        unit="units a day"
        testId="lt-demand"
        mode={s.demandMode}
        fixed={s.demandFixed}
        tri={s.demandTri}
        onMode={(v) => set({ demandMode: v })}
        onFixed={(v) => set({ demandFixed: v })}
        onTri={(v) => set({ demandTri: v })}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Reorder point (units)" testId="lt-rop" value={s.reorderPoint} onChange={(v) => set({ reorderPoint: v })} />
        <NumField label="Service level for a suggested reorder point" testId="lt-level" value={s.serviceLevel} onChange={(v) => set({ serviceLevel: v })} placeholder="optional" />
        <NumField label="Iterations" testId="lt-iterations" value={s.iterations} onChange={(v) => set({ iterations: v })} />
        <NumField label="Seed" testId="lt-seed" value={s.seed} onChange={(v) => set({ seed: v })} hint="The same seed and inputs give the same numbers every run." />
      </div>
    </Panel>
  );
};

const LeadTimeResults = () => {
  const { results, inputs } = useMaterialsSpares();
  return (
    <ResultGate result={results.leadTime} testId="leadtime">
      {(r) => {
        const data = OUTCOME_ORDER.map((k) => ({ name: OUTCOME_LABELS[k], key: k, value: r.leadTimeDemand[k] }));
        const rop = Number(inputs.leadTime.reorderPoint);
        return (
          <Panel title="Lead-time risk" testId="leadtime-results">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Stockout probability a cycle" value={fmtNum(r.probabilityOfStockout, 6)} testId="lt-stockout" />
              <Stat label="Cycle service level" value={fmtNum(r.cycleServiceLevel, 6)} testId="lt-csl" />
              <Stat label="Expected units short a cycle" value={fmtNum(r.expectedShortPerCycle, 6)} testId="lt-short" />
              <Stat label="Reorder point for the stated service level" value={r.reorderPointForService === null ? 'no service level stated' : fmtNum(r.reorderPointForService, 4)} testId="lt-rop-service" />
            </div>
            <Ledger>
              <thead>
                <tr><NumTh sticky>Statistic</NumTh><NumTh numeric>Lead time (days)</NumTh><NumTh numeric>Lead-time demand (units)</NumTh></tr>
              </thead>
              <tbody>
                {['mean', ...OUTCOME_ORDER, 'min', 'max'].map((k) => (
                  <NumRow key={k} data-testid={`lt-row-${k}`}>
                    <RowLabel>{OUTCOME_LABELS[k] ? pLabel(k) : k === 'mean' ? 'Mean' : k === 'min' ? 'Smallest draw' : 'Largest draw'}</RowLabel>
                    <NumCell data-testid={`lt-stat-days-${k}`}>{fmtNum(r.leadTime[k], 4)}</NumCell>
                    <NumCell data-testid={`lt-stat-ltd-${k}`}>{fmtNum(r.leadTimeDemand[k], 4)}</NumCell>
                  </NumRow>
                ))}
              </tbody>
            </Ledger>
            <Note testId="lt-definition">{r.percentileDefinition} For a lead time or a demand, P90 is therefore the low figure and the stockout risk sits at the P10 end.</Note>
            <div className="overflow-hidden rounded-lg border border-pl-border">
              <ChartFrame height={200} exportFilename="lead-time-demand">
                <BarChart data={data} margin={{ top: 16, right: 20, left: 10, bottom: 8 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="name" tick={tick} />
                  <YAxis tick={tick} label={{ value: 'Lead-time demand', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 11 }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmtNum(v, 4)} />
                  {Number.isFinite(rop) ? <ReferenceLine y={rop} stroke="#dc2626" strokeDasharray="4 4" label={{ value: `Reorder point ${rop}`, fill: '#dc2626', fontSize: 10, position: 'insideTopRight' }} /> : null}
                  <Bar dataKey="value" name="Lead-time demand" isAnimationActive={false}>
                    {data.map((d) => <Cell key={d.key} fill={d.key === 'p10' ? '#d97706' : '#2563eb'} />)}
                  </Bar>
                </BarChart>
              </ChartFrame>
            </div>
            <Basis reason={r.reason} basis={r.basis} testId="leadtime-basis" />
          </Panel>
        );
      }}
    </ResultGate>
  );
};

const LeadTimeRiskView = () => (
  <div className="space-y-4">
    <Note>
      Each draw takes a lead time, then a daily demand held for that whole lead time, from one seeded random stream. A stockout
      is a draw whose lead-time demand is above the reorder point.
    </Note>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <LeadTimeInputs />
      <LeadTimeResults />
    </div>
  </div>
);

export default LeadTimeRiskView;
