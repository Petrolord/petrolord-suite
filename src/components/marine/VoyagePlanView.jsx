// Voyage plan (SC4): one vessel on a stated route, leg and activity hours with
// the weather factor, fuel and its cost, and the utilisation of every
// capacity constraint with the binding one named.
import React from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell as BarCell, ReferenceLine, Tooltip, XAxis, YAxis,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { useMarineLogistics } from '@/contexts/MarineLogisticsContext';
import { fmtNum, fmtShare } from '@/utils/supplychain/marineAdapters';
import {
  ActivityChecks, Basis, Note, NumField, Panel, ResultGate, Stat, VesselRouteFields,
} from './common';

const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
const unitOf = (c) => (c.unit === 'm3' ? 'm3' : c.unit);

const VoyageInputs = () => {
  const { inputs, setSection } = useMarineLogistics();
  const s = inputs.voyage;
  const set = (patch) => setSection('voyage', patch);
  return (
    <Panel title="Voyage inputs" testId="voyage-inputs">
      <VesselRouteFields section="voyage" testId="voyage" />
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Port hours at the base a voyage" testId="voyage-port" value={s.portHours} onChange={(v) => set({ portHours: v })} />
        <NumField label="Fuel price (a tonne)" testId="voyage-fuelprice" value={s.fuelPricePerT} onChange={(v) => set({ fuelPricePerT: v })} />
        <NumField label="Weather factor (1 to 10)" testId="voyage-weather" value={s.weatherFactor} onChange={(v) => set({ weatherFactor: v })} hint="Multiplies the time of the activities ticked below; fuel follows time." />
      </div>
      <ActivityChecks value={s.appliesTo} onChange={(v) => set({ appliesTo: v })} testId="voyage-applies" />
      <Note>Each installation carries its voyage cargo from the Installations tab.</Note>
    </Panel>
  );
};

