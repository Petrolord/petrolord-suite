// Fleet sizing (SC4): voyages a period by the largest of demand over capacity
// and the minimum visits, with the driver named, then vessels from
// vessel-days and the days a vessel is available, by stated rounding rules.
import React from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS,
} from '@/utils/chartTheme';
import { useMarineLogistics } from '@/contexts/MarineLogisticsContext';
import { fmtNum, fmtShare } from '@/utils/supplychain/marineAdapters';
import {
  ActivityChecks, Basis, Note, NumField, Panel, ResultGate, SelectField, Stat, VesselRouteFields,
} from './common';

const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
const SERIES = ['#2563eb', '#059669', '#7c3aed', '#d97706', '#0891b2', '#db2777'];

export const VOYAGE_ROUNDING = [
  { value: 'up', label: 'Up to whole voyages' },
  { value: 'none', label: 'Not rounded (the fractional average)' },
];
export const VESSEL_ROUNDING = [
  { value: 'up', label: 'Up to whole vessels' },
  { value: 'nearest', label: 'Nearest whole vessel (halves up)' },
  { value: 'none', label: 'Not rounded' },
];

/** The period, availability and rounding rules a fleet calculation states. */
export const PeriodFields = ({ section, testId }) => {
  const { inputs, setSection } = useMarineLogistics();
  const s = inputs[section];
  const set = (patch) => setSection(section, patch);
  return (
    <div className="grid grid-cols-2 gap-2">
      <NumField label="Period (days)" testId={`${testId}-period`} value={s.periodDays} onChange={(v) => set({ periodDays: v })} />
      <NumField label="Days a vessel is available in the period" testId={`${testId}-available`} value={s.vesselAvailableDays} onChange={(v) => set({ vesselAvailableDays: v })} hint="At most the period; your allowance for crew change and maintenance comes off here." />
      <SelectField label="Voyage rounding rule" testId={`${testId}-voyage-rounding`} value={s.voyageRounding} onChange={(v) => set({ voyageRounding: v })} options={VOYAGE_ROUNDING} />
      <SelectField label="Vessel rounding rule" testId={`${testId}-vessel-rounding`} value={s.vesselRounding} onChange={(v) => set({ vesselRounding: v })} options={VESSEL_ROUNDING} />
    </div>
  );
};

const FleetInputs = () => {
  const { inputs, setSection } = useMarineLogistics();
  const s = inputs.fleet;
  const set = (patch) => setSection('fleet', patch);
  return (
    <Panel title="Fleet sizing inputs" testId="fleet-inputs">
      <VesselRouteFields section="fleet" testId="fleet" />
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Port hours at the base a voyage" testId="fleet-port" value={s.portHours} onChange={(v) => set({ portHours: v })} />
        <NumField label="Fuel price (a tonne)" testId="fleet-fuelprice" value={s.fuelPricePerT} onChange={(v) => set({ fuelPricePerT: v })} />
        <NumField label="Weather factor (1 to 10)" testId="fleet-weather" value={s.weatherFactor} onChange={(v) => set({ weatherFactor: v })} />
      </div>
      <ActivityChecks value={s.appliesTo} onChange={(v) => set({ appliesTo: v })} testId="fleet-applies" />
      <PeriodFields section="fleet" testId="fleet" />
      <Note>Each installation&apos;s demand and minimum visits come from the Installations tab.</Note>
    </Panel>
  );
};

