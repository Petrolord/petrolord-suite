// Fleet variability (SC4): the fleet sized per iteration under a sampled
// weather factor and demand factor. The sampling is the engine's, through the
// canonical lib/stats mulberry32 stream; the P-labels follow
// lib/conventions/percentile.js, so P90 is the LOW figure.
import React from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell as BarCell, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { OUTCOME_LABELS, OUTCOME_ORDER } from '@/lib/percentileConventions';
import { useMarineLogistics } from '@/contexts/MarineLogisticsContext';
import { fmtNum, fmtShare } from '@/utils/supplychain/marineAdapters';
import {
  ActivityChecks, Basis, DistField, Note, NumField, Panel, ResultGate, Stat, VesselRouteFields,
} from './common';
import { PeriodFields } from './FleetSizingView';

const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

/** The P-label with the plain reading beside it: P90 is low, P10 is high. */
export const P_READING = { p90: 'low, the 10th percentile', p50: 'median', p10: 'high, the 90th percentile' };
export const pLabel = (k) => `${OUTCOME_LABELS[k]} (${P_READING[k]})`;
const STAT_ROWS = ['mean', ...OUTCOME_ORDER, 'min', 'max'];
const rowLabel = (k) => (OUTCOME_LABELS[k] ? pLabel(k) : k === 'mean' ? 'Mean' : k === 'min' ? 'Smallest' : 'Largest');

/** The fleet sizing settings copied into the variability controls, all visible there. */
export const COPIED_FROM_FLEET = ['vessel', 'mode', 'portHours', 'fuelPricePerT', 'appliesTo', 'periodDays', 'vesselAvailableDays', 'voyageRounding', 'vesselRounding'];

const VariabilityInputs = () => {
  const { inputs, setSection } = useMarineLogistics();
  const s = inputs.variability;
  const set = (patch) => setSection('variability', patch);
  const copyFleet = () => set(Object.fromEntries(COPIED_FROM_FLEET.map((k) => [k, inputs.fleet[k]])));
  return (
    <Panel
      title="Variability inputs"
      testId="variability-inputs"
      right={(
        <Button size="sm" variant="outline" className="h-7 border-slate-700 bg-slate-900 text-xs text-slate-200" onClick={copyFleet} data-testid="variability-copy-fleet">
          <Copy className="mr-1 h-3 w-3" /> Copy the fleet sizing inputs
        </Button>
      )}
    >
      <VesselRouteFields section="variability" testId="variability" />
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Port hours at the base a voyage" testId="variability-port" value={s.portHours} onChange={(v) => set({ portHours: v })} />
        <NumField label="Fuel price (a tonne)" testId="variability-fuelprice" value={s.fuelPricePerT} onChange={(v) => set({ fuelPricePerT: v })} />
      </div>
      <DistField
        title="Weather factor (1 to 10)"
        testId="variability-weather"
        mode={s.weatherMode}
        fixed={s.weatherFixed}
        tri={s.weatherTri}
        onMode={(v) => set({ weatherMode: v })}
        onFixed={(v) => set({ weatherFixed: v })}
        onTri={(v) => set({ weatherTri: v })}
      />
      <ActivityChecks value={s.appliesTo} onChange={(v) => set({ appliesTo: v })} testId="variability-applies" />
      <DistField
        title="Demand factor (multiplies every installation's demand)"
        testId="variability-demand"
        mode={s.demandMode}
        fixed={s.demandFixed}
        tri={s.demandTri}
        onMode={(v) => set({ demandMode: v })}
        onFixed={(v) => set({ demandFixed: v })}
        onTri={(v) => set({ demandTri: v })}
      />
      <PeriodFields section="variability" testId="variability" />
      <div className="grid grid-cols-3 gap-2">
        <NumField label="Planned vessels" testId="variability-planned" value={s.plannedVessels} onChange={(v) => set({ plannedVessels: v })} />
        <NumField label="Iterations" testId="variability-iterations" value={s.iterations} onChange={(v) => set({ iterations: v })} />
        <NumField label="Seed" testId="variability-seed" value={s.seed} onChange={(v) => set({ seed: v })} hint="The same seed and inputs give the same numbers every run." />
      </div>
    </Panel>
  );
};

