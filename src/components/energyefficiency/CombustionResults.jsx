// Stoichiometry, stack losses and what tuning is worth (DS8).
import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell as BarCell } from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useEnergyEfficiency } from '@/contexts/EnergyEfficiencyContext';

const fmt = (v, dp = 2) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : 'not supplied');

const Stat = ({ label, value, hint }) => (
  <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
    <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
    <p className="text-lg font-semibold text-white">{value}</p>
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

const LOSS_COLORS = ['#dc2626', '#0891b2', '#f59e0b', '#7c3aed'];

const CombustionResults = () => {
  const {
    stoichiometry: st, currentEfficiency, targetEfficiency, tuningSaving,
  } = useEnergyEfficiency();

  if (st.error) {
    return (
      <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-100">{st.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Combustion, from your fuel analysis</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          Air required and flue gas produced come from the carbon and hydrogen in the fuel and the
          oxygen content of air. No chart and no rule of thumb: it is an atom balance. Inerts in
          the fuel are carried through, because they still have to be heated up the stack.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Oxygen needed" value={`${fmt(st.o2PerKmolFuel, 3)} kmol`} hint="per kmol of fuel" />
          <Stat label="Stoichiometric air" value={`${fmt(st.stoichAirPerKmolFuel, 2)} kmol`} hint={`${fmt(st.stoichAirKgPerKgFuel, 2)} kg per kg of fuel`} />
          <Stat label="CO2 produced" value={`${fmt(st.products.co2PerKmolFuel, 3)} kmol`} />
          <Stat label="Water produced" value={`${fmt(st.products.h2oPerKmolFuel, 3)} kmol`} hint="from the hydrogen" />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Where the heat goes</h3>
        {currentEfficiency.error ? <p className="text-sm text-amber-300">{currentEfficiency.error}</p> : (
          <>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 mb-3">
              <p className="font-semibold text-white">
                {`${fmt(currentEfficiency.efficiencyPercent, 2)}% efficient on ${currentEfficiency.basis}`}
              </p>
              <p className="text-sm text-amber-200 mt-1">{currentEfficiency.comparisonWarning}</p>
              <p className="text-[11px] text-slate-500 mt-1">{currentEfficiency.moistureBasisNote}</p>
            </div>
            <p className="text-[11px] text-slate-500 mb-2">
              The indirect method is used rather than the direct one because it says where the
              energy went, and that is the difference between a number and an action.
            </p>
            <ChartFrame height={240} exportFilename="stack-losses">
              <BarChart data={currentEfficiency.losses} margin={{ top: 12, right: 24, left: 16, bottom: 28 }}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis dataKey="label" stroke={CHART_COLORS.axisLine} tick={tickStyle()} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis stroke={CHART_COLORS.axisLine} tick={tickStyle()}
                  label={{ value: '% of fuel', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => `${fmt(v, 2)}%`} />
                <Bar dataKey="percent" name="Loss">
                  {currentEfficiency.losses.map((l, i) => (
                    <BarCell key={l.label} fill={LOSS_COLORS[i % LOSS_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartFrame>
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">What tuning the excess air is worth</h3>
        {tuningSaving.error ? (
          <div className={`rounded-lg border p-4 flex items-start gap-3 ${
            tuningSaving.belowSafeFloor
              ? 'border-red-800/60 bg-red-950/30' : 'border-amber-800/60 bg-amber-950/30'}`}
          >
            {tuningSaving.belowSafeFloor
              ? <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
              : <Info className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />}
            <p className="text-sm text-amber-100">{tuningSaving.error}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Now" value={`${fmt(currentEfficiency.efficiencyPercent, 2)}%`} hint={`at ${fmt(currentEfficiency.excessAirPercent, 0)}% excess air`} />
              <Stat label="Tuned" value={`${fmt(targetEfficiency.efficiencyPercent, 2)}%`} hint={`at ${fmt(targetEfficiency.excessAirPercent, 0)}% excess air`} />
              <Stat label="Fuel saved" value={`${fmt(tuningSaving.fuelSavingPercent, 2)}%`} />
              <Stat label="Energy saved" value={tuningSaving.annualEnergySavedGJ === null ? 'no annual fuel' : `${fmt(tuningSaving.annualEnergySavedGJ, 0)} GJ/yr`} />
            </div>
            <p className="text-[11px] text-slate-500 mt-2">{tuningSaving.method}</p>
          </>
        )}
      </div>
    </div>
  );
};

function tickStyle() {
  return { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
}

export default CombustionResults;
