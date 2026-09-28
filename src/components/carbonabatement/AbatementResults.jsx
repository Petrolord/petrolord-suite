// The abatement curve and the decarbonisation path (DS9).
import React from 'react';
import { AlertTriangle, TrendingDown } from 'lucide-react';
import {
  ComposedChart, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ReferenceArea,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, XAXIS_LABEL_HEIGHT } from '@/utils/chartTheme';
import { NumericTable, NumTh, NumRow, NumCell, NUMERIC_TABLE } from '@/components/ui/numeric-table';
import { useCarbonAbatement } from '@/contexts/CarbonAbatementContext';

const fmt = (v, dp = 1) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : 'n/a');

// KPI tile in theme roles; numbers in the mono face, words in the sans.
const Stat = ({ label, value, hint, mono = true }) => (
  <div className="rounded-lg border border-pl-border bg-pl-surface p-3 shadow-pl-sm">
    <p className="text-[10px] uppercase tracking-wide text-pl-muted">{label}</p>
    <p className={`text-lg font-semibold text-pl-text break-words ${mono ? 'font-pl-mono tabular-nums' : ''}`}>{value}</p>
    {hint && <p className="text-[11px] text-pl-muted mt-0.5">{hint}</p>}
  </div>
);

// Status callouts: the text takes the tone of its box.
const CALLOUT = {
  warning: 'rounded-lg border border-pl-warning/40 bg-pl-warning-bg p-4 flex items-start gap-3 text-pl-warning-text',
  danger: 'rounded-lg border border-pl-danger/40 bg-pl-danger-bg p-4 flex items-start gap-3 text-pl-danger-text',
};

