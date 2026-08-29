// The flare's footprint, the counterfactual, and the credit case (DS10).
import React from 'react';
import { AlertTriangle, CheckCircle2, Leaf } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useFlareToValue } from '@/contexts/FlareToValueContext';

const fmt = (v, dp = 1) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : 'not available');

const Stat = ({ label, value, hint }) => (
  <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
    <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
    <p className="text-lg font-semibold text-white">{value}</p>
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

const AbatementResults = () => {
  const { flareAbatement: a, creditCase } = useFlareToValue();
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  if (a.error) {
    return (
      <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-100">{a.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-white mb-1">What the flare emits</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          Computed from the carbon in the gas, atom by atom. This is the flare&apos;s own footprint,
          which is a different question from what recovering it would abate.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="CO2 burned" value={`${fmt(a.flareCo2Tonnes, 0)} t/yr`} />
          <Stat label="Methane slipped" value={`${fmt(a.flareCh4Tonnes, 0)} t/yr`} />
          <Stat label="Total" value={a.flareCo2eTonnes === null ? 'needs a methane GWP' : `${fmt(a.flareCo2eTonnes, 0)} tCO2e/yr`} />
          <Stat label="Methane share"
            value={a.methaneShareOfFlareCo2e === null ? '-' : `${fmt(a.methaneShareOfFlareCo2e * 100, 0)}%`}
            hint="of the flare's CO2e" />
        </div>
        {a.methaneShareOfFlareCo2e !== null && a.methaneShareOfFlareCo2e > 0.25 && (
          <p className="text-[11px] text-amber-300 mt-2">
            Most of this flare&apos;s impact is the methane it fails to burn, not the CO2 it does.
            That is why the destruction efficiency is asked for rather than assumed.
          </p>
        )}
      </div>

      <div className={`rounded-lg border p-4 flex items-start gap-3 ${
        a.counterfactualDeclared
          ? 'border-emerald-800/60 bg-emerald-950/30'
          : 'border-amber-800/60 bg-amber-950/30'}`}
      >
        {a.counterfactualDeclared
          ? <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
          : <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />}
        <div>
          <p className="font-semibold text-white">
            {a.counterfactualDeclared
              ? `${fmt(a.netAbatementTonnesCo2ePerYear, 0)} tCO2e a year abated against "${a.counterfactualLabel}"`
              : 'No abatement reported'}
          </p>
          <p className="text-sm text-slate-300 mt-1">
            {a.counterfactualDeclared
              ? `The flare emitted ${fmt(a.flareCo2eTonnes, 0)} tCO2e; the product will emit ${fmt(a.productCombustionTonnesCo2ePerYear, 0)} and displaces ${fmt(a.displacedFuelTonnesCo2ePerYear, 0)}. The abatement is the difference, and it is neither reliably above nor below the flare's own figure.`
              : a.warning}
          </p>
          {!a.counterfactualDeclared && a.blockedBy && (
            <p className="text-sm text-amber-200 mt-1">{`Blocked by: ${a.blockedBy}.`}</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
          <Leaf className="w-4 h-4 text-emerald-400" /> Does it need carbon credits?
        </h3>
        {creditCase.error ? (
          <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-100">{creditCase.error}</p>
          </div>
        ) : (
          <>
            <p className={`text-sm mb-2 ${creditCase.standsAloneWithoutCredits ? 'text-emerald-300' : 'text-amber-300'}`}>
              {creditCase.verdict}
            </p>
            <ChartFrame height={260} exportFilename="credit-sensitivity">
              <LineChart data={creditCase.points} margin={{ top: 12, right: 24, left: 24, bottom: 28 }}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis dataKey="creditPrice" stroke={CHART_COLORS.axisLine} tick={tick}
                  label={{ value: 'credit price per tonne', position: 'insideBottom', offset: -18, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
                <YAxis stroke={CHART_COLORS.axisLine} tick={tick} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => fmt(v, 0)} />
                <ReferenceLine y={creditCase.hurdleMarginPerYear} stroke="#dc2626" strokeDasharray="4 4"
                  label={{ value: 'hurdle', fill: '#dc2626', fontSize: 11 }} />
                <Line type="monotone" dataKey="totalMarginPerYear" name="Margin with credits" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ChartFrame>
            <div className="overflow-x-auto rounded border border-slate-800 mt-3">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/80 text-slate-400">
                  <tr>
                    <th className="text-right px-2 py-1.5">Credit price</th>
                    <th className="text-right px-2 py-1.5">Credit revenue/yr</th>
                    <th className="text-right px-2 py-1.5">Total margin/yr</th>
                    <th className="text-left px-2 py-1.5">Clears the hurdle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {creditCase.points.map((p) => (
                    <tr key={p.creditPrice}>
                      <td className="px-2 py-1 text-right text-slate-300">{fmt(p.creditPrice, 0)}</td>
                      <td className="px-2 py-1 text-right text-slate-300">{fmt(p.creditRevenuePerYear, 0)}</td>
                      <td className="px-2 py-1 text-right text-white">{fmt(p.totalMarginPerYear, 0)}</td>
                      <td className={`px-2 py-1 ${p.clearsHurdle ? 'text-emerald-300' : 'text-red-300'}`}>
                        {p.clearsHurdle === null ? '-' : p.clearsHurdle ? 'yes' : 'no'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AbatementResults;