/** Vessel-days needed, stacked by voyage set, beside the fleet's capacity. */
export const VesselDaysChart = ({ sets, capacityDays, filename }) => {
  const needed = { name: 'Vessel-days needed' };
  sets.forEach((s) => { needed[s.id] = s.vesselDays; });
  const data = [needed, { name: 'Fleet capacity', capacity: capacityDays }];
  return (
    <div className="overflow-hidden rounded-lg border border-slate-700">
      <ChartFrame height={220} exportFilename={filename}>
        <BarChart data={data} margin={{ top: 16, right: 20, left: 0, bottom: 8 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="name" tick={tick} />
          <YAxis tick={tick} tickFormatter={(x) => fmtNum(x, 1)} width={50} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(x) => fmtNum(x, 4)} />
          <Legend {...LEGEND_PROPS} />
          {sets.map((s, i) => <Bar key={s.id} dataKey={s.id} name={s.id} stackId="need" fill={SERIES[i % SERIES.length]} isAnimationActive={false} />)}
          <Bar dataKey="capacity" name="Vessels x available days" stackId="need" fill="#94a3b8" isAnimationActive={false} />
        </BarChart>
      </ChartFrame>
    </div>
  );
};

const FleetResults = () => {
  const { results } = useMarineLogistics();
  return (
    <ResultGate result={results.fleet} testId="fleet">
      {(r) => (
        <Panel title="Fleet size" testId="fleet-results">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Vessels required" value={fmtNum(r.vessels, Number.isInteger(r.vessels) ? 0 : 4)} testId="fleet-vessels" />
            <Stat label="Vessels before rounding" value={fmtNum(r.vesselsExact, 4)} testId="fleet-vessels-exact" />
            <Stat label="Vessel-days needed" value={fmtNum(r.vesselDays, 4)} testId="fleet-vessel-days" />
            <Stat label="Vessel-days available" value={fmtNum(r.capacityDays, 4)} testId="fleet-capacity-days" />
            <Stat label={r.shortVesselDays > 0 ? 'Short by (vessel-days)' : 'Spare (vessel-days)'} value={fmtNum(r.shortVesselDays > 0 ? r.shortVesselDays : r.spareVesselDays, 4)} testId="fleet-spare" />
            <Stat label="Fleet utilisation" value={r.fleetUtilisation === null ? 'no vessels' : fmtShare(r.fleetUtilisation, 2)} testId="fleet-utilisation" />
            <Stat label="Fuel for the period (t)" value={fmtNum(r.fuelT, 4)} testId="fleet-fuel" />
            <Stat label="Fuel cost for the period" value={fmtNum(r.fuelCost, 2)} testId="fleet-cost" />
          </div>
          <table className="w-full text-xs">
            <thead className="text-left text-slate-400">
              <tr>
                <th className="p-1">Voyage set</th><th className="p-1 text-right">Voyages (exact)</th><th className="p-1 text-right">Voyages</th>
                <th className="p-1">Driven by</th><th className="p-1 text-right">Voyage days</th><th className="p-1 text-right">Vessel-days</th>
              </tr>
            </thead>
            <tbody>
              {r.voyageSets.map((s) => (
                <tr key={s.id} className="border-t border-slate-800 text-slate-200" data-testid={`fleet-set-${s.id}`}>
                  <td className="p-1">{s.id === 'milk-run' ? `Milk run (${s.stops.join(', ')})` : s.id}</td>
                  <td className="p-1 text-right font-mono" data-testid={`fleet-set-${s.id}-exact`}>{fmtNum(s.voyagesExact, 4)}</td>
                  <td className="p-1 text-right font-mono" data-testid={`fleet-set-${s.id}-voyages`}>{fmtNum(s.voyages, Number.isInteger(s.voyages) ? 0 : 4)}</td>
                  <td className="p-1" data-testid={`fleet-set-${s.id}-driver`}>{s.drivenBy}</td>
                  <td className="p-1 text-right font-mono" data-testid={`fleet-set-${s.id}-days`}>{fmtNum(s.voyageDays, 4)}</td>
                  <td className="p-1 text-right font-mono" data-testid={`fleet-set-${s.id}-vessel-days`}>{fmtNum(s.vesselDays, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <VesselDaysChart sets={r.voyageSets} capacityDays={r.capacityDays} filename="fleet-vessel-days" />
          {r.voyageSets.map((s) => (
            <details key={s.id} className="rounded-md border border-slate-800 p-2 text-xs text-slate-300">
              <summary className="cursor-pointer text-slate-200">Average utilisation a voyage: {s.id}</summary>
              <table className="mt-1 w-full">
                <thead className="text-left text-slate-400"><tr><th className="p-1">Constraint</th><th className="p-1 text-right">Demand</th><th className="p-1 text-right">Capacity a voyage</th><th className="p-1 text-right">Average utilisation</th></tr></thead>
                <tbody>
                  {s.constraints.map((c, i) => (
                    <tr key={c.constraint} className="border-t border-slate-800" data-testid={`fleet-set-${s.id}-util-${i}`}>
                      <td className="p-1">{c.constraint}</td>
                      <td className="p-1 text-right font-mono">{fmtNum(c.demand, 2)}</td>
                      <td className="p-1 text-right font-mono">{fmtNum(c.capacity, 2)}</td>
                      <td className="p-1 text-right font-mono">{fmtShare(c.averageUtilisation, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ))}
          <Basis reasons={r.reasons} basis={r.basis} testId="fleet-basis" />
        </Panel>
      )}
    </ResultGate>
  );
};

const FleetSizingView = () => (
  <div className="space-y-4">
    <Note>
      Voyages in the period are the larger of the demand over one voyage&apos;s capacity (on the constraint that needs the most voyages)
      and the minimum visits, rounded by your rule. Vessel-days are voyages times voyage days; vessels are vessel-days over the days a
      vessel is available, rounded by your rule.
    </Note>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <FleetInputs />
      <FleetResults />
    </div>
  </div>
);

export default FleetSizingView;
