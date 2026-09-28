// The flare's footprint, the counterfactual, and the credit case (DS10).
import React from 'react';
import { AlertTriangle, CheckCircle2, Leaf } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { NumericTable, NumTh, NumRow, NumCell } from '@/components/ui/numeric-table';
import { useFlareToValue } from '@/contexts/FlareToValueContext';

const fmt = (v, dp = 1) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : 'not available');

// KPI tile in theme roles; numbers in the mono face, words in the sans.
const Stat = ({ label, value, hint, mono = true }) => (
  <div className="rounded-lg border border-pl-border bg-pl-surface p-3 shadow-pl-sm">
    <p className="text-[10px] uppercase tracking-wide text-pl-muted">{label}</p>
    <p className={`text-lg font-semibold text-pl-text break-words ${mono ? 'font-pl-mono tabular-nums' : ''}`}>{value}</p>
    {hint && <p className="text-[11px] text-pl-muted mt-0.5">{hint}</p>}
  </div>
);

const WARNING_CALLOUT = 'rounded-lg border border-pl-warning/40 bg-pl-warning-bg p-4 flex items-start gap-3 text-pl-warning-text';

const AbatementResults = () => {
  const { flareAbatement: a, creditCase } = useFlareToValue();
  const net = a.error ? null : a.netAbatementTonnesCo2ePerYear;
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  if (a.error) {
    return (
      <div className={WARNING_CALLOUT}>
        <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-sm">{a.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">What the flare emits</h3>
        <p className="text-[11px] text-pl-muted mb-2">
          Computed from the gas analysis: the hydrocarbon carbon that burns, the CO2 already in the gas, and the methane that escapes. This is the flare&apos;s own footprint,
          which is a different question from what recovering it would abate.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="CO2 burned" value={`${fmt(a.flareCo2Tonnes, 0)} t/yr`} />
          <Stat label="Methane slipped" value={`${fmt(a.flareCh4Tonnes, 0)} t/yr`} />
          <Stat label="Total" value={a.flareCo2eTonnes === null ? 'needs a methane GWP' : `${fmt(a.flareCo2eTonnes, 0)} tCO2e/yr`} mono={a.flareCo2eTonnes !== null} />
          <Stat label="Methane share"
            value={a.methaneShareOfFlareCo2e === null ? '-' : `${fmt(a.methaneShareOfFlareCo2e * 100, 0)}%`}
            hint="of the flare's CO2e" />
        </div>
        <p className="text-[11px] text-pl-muted mt-2">{a.basis}</p>
        {a.combustionEfficiencyNote && <p className="text-[11px] text-pl-warning-text mt-1">{a.combustionEfficiencyNote}</p>}
        {a.methaneShareOfFlareCo2e !== null && a.methaneShareOfFlareCo2e > 0.25 && (
          <p className="text-[11px] text-pl-warning-text mt-2">
            Most of this flare&apos;s impact is the methane it fails to burn. The CO2 from what it does burn is the smaller part.
            That is why the destruction efficiency is an input with no assumed value.
          </p>
        )}
      </div>

      <div className={`rounded-lg border p-4 flex items-start gap-3 ${
        net !== null
          ? 'border-pl-success/40 bg-pl-success-bg text-pl-success-text'
          : 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text'}`}
      >
        {net !== null
          ? <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
          : <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />}
        <div>
          <p className="font-semibold">
            {net !== null
              ? `${fmt(net, 0)} tCO2e a year abated against "${a.counterfactualLabel}"`
              : 'No abatement reported'}
          </p>
          <p className="text-sm mt-1">
            {net !== null
              ? `The flare emitted ${fmt(a.flareCo2eTonnes, 0)} tCO2e, of which recovering ${fmt(a.recoveryFraction * 100, 0)} percent avoids ${fmt(a.avoidedFlareCo2eTonnes, 0)}; the product will emit ${fmt(a.productCombustionTonnesCo2ePerYear, 0)} and displaces ${fmt(a.displacedFuelTonnesCo2ePerYear, 0)}. The abatement is the difference, and it is neither reliably above nor below the flare's own figure.`
              : (a.warning || 'No abatement is reported until every input it rests on is given.')}
          </p>
          {net === null && a.blockedBy && (
            <p className="text-sm mt-1">{`Blocked by: ${a.blockedBy}.`}</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1 flex items-center gap-2">
          <Leaf className="w-4 h-4 text-pl-muted" aria-hidden="true" /> Does it need carbon credits?
        </h3>
        {creditCase.error ? (
          <div className={WARNING_CALLOUT}>
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-sm">{creditCase.error}</p>
          </div>
        ) : (
          <>
            <p className={`text-sm mb-2 ${creditCase.standsAloneWithoutCredits ? 'text-pl-success-text' : 'text-pl-warning-text'}`}>
              {creditCase.verdict}
            </p>
            {creditCase.breakevenCreditPrice !== null && creditCase.breakevenCreditPrice > 0 && (
              <p className="text-[11px] text-pl-muted mb-2">
                {`Breakeven credit price ${fmt(creditCase.breakevenCreditPrice, 2)} per tonne. ${creditCase.lowestTestedClearingPrice === null ? 'No price tested reaches it.' : `The lowest price tested that clears is ${fmt(creditCase.lowestTestedClearingPrice, 2)}.`}`}
              </p>
            )}
            <ChartFrame height={260} exportFilename="credit-sensitivity">
              <LineChart data={creditCase.points} margin={{ top: 12, right: 24, left: 24, bottom: 28 }}>
                <CartesianGrid {...GRID_STYLE} />
                {/* FLARE-T1-001: a numeric price axis (5, 15, 30 and 60 were
                    spaced evenly on a category axis) and margins in $M */}
                <XAxis dataKey="creditPrice" type="number" domain={[0, 'dataMax']}
                  ticks={creditCase.points.map((p) => p.creditPrice)} stroke={CHART_COLORS.axisLine} tick={tick}
                  label={{ value: 'Credit price ($ per tCO2e)', position: 'insideBottom', offset: -18, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
                <YAxis stroke={CHART_COLORS.axisLine} tick={tick} domain={[0, 'auto']} width={56}
                  tickFormatter={(v) => `${Number((v / 1e6).toFixed(1))}M`}
                  label={{ value: 'Margin ($/yr)', angle: -90, position: 'insideLeft', offset: -12, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmt(v, 0)} labelFormatter={(v) => `$${v} per tCO2e`} />
                <ReferenceLine y={creditCase.hurdleMarginPerYear} stroke="#dc2626" strokeDasharray="4 4"
                  label={{ value: 'hurdle', fill: '#dc2626', fontSize: 11 }} />
                <Line type="monotone" dataKey="totalMarginPerYear" name="Margin with credits" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ChartFrame>
            {/* The credit sensitivity is money, so it reads as a ledger; the
                hurdle answer keeps its word beside the status tone. */}
            <NumericTable className="mt-3">
              <thead>
                <tr>
                  <NumTh numeric>Credit price</NumTh>
                  <NumTh numeric>Credit revenue/yr</NumTh>
                  <NumTh numeric>Total margin/yr</NumTh>
                  <NumTh>Clears the hurdle</NumTh>
                </tr>
              </thead>
              <tbody>
                {creditCase.points.map((p) => (
                  <NumRow key={p.creditPrice}>
                    <NumCell value={p.creditPrice}>{fmt(p.creditPrice, 0)}</NumCell>
                    <NumCell value={p.creditRevenuePerYear}>{fmt(p.creditRevenuePerYear, 0)}</NumCell>
                    <NumCell value={p.totalMarginPerYear}>{fmt(p.totalMarginPerYear, 0)}</NumCell>
                    <td className={`border-b border-pl-border px-3 py-2 text-xs ${p.clearsHurdle === null ? 'text-pl-muted' : p.clearsHurdle ? 'text-pl-success-text' : 'text-pl-danger-text'}`}>
                      {p.clearsHurdle === null ? '-' : p.clearsHurdle ? 'yes' : 'no'}
                    </td>
                  </NumRow>
                ))}
              </tbody>
            </NumericTable>
          </>
        )}
      </div>
    </div>
  );
};

export default AbatementResults;
