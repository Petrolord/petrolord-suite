// The landed cost, the pump price, and where the money goes (DS6).
import React from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Cell as BarCell,
} from 'recharts';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS, XAXIS_LABEL_HEIGHT, niceTicks,
} from '@/utils/chartTheme';
import { useFuelPricing } from '@/contexts/FuelPricingContext';
import {
  NumericTable, NumTh, NumRow, RowLabel, NumCell,
} from '@/components/ui/numeric-table';

const fmt = (v, dp = 2) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : 'not supplied');

// A text column inside a NumericTable (basis, recipient).
const BASIS_TD = 'border-b border-pl-border px-3 py-2 text-left text-xs text-pl-muted';

const GROUP_COLORS = ['#0891b2', '#dc2626', '#f59e0b', '#7c3aed', '#059669', '#64748b'];

const BuildUpResults = () => {
  const { landed, pump, waterfall, sensitivity, inputs } = useFuelPricing();
  const fxVals = (sensitivity.points || []).map((p) => p.value).filter(Number.isFinite);
  const pxVals = (sensitivity.points || []).map((p) => p.pricePerLitre).filter(Number.isFinite)
    .concat(Number.isFinite(sensitivity.capPerLitre) ? [sensitivity.capPerLitre] : []);
  const fxAxis = fxVals.length ? niceTicks(Math.min(...fxVals), Math.max(...fxVals), 8) : { domain: ['auto', 'auto'] };
  const pxAxis = pxVals.length ? niceTicks(0, Math.max(...pxVals), 5) : { domain: ['auto', 'auto'] };
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  if (landed.error) {
    return (
      <div className="rounded-lg border border-pl-warning/40 bg-pl-warning-bg p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-pl-warning-text mt-0.5 shrink-0" />
        <p className="text-sm text-pl-warning-text">{landed.error}</p>
      </div>
    );
  }

  const capped = pump.capPerLitre !== null;
  const short = capped && pump.shortfallPerLitre > 0;

  return (
    <div className="space-y-5">
      <div className={`rounded-lg border p-4 flex items-start gap-3 ${
        short ? 'border-pl-danger/40 bg-pl-danger-bg'
          : landed.complete && pump.complete ? 'border-pl-success/40 bg-pl-success-bg'
            : 'border-pl-warning/40 bg-pl-warning-bg'}`}
      >
        {short ? <AlertTriangle className="w-5 h-5 text-pl-danger-text mt-0.5 shrink-0" />
          : landed.complete && pump.complete ? <CheckCircle2 className="w-5 h-5 text-pl-success-text mt-0.5 shrink-0" />
            : <Info className="w-5 h-5 text-pl-warning-text mt-0.5 shrink-0" />}
        <div>
          <p className="font-semibold text-pl-text">
            {/* Senior test T1: with rates missing this figure is a floor, and
                the headline called it the pump price. */}
            {`Pump price ${landed.complete && pump.complete ? '' : 'at least '}${fmt(pump.pricePerLitre)} per litre`}
            {capped && ` against a cap of ${fmt(pump.capPerLitre)}`}
          </p>
          <p className="text-sm text-pl-text mt-1">
            {short
              ? `The cap sits ${fmt(pump.shortfallPerLitre)} per litre below what the chain costs. That does not make the cost go away; somebody in the chain is absorbing it.`
              : capped
                ? `The cap covers the chain with ${fmt(Math.abs(pump.shortfallPerLitre))} per litre to spare.`
                : 'No regulated cap entered, so the price is what the build-up says it is.'}
          </p>
          {(!landed.complete || !pump.complete) && (
            <p className="text-sm text-pl-warning-text mt-1">
              {`${landed.basisOfTotal} ${pump.complete ? '' : pump.basisOfPrice}`}
            </p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">The landed cost, stage by stage</h3>
        <p className="text-[11px] text-pl-muted mb-2">
          A charge levied as a percentage of CIF depends on what CIF already is, so the order is
          part of the answer. Ocean loss divides and does not add: you pay for the loaded quantity
          and you sell the outturn.
        </p>
        <NumericTable className="p-0" data-testid="landed-cost-table">
          <thead>
            <tr>
              <NumTh sticky>Line</NumTh>
              <NumTh>Basis</NumTh>
              <NumTh numeric>Rate</NumTh>
              <NumTh numeric>Cargo ($)</NumTh>
              <NumTh numeric>$/litre</NumTh>
            </tr>
          </thead>
          <tbody>
            {landed.lines.map((l) => (
              <NumRow key={l.key} className={l.required ? 'bg-pl-warning-bg' : ''}>
                <RowLabel className={l.required ? 'bg-pl-warning-bg' : ''}>{l.label}</RowLabel>
                <td className={BASIS_TD}>{l.basis}</td>
                <NumCell className="text-pl-muted">{l.rate === null ? 'required' : fmt(l.rate, 3)}</NumCell>
                <NumCell value={l.amount}>{l.amount === null ? '-' : fmt(l.amount, 0)}</NumCell>
                <NumCell value={l.perLitre}>{l.perLitre === null ? '-' : fmt(l.perLitre, 4)}</NumCell>
              </NumRow>
            ))}
            <NumRow>
              <RowLabel total colSpan={3}>
                {landed.complete ? 'Landed' : 'Landed (floor)'}
              </RowLabel>
              <NumCell total value={landed.totalUsd}>{fmt(landed.totalUsd, 0)}</NumCell>
              <NumCell total value={landed.perLitreUsd}>{fmt(landed.perLitreUsd, 4)}</NumCell>
            </NumRow>
          </tbody>
        </NumericTable>
        <p className="text-[11px] text-pl-muted mt-1">
          {`Outturn ${fmt(landed.outturn.litres, 0)} litres after ${fmt(landed.oceanLossPercent, 2)}% ocean loss`}
          {landed.perLitreLocal !== null && `, or ${fmt(landed.perLitreLocal, 2)} per litre at ${fmt(landed.fxRate, 0)} to the dollar`}
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">Depot gate to nozzle</h3>
        <NumericTable className="p-0" data-testid="pump-build-up-table">
          <thead>
            <tr>
              <NumTh sticky>Element</NumTh>
              <NumTh>Recipient</NumTh>
              <NumTh numeric>Per litre</NumTh>
              <NumTh numeric>Running</NumTh>
              <NumTh numeric>Share</NumTh>
            </tr>
          </thead>
          <tbody>
            {pump.lines.map((l) => (
              <NumRow key={l.key} className={l.required ? 'bg-pl-warning-bg' : ''}>
                <RowLabel className={l.required ? 'bg-pl-warning-bg' : ''}>{l.label}</RowLabel>
                <td className={BASIS_TD}>{l.recipient || (l.key === 'landed' ? 'Product' : 'unattributed')}</td>
                <NumCell value={l.amount}>{l.amount === null ? 'required' : fmt(l.amount)}</NumCell>
                <NumCell value={l.running}>{fmt(l.running)}</NumCell>
                <NumCell value={l.share}>{l.share === null ? '-' : `${fmt(l.share * 100, 1)}%`}</NumCell>
              </NumRow>
            ))}
          </tbody>
        </NumericTable>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">Where the money in a litre goes</h3>
        <p className="text-[11px] text-pl-muted mb-2">
          Elements with no recipient named are grouped as unattributed and are not assigned to
          anybody, because guessing is how this argument goes wrong in public.
        </p>
        <ChartFrame height={260} exportFilename="pump-price-waterfall">
          <BarChart data={waterfall.groups} margin={{ top: 12, right: 24, left: 16, bottom: 28 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="recipient" stroke={CHART_COLORS.axisLine} tick={tick} interval={0} angle={-15} textAnchor="end" height={60} />
            <YAxis stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'per litre', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmt(v)} />
            <Bar dataKey="amountPerLitre" name="Per litre">
              {waterfall.groups.map((g, i) => (
                <BarCell key={g.recipient} fill={GROUP_COLORS[i % GROUP_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ChartFrame>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">What the exchange rate does to the price</h3>
        <p className="text-[11px] text-pl-muted mb-2">
          The chain is re-priced at each rate with no scaling, because only part of the build-up
          is in dollars. Where a cap is entered, the rate at which it stops covering the chain is
          solved for; where the price never crosses the cap in the range, the app says so and
          returns no endpoint.
        </p>
        <ChartFrame height={260} exportFilename="fx-sensitivity">
          <LineChart data={sensitivity.points} margin={{ top: 12, right: 24, left: 16, bottom: 28 }}>
            <CartesianGrid {...GRID_STYLE} />
            {/* Senior test T1: a category axis printed the sweep values raw
                (1266.6666666667); the rate is a number axis on round ticks. */}
            <XAxis dataKey="value" type="number" domain={fxAxis.domain} ticks={fxAxis.ticks} height={XAXIS_LABEL_HEIGHT}
              stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'exchange rate (local per $)', position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <YAxis domain={pxAxis.domain} ticks={pxAxis.ticks} stroke={CHART_COLORS.axisLine} tick={tick} width={56} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmt(v)} labelFormatter={(v) => `${fmt(v, 0)} to the dollar`} />
            <Legend {...LEGEND_PROPS} />
            {sensitivity.capPerLitre !== null && (
              <ReferenceLine y={sensitivity.capPerLitre} stroke="#dc2626" strokeDasharray="4 4"
                label={{ value: 'cap', fill: '#dc2626', fontSize: 11 }} />
            )}
            <Line type="linear" dataKey="pricePerLitre" name="Pump price" stroke="#0891b2" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ChartFrame>
        <p className="text-[11px] mt-1">
          {sensitivity.breakeven === null
            ? <span className="text-pl-muted">Enter a regulated cap to solve for the rate at which it stops covering the chain.</span>
            : sensitivity.breakeven.found
              ? <span className="text-pl-warning-text">{`The cap stops covering the chain at about ${fmt(sensitivity.breakeven.value, 0)} to the dollar.`}</span>
              : <span className="text-pl-muted">{sensitivity.breakeven.reason}</span>}
        </p>
      </div>
    </div>
  );
};

export default BuildUpResults;