const AbatementResults = () => {
  const {
    curve, path, costedMeasures, targetTonnes, partialInventory, inventory,
  } = useCarbonAbatement();
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
  // The curve names every refused measure with the engine's reason (MD45-1 F3).
  const refused = curve.refusedMeasures || [];
  const unchecked = curve.uncheckedClaims || [];
  const assumed = costedMeasures.filter((m) => !m.error && m.assumedZero && m.assumedZero.length);
  // meetsTarget is null while a claim exceeds its source (MD5-0 C7) or
  // cannot be checked against one (MD45-1 F1), and a verdict over
  // interacting measures is only an upper bound.
  const targetValue = () => {
    if (targetTonnes === null) return 'no target';
    if (curve.meetsTarget === null) return 'not assessed';
    if (curve.meetsTarget) return curve.additive ? 'met' : 'met, as an upper bound';
    return `${fmt(curve.residualToTargetTonnes, 0)} t short`;
  };

  const maccAxis = (() => {
    const steps = curve?.steps || [];
    const xMax = steps.length ? steps[steps.length - 1].cumulativeEndTonnes : 1;
    const costs = steps.map((st) => st.costPerTonne).filter(Number.isFinite);
    const lo = Math.min(0, ...costs);
    const hi = Math.max(0, ...costs);
    const raw = ((hi - lo) || 1) * 1.1 / 5;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= raw);
    const yLo = Math.floor(lo / step) * step;
    const yHi = Math.ceil(hi / step) * step + (hi > 0 && hi % step === 0 ? step : 0);
    const yTicks = [];
    for (let v = yLo; v <= yHi + step / 2; v += step) yTicks.push(Number(v.toFixed(6)));
    return {
      xMax: xMax || 1,
      yDomain: [yLo, yHi],
      yTicks,
      rows: [{ x: 0, y: lo }, { x: xMax || 1, y: hi }],
    };
  })();

  return (
    <div className="space-y-5">
      {refused.length > 0 && (
        <div className={CALLOUT.warning}>
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Refused, and off the curve and the path</p>
            <ul className="text-sm mt-1 list-disc pl-4">
              {refused.map((m, i) => <li key={`${m.label}-${i}`}>{`${m.label}: ${m.reason}`}</li>)}
            </ul>
            {curve.refusedNote && <p className="text-[11px] mt-1">{curve.refusedNote}</p>}
          </div>
        </div>
      )}

      {assumed.length > 0 && (
        <p className="text-[11px] text-pl-muted">
          {assumed.map((m) => `${m.label}: blank ${m.assumedZero.join(' and ')} taken as 0.`).join(' ')}
        </p>
      )}

      {partialInventory && targetTonnes !== null && (
        <div className={CALLOUT.warning}>
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm">
            {`The target and the path are built on a partial inventory of ${fmt(inventory.totalTonnes, 0)} tCO2e, because ${(inventory.notReportableBecause || []).join('; ')}. Complete the inventory before relying on either.`}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total abatement" value={`${fmt(curve.totalAbatementTonnes, 0)} t/yr`} />
        <Stat label="Pays for itself" value={`${fmt(curve.paysForItselfTonnes, 0)} t/yr`}
          hint={curve.paysForItselfMeasures.length ? curve.paysForItselfMeasures.join(', ') : 'none'} />
        <Stat label="Net annual cost" value={fmt(curve.netAnnualCostOfAll, 0)}
          hint={`${fmt(curve.weightedAverageCostPerTonne, 1)} per tonne on average`} />
        <Stat label="Against the target"
          value={targetValue()}
          mono={false}
          hint={targetTonnes === null ? null
            : `target ${fmt(targetTonnes, 0)} t/yr${curve.meetsTarget === null && curve.targetBasis ? `; ${curve.targetBasis}` : ''}`} />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">The marginal abatement cost curve</h3>
        <p className="text-[11px] text-pl-muted mb-2">
          Cheapest first. Bars below the line pay for themselves and abate carbon as a side effect,
          and they are usually the ones nobody has done. Capital is annualised over each measure&apos;s
          life, because setting a one-off capital cost against one year&apos;s saving overstates the
          cost per tonne of a capital measure.
        </p>
        <ChartFrame height={300} exportFilename="abatement-cost-curve">
          {/* CARBON-T1-002: a MAC curve is drawn with each bar as wide as the
              tonnes it abates, so the area is the annual cost. Equal-width
              bars hid that the flare measure is most of the tonnes. */}
          <ComposedChart data={maccAxis.rows} margin={{ top: 16, right: 24, left: 24, bottom: 8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="x" type="number" domain={[0, maccAxis.xMax]} stroke={CHART_COLORS.axisLine} tick={tick}
              tickFormatter={(v) => fmt(v, 0)} height={XAXIS_LABEL_HEIGHT}
              label={{ value: 'Cumulative abatement (tCO2e/yr)', position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <YAxis dataKey="y" type="number" domain={maccAxis.yDomain} ticks={maccAxis.yTicks} stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'Cost per tonne', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            {curve.steps.map((st, i) => (
              <ReferenceArea key={st.label} x1={st.cumulativeStartTonnes} x2={st.cumulativeEndTonnes}
                y1={0} y2={st.costPerTonne} fill={st.paysForItself ? '#059669' : '#dc2626'} fillOpacity={0.85}
                stroke="#fff" strokeWidth={1}
                label={{ value: String(i + 1), position: st.costPerTonne < 0 ? 'insideBottom' : 'insideTop', fill: '#fff', fontSize: 11 }} />
            ))}
            <ReferenceLine y={0} stroke={CHART_COLORS.axisLine} />
            <Line dataKey="y" stroke="none" dot={false} isAnimationActive={false} legendType="none" />
          </ComposedChart>
        </ChartFrame>
        {/* Money per tonne: a negative cost is a measure that pays for
            itself, so it reads in success text beside its minus sign. */}
        <NumericTable className="mt-3">
          <thead>
            <tr>
              <NumTh sticky>Measure</NumTh>
              <NumTh numeric>tCO2e/yr</NumTh>
              <NumTh numeric>Cumulative</NumTh>
              <NumTh numeric>Cost/tonne</NumTh>
              <NumTh>Acts on</NumTh>
            </tr>
          </thead>
          <tbody>
            {curve.steps.map((s) => (
              <NumRow key={s.label}>
                <td className={NUMERIC_TABLE.rowLabel}>{curve.steps.indexOf(s) + 1}. {s.label}</td>
                <NumCell signed={false}>{fmt(s.tonnesAbatedPerYear, 0)}</NumCell>
                <NumCell signed={false} tone="text-pl-muted">{fmt(s.cumulativeEndTonnes, 0)}</NumCell>
                <NumCell signed={false} tone={s.paysForItself ? 'text-pl-success-text' : undefined}>
                  {fmt(s.costPerTonne, 1)}
                </NumCell>
                <td className="border-b border-pl-border px-3 py-2 text-xs text-pl-muted">{(s.actsOn || []).join(', ') || 'unnamed'}</td>
              </NumRow>
            ))}
          </tbody>
        </NumericTable>
      </div>

      {curve.interactions.length > 0 && (
        <div className={CALLOUT.warning}>
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">These measures are not additive</p>
            <ul className="text-sm mt-1 list-disc pl-4">
              {curve.interactions.map((i) => (
                <li key={i.sourceId}>{`${i.measures.join(' and ')} both act on ${i.sourceId}.`}</li>
              ))}
            </ul>
            <p className="text-[11px] mt-1">{curve.interactionNote}</p>
          </div>
        </div>
      )}

      {targetTonnes !== null && unchecked.length > 0 && (
        <div className={CALLOUT.warning}>
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Claims no source emission can check</p>
            <ul className="text-sm mt-1 list-disc pl-4">
              {unchecked.map((u, i) => (
                <li key={`${u.measure}-${u.sourceId}-${i}`}>
                  {u.sourceId === null ? `${u.measure}: ${u.reason}.` : `${u.measure} acts on ${u.sourceId}: ${u.reason}.`}
                </li>
              ))}
            </ul>
            <p className="text-[11px] mt-1">
              Those tonnes may not exist, so the target is not assessed until every claim can be
              checked. Only the heaters and the flare have an emission here, and only when they compute.
            </p>
          </div>
        </div>
      )}

      {curve.overClaims.length > 0 && (
        <div className={CALLOUT.danger}>
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">More abatement is claimed than the source emits</p>
            {curve.overClaims.map((o) => (
              <p key={o.sourceId} className="text-sm mt-1">
                {`${o.measures.join(' and ')} claim ${fmt(o.claimedTonnes, 0)} t against ${o.sourceId}, which emits ${fmt(o.emittedTonnes, 0)} t.`}
              </p>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1 flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-pl-muted" aria-hidden="true" /> The path
        </h3>
        {path.error ? <p className="text-sm text-pl-warning-text">{path.error}</p> : (
          <>
            <p className="text-[11px] text-pl-muted mb-2">
              Each measure counts only from the year it starts.
              {path.gapNote ? ` ${path.gapNote}` : ' The identified measures reach the target every year.'}
            </p>
            <ChartFrame height={280} exportFilename="decarbonisation-path">
              <LineChart data={path.rows} margin={{ top: 12, right: 24, left: 24, bottom: 28 }}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis dataKey="year" stroke={CHART_COLORS.axisLine} tick={tick} />
                <YAxis stroke={CHART_COLORS.axisLine} tick={tick}
                  label={{ value: 'tCO2e/yr', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${fmt(v, 0)} t`} />
                <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="emissionsTonnes" name="With identified measures" stroke="#0891b2" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="targetTonnes" name="Target" stroke="#dc2626" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ChartFrame>
            {refused.length > 0 && (
              <p className="text-[11px] text-pl-warning-text mt-1">
                {`Refused, so not on the path: ${refused.map((m) => m.label).join(', ')}.`}
              </p>
            )}
            {path.unscheduledMeasures && path.unscheduledMeasures.length > 0 && (
              <p className="text-[11px] text-pl-warning-text mt-1">
                {`Not on the path: ${path.unscheduledMeasures.map((m) => `${m.label} (${m.reason})`).join(', ')}.`}
              </p>
            )}
            {path.firstShortfallYear !== null && (
              <p className="text-[11px] text-pl-warning-text mt-1">
                {`The plan first falls short of the target in ${path.firstShortfallYear}, and the final gap is ${fmt(path.finalGapTonnes, 0)} tCO2e a year with no measure identified for it.`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AbatementResults;