const VoyageCard = ({ v }) => {
  const data = v.constraints.map((c) => ({ name: c.constraint, value: 100 * c.utilisation, binding: c.constraint === v.binding.constraint, over: v.overloaded.includes(c.constraint) }));
  const t = (k) => `voyage-${v.id}-${k}`;
  return (
    <div className="space-y-2 rounded-md border border-pl-border p-2" data-testid={t('card')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-pl-text">{v.id === 'milk-run' ? `Milk run: ${v.stops.join(', ')}` : `Dedicated voyage to ${v.id}`}</p>
        <span className={`rounded px-2 py-0.5 text-[11px] ${v.feasible ? 'bg-pl-success-bg text-pl-success-text' : 'bg-pl-warning-bg text-pl-warning-text'}`} data-testid={t('feasible')}>
          {v.feasible ? 'Fits the vessel' : `Overloaded: ${v.overloaded.join(', ')}`}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Binding constraint" value={`${v.binding.constraint}, ${fmtShare(v.binding.utilisation, 2)}`} testId={t('binding')} />
        <Stat label="Distance (NM)" value={fmtNum(v.nm, 2)} testId={t('nm')} />
        <Stat label="Voyage hours" value={fmtNum(v.hours.total, 4)} testId={t('hours')} />
        <Stat label="Voyage days" value={fmtNum(v.days, 4)} testId={t('days')} />
        <Stat label="Sailing hours" value={fmtNum(v.hours.sailing, 4)} testId={t('sailing')} />
        <Stat label="Port hours" value={fmtNum(v.hours.port, 4)} testId={t('port')} />
        <Stat label="Field hours" value={fmtNum(v.hours.field, 4)} testId={t('field')} />
        <Stat label="Fuel (t) and its cost" value={`${fmtNum(v.fuelT.total, 4)} t, ${fmtNum(v.fuelCost, 2)}`} testId={t('fuel')} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <table className="w-full text-xs">
          <thead className="text-left text-pl-muted">
            <tr><th className="p-1">Constraint</th><th className="p-1 text-right">Load</th><th className="p-1 text-right">Capacity</th><th className="p-1 text-right">Utilisation</th></tr>
          </thead>
          <tbody>
            {v.constraints.map((c, i) => (
              <tr key={c.constraint} className={`border-t border-pl-border ${c.constraint === v.binding.constraint ? 'font-semibold text-pl-text' : 'text-pl-text'}`} data-testid={t(`row-${i}`)}>
                <td className="p-1">{c.constraint}{c.constraint === v.binding.constraint ? ' (binding)' : ''}</td>
                <td className="p-1 text-right font-mono" data-testid={t(`load-${i}`)}>{fmtNum(c.load, 2)} {unitOf(c)}</td>
                <td className="p-1 text-right font-mono" data-testid={t(`capacity-${i}`)}>{fmtNum(c.capacity, 2)} {unitOf(c)}</td>
                <td className="p-1 text-right font-mono" data-testid={t(`util-${i}`)}>{fmtShare(c.utilisation, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="overflow-hidden rounded-lg border border-pl-border">
          <ChartFrame height={220} exportFilename={`voyage-utilisation-${v.id}`}>
            <BarChart data={data} margin={{ top: 16, right: 20, left: 0, bottom: 30 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="name" tick={{ ...tick, fontSize: 10 }} angle={-30} textAnchor="end" interval={0} height={50} />
              <YAxis tick={tick} tickFormatter={(x) => `${fmtNum(x, 0)}%`} width={50} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(x) => `${fmtNum(x, 2)}%`} />
              <ReferenceLine y={100} stroke="#dc2626" strokeDasharray="4 4" label={{ value: 'Capacity', fill: '#dc2626', fontSize: 10, position: 'insideTopRight' }} />
              <Bar dataKey="value" name="Utilisation" isAnimationActive={false}>
                {data.map((d) => <BarCell key={d.name} fill={d.over ? '#dc2626' : d.binding ? '#d97706' : '#2563eb'} />)}
              </Bar>
            </BarChart>
          </ChartFrame>
        </div>
      </div>
      <table className="w-full text-xs">
        <thead className="text-left text-pl-muted"><tr><th className="p-1">Leg</th><th className="p-1 text-right">NM</th><th className="p-1 text-right">Calm sailing hours</th></tr></thead>
        <tbody>
          {v.legs.map((l, i) => (
            <tr key={i} className="border-t border-pl-border text-pl-text"><td className="p-1">{l.from} to {l.to}</td><td className="p-1 text-right font-mono">{fmtNum(l.nm, 2)}</td><td className="p-1 text-right font-mono">{fmtNum(l.calmHours, 4)}</td></tr>
          ))}
        </tbody>
      </table>
      <Basis reasons={v.reasons} testId={t('reasons')} />
    </div>
  );
};

const VoyageResults = () => {
  const { results } = useMarineLogistics();
  return (
    <ResultGate result={results.voyage} testId="voyage">
      {(r) => (
        <Panel title="Voyage plan" testId="voyage-results">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Voyages" value={String(r.voyages.length)} testId="voyage-count" />
            <Stat label="Total days" value={fmtNum(r.totals.days, 4)} testId="voyage-total-days" />
            <Stat label="Total fuel (t)" value={fmtNum(r.totals.fuelT, 4)} testId="voyage-total-fuel" />
            <Stat label="Total fuel cost" value={fmtNum(r.totals.fuelCost, 2)} testId="voyage-total-cost" />
          </div>
          {r.voyages.map((v) => <VoyageCard key={v.id} v={v} />)}
          <Basis basis={r.basis} testId="voyage-basis" />
        </Panel>
      )}
    </ResultGate>
  );
};

const VoyagePlanView = () => (
  <div className="space-y-4">
    <Note>
      A voyage fits the vessel when every constraint is at or below its capacity: deck area (times the usable fraction), deck load,
      cargo deadweight (deck weight plus each bulk product at its density), and each tank. The binding constraint is the one with the
      highest utilisation.
    </Note>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <VoyageInputs />
      <VoyageResults />
    </div>
  </div>
);

export default VoyagePlanView;