const VariabilityResults = () => {
  const { results } = useMarineLogistics();
  return (
    <ResultGate result={results.variability} testId="variability">
      {(r) => {
        const dist = r.vesselsDistribution || [];
        return (
          <Panel title="Fleet under variability" testId="variability-results">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label={`Probability short with ${r.plannedVessels} planned`} value={fmtShare(r.probabilityShort, 2)} testId="variability-short" />
              <Stat label="Expected short vessel-days" value={fmtNum(r.expectedShortVesselDays, 4)} testId="variability-expected-short" />
              <Stat label="Planned capacity (vessel-days)" value={fmtNum(r.capacityDays, 4)} testId="variability-capacity" />
              <Stat label="At the most likely factors" value={`${fmtNum(r.plan.vesselDays, 4)} vessel-days, ${fmtNum(r.plan.vessels, Number.isInteger(r.plan.vessels) ? 0 : 4)} vessels`} testId="variability-plan" />
            </div>
            <table className="w-full text-xs">
              <thead className="text-left text-slate-400">
                <tr><th className="p-1">Statistic</th><th className="p-1 text-right">Vessel-days</th><th className="p-1 text-right">Vessels required</th></tr>
              </thead>
              <tbody>
                {STAT_ROWS.map((k) => (
                  <tr key={k} className="border-t border-slate-800 text-slate-200" data-testid={`variability-row-${k}`}>
                    <td className="p-1">{rowLabel(k)}</td>
                    <td className="p-1 text-right font-mono" data-testid={`variability-days-${k}`}>{fmtNum(r.vesselDays[k], 4)}</td>
                    <td className="p-1 text-right font-mono" data-testid={`variability-vessels-${k}`}>{fmtNum(r.vesselsRequired[k], 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Note testId="variability-definition">{r.percentileDefinition} For a vessel requirement P90 is therefore the low figure and P10 the high one.</Note>
            {dist.length ? (
              <>
                <table className="w-full text-xs">
                  <thead className="text-left text-slate-400"><tr><th className="p-1">Whole vessels required</th><th className="p-1 text-right">Share of iterations</th></tr></thead>
                  <tbody>
                    {dist.map((d) => (
                      <tr key={d.vessels} className="border-t border-slate-800 text-slate-200"><td className="p-1">{d.vessels}</td><td className="p-1 text-right font-mono" data-testid={`variability-dist-${d.vessels}`}>{fmtShare(d.probability, 2)}</td></tr>
                    ))}
                  </tbody>
                </table>
                <div className="overflow-hidden rounded-lg border border-slate-700">
                  <ChartFrame height={200} exportFilename="fleet-vessels-distribution">
                    <BarChart data={dist.map((d) => ({ name: String(d.vessels), value: 100 * d.probability, over: d.vessels > r.plannedVessels }))} margin={{ top: 16, right: 20, left: 0, bottom: 8 }}>
                      <CartesianGrid {...GRID_STYLE} />
                      <XAxis dataKey="name" tick={tick} label={{ value: 'Whole vessels required', position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 11 }} />
                      <YAxis tick={tick} tickFormatter={(x) => `${fmtNum(x, 0)}%`} width={50} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(x) => `${fmtNum(x, 2)}%`} />
                      <Bar dataKey="value" name="Share of iterations" isAnimationActive={false}>
                        {dist.map((d) => <BarCell key={d.vessels} fill={d.vessels > r.plannedVessels ? '#dc2626' : '#2563eb'} />)}
                      </Bar>
                    </BarChart>
                  </ChartFrame>
                </div>
                <Note>Red bars need more vessels than planned.</Note>
              </>
            ) : <Note testId="variability-no-dist">With vessels not rounded there is no count of whole vessels to chart.</Note>}
            <Basis basis={r.basis} testId="variability-basis" />
          </Panel>
        );
      }}
    </ResultGate>
  );
};

const FleetVariabilityView = () => (
  <div className="space-y-4">
    <Note>
      Each iteration draws the weather factor, then the demand factor, from one seeded random stream (each only when it varies), and
      sizes the fleet exactly as the Fleet sizing tab does. A draw is short when its vessel-days are above the planned vessels times the
      days a vessel is available.
    </Note>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <VariabilityInputs />
      <VariabilityResults />
    </div>
  </div>
);

export default FleetVariabilityView;
