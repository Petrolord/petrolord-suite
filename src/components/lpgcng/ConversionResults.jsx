// The customer's decision: does switching pay, and does it cut carbon (DS7).
import React from 'react';
import { AlertTriangle, Leaf } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useLpgCng } from '@/contexts/LpgCngContext';

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

const ConversionResults = () => {
  const { conversion: c } = useLpgCng();

  if (c.error) {
    return (
      <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-100">{c.error}</p>
      </div>
    );
  }

  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
  const chart = [
    { name: c.baseFuel.label, fuel: c.baseFuel.costPerYear, maintenance: 0 },
    { name: c.newFuel.label, fuel: c.newFuel.costPerYear, maintenance: c.annualExtraMaintenance },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Per kilometre, not per unit sold</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          Litres against kilograms is meaningless. The comparison has to be per unit of useful
          energy, or better still per kilometre, which is what the customer actually buys. The new
          fuel&apos;s consumption here is
          {' '}
          {c.consumptionSource}
          .
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label={`${c.baseFuel.label} per km`} value={fmt(c.baseFuel.costPerKm, 2)} hint={`${fmt(c.baseFuel.unitsPerYear, 0)} units a year`} />
          <Stat label={`${c.newFuel.label} per km`} value={fmt(c.newFuel.costPerKm, 2)} hint={`${fmt(c.newFuel.unitsPerYear, 0)} units a year`} />
          <Stat label="Saving per km" value={fmt(c.savingPerKm, 2)} />
          <Stat label="Annual saving" value={fmt(c.annualSaving, 0)} hint={`after ${fmt(c.annualExtraMaintenance, 0)} of extra maintenance`} />
        </div>
      </div>

      <ChartFrame height={260} exportFilename="conversion-annual-cost">
        <BarChart data={chart} margin={{ top: 12, right: 24, left: 24, bottom: 28 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={tick} />
          <YAxis stroke={CHART_COLORS.axisLine} tick={tick} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v) => fmt(v, 0)} />
          <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
          <Bar dataKey="fuel" name="Fuel" stackId="a" fill="#0891b2" />
          <Bar dataKey="maintenance" name="Extra maintenance" stackId="a" fill="#f59e0b" />
        </BarChart>
      </ChartFrame>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Payback</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Conversion cost" value={fmt(c.conversionCost, 0)} />
          <Stat label="Simple payback"
            value={c.simplePaybackYears === null ? 'none' : `${fmt(c.simplePaybackYears, 2)} years`} />
          <Stat label="Recurring cash flow" value={fmt(c.annualCashFlow.recurring, 0)} hint="per year" />
        </div>
        <p className="text-[11px] text-slate-500 mt-2">{c.paybackNote}</p>
      </div>

      <div className="rounded border border-slate-800 bg-slate-900/60 p-3 flex items-start gap-2">
        <Leaf className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm text-white">
            {c.kgCo2eAvoidedPerYear === null
              ? 'Carbon not computed'
              : `${fmt(c.kgCo2eAvoidedPerYear, 0)} kgCO2e ${c.kgCo2eAvoidedPerYear >= 0 ? 'avoided' : 'added'} a year`}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {c.carbonNote
              || 'A cheaper fuel per kilometre can still emit more. The two are separate questions and this reports them separately rather than assuming the switch is green because it is cheap.'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ConversionResults;
