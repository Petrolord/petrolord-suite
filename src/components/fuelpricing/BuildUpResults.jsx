// The landed cost, the pump price, and where the money goes (DS6).
import React from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Cell as BarCell,
} from 'recharts';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useFuelPricing } from '@/contexts/FuelPricingContext';

const fmt = (v, dp = 2) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : 'not supplied');

const GROUP_COLORS = ['#0891b2', '#dc2626', '#f59e0b', '#7c3aed', '#059669', '#64748b'];

const BuildUpResults = () => {
  const { landed, pump, waterfall, sensitivity, inputs } = useFuelPricing();
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  if (landed.error) {
    return (
      <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-100">{landed.error}</p>
      </div>
    );
  }

  const capped = pump.capPerLitre !== null;
  const short = capped && pump.shortfallPerLitre > 0;

  return (
    <div className="space-y-5">
      <div className={`rounded-lg border p-4 flex items-start gap-3 ${
        short ? 'border-red-800/60 bg-red-950/30'
          : landed.complete && pump.complete ? 'border-emerald-800/60 bg-emerald-950/30'
            : 'border-amber-800/60 bg-amber-950/30'}`}
      >
        {short ? <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
          : landed.complete && pump.complete ? <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
            : <Info className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />}
        <div>
          <p className="font-semibold text-white">
            {`Pump price ${fmt(pump.pricePerLitre)} per litre`}
            {capped && ` against a cap of ${fmt(pump.capPerLitre)}`}
          </p>
          <p className="text-sm text-slate-300 mt-1">
            {short
              ? `The cap sits ${fmt(pump.shortfallPerLitre)} per litre below what the chain costs. That does not make the cost go away; somebody in the chain is absorbing it.`
              : capped
                ? `The cap covers the chain with ${fmt(Math.abs(pump.shortfallPerLitre))} per litre to spare.`
                : 'No regulated cap entered, so the price is what the build-up says it is.'}
          </p>
          {(!landed.complete || !pump.complete) && (
            <p className="text-sm text-amber-200 mt-1">
              {`${landed.basisOfTotal} ${pump.complete ? '' : pump.basisOfPrice}`}
            </p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">The landed cost, stage by stage</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          A charge levied as a percentage of CIF depends on what CIF already is, so the order is
          part of the answer. Ocean loss divides rather than adds: you pay for the loaded quantity
          and you sell the outturn.
        </p>
        <div className="overflow-x-auto rounded border border-slate-800">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="text-left px-2 py-1.5">Line</th>
                <th className="text-left px-2 py-1.5">Basis</th>
                <th className="text-right px-2 py-1.5">Rate</th>
                <th className="text-right px-2 py-1.5">Cargo ($)</th>
                <th className="text-right px-2 py-1.5">$/litre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {landed.lines.map((l) => (
                <tr key={l.key} className={l.required ? 'bg-amber-950/20' : ''}>
                  <td className="px-2 py-1 text-slate-200">{l.label}</td>
                  <td className="px-2 py-1 text-slate-500">{l.basis}</td>
                  <td className="px-2 py-1 text-right text-slate-400">{l.rate === null ? 'required' : fmt(l.rate, 3)}</td>
                  <td className="px-2 py-1 text-right text-slate-200">{l.amount === null ? '-' : fmt(l.amount, 0)}</td>
                  <td className="px-2 py-1 text-right text-slate-300">{l.perLitre === null ? '-' : fmt(l.perLitre, 4)}</td>
                </tr>
              ))}
              <tr className="bg-slate-900/60 font-semibold">
                <td className="px-2 py-1 text-white" colSpan={3}>
                  {landed.complete ? 'Landed' : 'Landed (floor)'}
                </td>
                <td className="px-2 py-1 text-right text-white">{fmt(landed.totalUsd, 0)}</td>
                <td className="px-2 py-1 text-right text-white">{fmt(landed.perLitreUsd, 4)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 mt-1">
          {`Outturn ${fmt(landed.outturn.litres, 0)} litres after ${fmt(landed.oceanLossPercent, 2)}% ocean loss`}
          {landed.perLitreLocal !== null && ` — ${fmt(landed.perLitreLocal, 2)} per litre at ${fmt(landed.fxRate, 0)} to the dollar`}
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Depot gate to nozzle</h3>
        <div className="overflow-x-auto rounded border border-slate-800">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="text-left px-2 py-1.5">Element</th>
                <th className="text-left px-2 py-1.5">Recipient</th>
                <th className="text-right px-2 py-1.5">Per litre</th>
                <th className="text-right px-2 py-1.5">Running</th>
                <th className="text-right px-2 py-1.5">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {pump.lines.map((l) => (
                <tr key={l.key} className={l.required ? 'bg-amber-950/20' : ''}>
                  <td className="px-2 py-1 text-slate-200">{l.label}</td>
                  <td className="px-2 py-1 text-slate-500">{l.recipient || (l.key === 'landed' ? 'Product' : 'unattributed')}</td>
                  <td className="px-2 py-1 text-right text-slate-200">{l.amount === null ? 'required' : fmt(l.amount)}</td>
                  <td className="px-2 py-1 text-right text-slate-400">{fmt(l.running)}</td>
                  <td className="px-2 py-1 text-right text-slate-300">{l.share === null ? '-' : `${fmt(l.share * 100, 1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Where the money in a litre goes</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          Elements with no recipient named are grouped as unattributed rather than assigned to
          anybody, because guessing is how this argument goes wrong in public.
        </p>
        <ChartFrame height={260} exportFilename="pump-price-waterfall">
          <BarChart data={waterfall.groups} margin={{ top: 12, right: 24, left: 16, bottom: 28 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="recipient" stroke={CHART_COLORS.axisLine} tick={tick} interval={0} angle={-15} textAnchor="end" height={60} />
            <YAxis stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'per litre', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v) => fmt(v)} />
            <Bar dataKey="amountPerLitre" name="Per litre">
              {waterfall.groups.map((g, i) => (
                <BarCell key={g.recipient} fill={GROUP_COLORS[i % GROUP_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ChartFrame>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">What the exchange rate does to the price</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          The chain is re-priced at each rate rather than scaled, because only part of the build-up
          is in dollars. Where a cap is entered, the rate at which it stops covering the chain is
          solved for; where the price never crosses the cap in the range, the app says so instead
          of returning an endpoint.
        </p>
        <ChartFrame height={260} exportFilename="fx-sensitivity">
          <LineChart data={sensitivity.points} margin={{ top: 12, right: 24, left: 16, bottom: 28 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="value" stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'exchange rate', position: 'insideBottom', offset: -18, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <YAxis stroke={CHART_COLORS.axisLine} tick={tick} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v) => fmt(v)} />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
            {sensitivity.capPerLitre !== null && (
              <ReferenceLine y={sensitivity.capPerLitre} stroke="#dc2626" strokeDasharray="4 4"
                label={{ value: 'cap', fill: '#dc2626', fontSize: 11 }} />
            )}
            <Line type="monotone" dataKey="pricePerLitre" name="Pump price" stroke="#0891b2" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ChartFrame>
        <p className="text-[11px] mt-1">
          {sensitivity.breakeven === null
            ? <span className="text-slate-500">Enter a regulated cap to solve for the rate at which it stops covering the chain.</span>
            : sensitivity.breakeven.found
              ? <span className="text-amber-300">{`The cap stops covering the chain at about ${fmt(sensitivity.breakeven.value, 0)} to the dollar.`}</span>
              : <span className="text-slate-500">{sensitivity.breakeven.reason}</span>}
        </p>
      </div>
    </div>
  );
};

export default BuildUpResults;
