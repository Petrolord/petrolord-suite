// Shore base (SC4): berth utilisation and the queue at the supply base from
// a cited queueing model (M/M/c by Erlang C, or M/D/c by the Cosmetatos
// approximation), with an optional search for the fewest berths that meet a
// mean-wait target.
import React from 'react';
import {
  CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { useMarineLogistics } from '@/contexts/MarineLogisticsContext';
import { fmtNum, fmtShare, toNum } from '@/utils/supplychain/marineAdapters';
import {
  Basis, Note, NumField, Panel, ResultGate, SelectField, Stat,
} from './common';

const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

export const MODEL_LABEL = {
  'M/M/c': 'M/M/c, Erlang C (Poisson arrivals, exponential service)',
  'M/D/c': 'M/D/c, approximate (Cosmetatos; Poisson arrivals, constant service)',
};

const ShoreInputs = () => {
  const { inputs, setSection } = useMarineLogistics();
  const s = inputs.shore;
  const set = (patch) => setSection('shore', patch);
  return (
    <Panel title="Supply base inputs" testId="shore-inputs">
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Berths" testId="shore-berths" value={s.berths} onChange={(v) => set({ berths: v })} />
        <NumField label="Vessel arrivals a day" testId="shore-arrivals" value={s.arrivalsPerDay} onChange={(v) => set({ arrivalsPerDay: v })} />
        <NumField label="Working hours a day (at most 24)" testId="shore-hours" value={s.workingHoursPerDay} onChange={(v) => set({ workingHoursPerDay: v })} hint="The clock of the queue: arrivals and waits run on working hours." />
      </div>
      <p className="text-[11px] font-medium text-pl-text">Service a call needs</p>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Fixed hours (mooring, paperwork)" testId="shore-fixed" value={s.fixedHours} onChange={(v) => set({ fixedHours: v })} />
        <NumField label="Crane lifts" testId="shore-lifts" value={s.lifts} onChange={(v) => set({ lifts: v })} />
        <NumField label="Lifts an hour" testId="shore-lift-rate" value={s.liftsPerHour} onChange={(v) => set({ liftsPerHour: v })} />
        <NumField label="Bulk (m3)" testId="shore-bulk" value={s.bulkM3} onChange={(v) => set({ bulkM3: v })} />
        <NumField label="Bulk pump rate (m3 an hour)" testId="shore-bulk-rate" value={s.bulkM3PerHour} onChange={(v) => set({ bulkM3PerHour: v })} />
        <SelectField
          label="Lifts and bulk"
          testId="shore-concurrent"
          value={s.concurrent}
          onChange={(v) => set({ concurrent: v })}
          options={[{ value: 'true', label: 'At the same time (the longer counts)' }, { value: 'false', label: 'One after the other (both count)' }]}
        />
      </div>
      <SelectField
        label="Queueing model"
        testId="shore-model"
        value={s.model}
        onChange={(v) => set({ model: v })}
        options={[{ value: 'M/M/c', label: MODEL_LABEL['M/M/c'] }, { value: 'M/D/c', label: MODEL_LABEL['M/D/c'] }]}
      />
      <NumField label="Target mean wait (working hours)" testId="shore-target" value={s.targetMeanWaitHours} onChange={(v) => set({ targetMeanWaitHours: v })} placeholder="optional" hint="With a target the engine finds the fewest berths whose mean wait is at or below it." />
    </Panel>
  );
};

const ShoreResults = () => {
  const { results, inputs } = useMarineLogistics();
  const target = toNum(inputs.shore.targetMeanWaitHours);
  return (
    <ResultGate result={results.shore} testId="shore">
      {(r) => (
        <Panel title="Supply base queue" testId="shore-results">
          <p className="text-xs text-pl-text" data-testid="shore-model-label">{MODEL_LABEL[r.model]}</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Berth utilisation" value={fmtShare(r.berthUtilisation, 2)} testId="shore-utilisation" />
            <Stat label="Mean wait (working hours)" value={fmtNum(r.meanWaitHours, 4)} testId="shore-wait" />
            <Stat label="Mean wait (working days)" value={fmtNum(r.meanWaitWorkingDays, 4)} testId="shore-wait-days" />
            <Stat label="Probability a vessel waits" value={r.probabilityWait === null ? 'not given for M/D/c' : fmtShare(r.probabilityWait, 2)} testId="shore-pwait" />
            <Stat label="Service hours a call" value={fmtNum(r.serviceHours, 4)} testId="shore-service" />
            <Stat label="Offered load (berths busy on average)" value={fmtNum(r.offeredLoad, 4)} testId="shore-load" />
            <Stat label="Mean vessels waiting" value={fmtNum(r.meanQueue, 4)} testId="shore-queue" />
            <Stat label="Mean time at the base (hours)" value={fmtNum(r.meanTimeAtBaseHours, 4)} testId="shore-time" />
          </div>
          {r.target ? (
            <p className={`text-xs ${r.target.berths === null ? 'text-pl-warning-text' : 'text-pl-text'}`} data-testid="shore-target-reason">{r.target.reason}</p>
          ) : null}
          {results.berthCurve.length ? (
            <div className="overflow-hidden rounded-lg border border-pl-border">
              <ChartFrame height={220} exportFilename="berth-mean-wait">
                <LineChart data={results.berthCurve} margin={{ top: 16, right: 20, left: 0, bottom: 8 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="berths" tick={tick} label={{ value: 'Berths', position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 11 }} />
                  <YAxis tick={tick} tickFormatter={(x) => fmtNum(x, 2)} width={55} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(x) => `${fmtNum(x, 4)} h`} />
                  {Number.isFinite(target) ? <ReferenceLine y={target} stroke="#dc2626" strokeDasharray="4 4" label={{ value: `Target ${target} h`, fill: '#dc2626', fontSize: 10, position: 'insideTopRight' }} /> : null}
                  <Line type="monotone" dataKey="meanWaitHours" name="Mean wait (working hours)" stroke="#2563eb" strokeWidth={2} dot isAnimationActive={false} />
                </LineChart>
              </ChartFrame>
            </div>
          ) : null}
          <Note>The curve is the engine run again at each berth count with the other inputs unchanged.</Note>
          <Basis basis={r.basis} testId="shore-basis" />
        </Panel>
      )}
    </ResultGate>
  );
};

const ShoreBaseView = () => (
  <div className="space-y-4">
    <Note>
      A steady state needs the berth utilisation below 1: arrivals times service hours, over the berths, on the working-hour clock.
      M/M/c uses Erlang&apos;s C formula; M/D/c uses the Cosmetatos approximation, exact for one berth, and gives no probability of waiting.
    </Note>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <ShoreInputs />
      <ShoreResults />
    </div>
  </div>
);

export default ShoreBaseView;
