// The scale comparison, the slate, the economics and the licensing tracker (DS4).
import { productLabel, signedUsd } from './productLabel';
import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { CheckCircle2, Circle, AlertTriangle } from 'lucide-react';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS, XAXIS_LABEL_HEIGHT } from '@/utils/chartTheme';
import { cn } from '@/lib/utils';
import { NumericTable, NumTh, NumRow, NumCell, NUMERIC_TABLE, signedTone } from '@/components/ui/numeric-table';
import { useModularRefinery } from '@/contexts/ModularRefineryContext';

// Theme-role pieces (design system rollout w5e).
const PANEL = 'rounded-lg border border-pl-border bg-pl-surface p-4 shadow-pl-sm';
const TILE = 'rounded-lg border border-pl-border bg-pl-surface p-3 shadow-pl-sm';
const TILE_LABEL = 'text-[11px] uppercase tracking-wide text-pl-muted';
const TILE_VALUE = 'text-xl font-semibold font-pl-mono tabular-nums mt-1 break-words';
// Tables inside a panel drop the NumericTable card.
const IN_PANEL = 'border-0 bg-transparent p-0';

const fmt = (v, dp = 0) => (Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp }) : 'n/a');
const mm = (v) => (Number.isFinite(v) ? `$${(v / 1e6).toFixed(1)}MM` : 'n/a');

const ScaleResults = () => {
  const {
    inputs, capex, comparison, slate, streams, economics,
    scenarioComparison, licensing, toggleLicence,
  } = useModularRefinery();
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  return (
    <div className="space-y-5">
      {streams.error && (
        <div className="rounded-lg border border-pl-warning/40 bg-pl-warning-bg p-4 text-sm text-pl-warning-text">
          {streams.error}
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={TILE}>
          <p className={TILE_LABEL}>Capital</p>
          <p className={`${TILE_VALUE} text-pl-text`}>{mm(capex.cost)}</p>
          <p className="text-[10px] text-pl-muted mt-1">${fmt(capex.perBpd)} per bpd</p>
        </div>
        <div className={TILE}>
          <p className={TILE_LABEL}>Gross margin</p>
          <p className={`${TILE_VALUE} ${signedTone(streams.grossMarginPerBbl) || 'text-pl-text'}`}>{signedUsd(streams.grossMarginPerBbl, 2, '/bbl')}</p>
        </div>
        <div className={TILE}>
          <p className={TILE_LABEL}>NPV</p>
          {/* a negative NPV reads in danger text beside its minus sign */}
          <p className={`${TILE_VALUE} ${signedTone(economics?.metrics?.npv) || 'text-pl-text'}`}>
            {economics ? signedUsd(economics.metrics.npv, 1, 'MM') : 'n/a'}
          </p>
        </div>
        <div className={TILE}>
          <p className={TILE_LABEL}>IRR</p>
          <p className={`${TILE_VALUE} text-pl-text`}>
            {economics && Number.isFinite(economics.metrics.irr) ? `${economics.metrics.irr.toFixed(1)}%` : 'n/a'}
          </p>
        </div>
      </div>

      <p className="text-[11px] text-pl-muted">
        Valued through the Suite&apos;s screening economics engine, the same one behind the NPV
        Scenario Builder, so an NPV here means what an NPV means anywhere else in the Suite. Full
        Nigerian fiscal detail under the PIA and the Nigeria Tax Act belongs to Petroleum Economics
        Studio, and a project heading for sanction should be valued there.
      </p>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">Capital per barrel of capacity, both scaling laws</h3>
        <p className="text-[11px] text-pl-muted mb-2">
          The six-tenths rule is why the industry believes small refineries cannot work: it says a
          bigger vessel is much cheaper per barrel. A modular plant does not scale that way, because
          capacity is added by replicating trains rather than by building bigger. The gap between
          these two curves is the entire argument, and it cuts both ways: the small plant loses far
          less to scale than the rule implies, and the big one gains far less.
        </p>
        <ChartFrame height={300} exportFilename="modular-scale-comparison">
          <LineChart data={comparison} margin={{ top: 20, right: 24, left: 24, bottom: 8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis
              dataKey="capacity" type="number" scale="log" domain={['dataMin', 'dataMax']}
              stroke={CHART_COLORS.axisLine} tick={tick}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              height={XAXIS_LABEL_HEIGHT}
              label={{
                value: 'Capacity (bpd, log scale)', position: 'insideBottom', offset: 0,
                fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
              }}
            />
            <YAxis
              stroke={CHART_COLORS.axisLine} tick={tick}
              tickFormatter={(v) => `$${fmt(v)}`} width={64}
              label={{
                value: 'Capital per bpd ($)', angle: -90, position: 'insideLeft', offset: -14, dy: 40,
                fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
              }}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [`$${fmt(v)}/bpd`, n]} labelFormatter={(v) => `${fmt(v)} bpd`} />
            <Legend {...LEGEND_PROPS} />
            <ReferenceLine x={Number(inputs.baseCapacity)} stroke={CHART_COLORS.axisLine} strokeDasharray="4 3"
              label={{ value: 'reference plant', fill: CHART_COLORS.axisText, fontSize: 10, position: 'insideTopRight' }} />
            <Line type="monotone" dataKey="modularPerBpd" name="Modular" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="stickBuiltPerBpd" name="Stick-built (six-tenths)" stroke="#dc2626" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} />
          </LineChart>
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={PANEL}>
          <h3 className="text-sm font-semibold text-pl-text mb-2">Product slate</h3>
          <NumericTable className={IN_PANEL}>
            <tbody>
              {slate.rows.map((r) => (
                <NumRow key={r.id}>
                  <td className={NUMERIC_TABLE.rowLabel}>{productLabel(r.id)}</td>
                  <NumCell signed={false} tone="text-pl-muted">{(r.yieldFraction * 100).toFixed(1)}%</NumCell>
                  <NumCell value={r.valuePerBblCrude} tone={r.valuePerBblCrude === null ? 'text-pl-muted' : undefined}
                    className={r.valuePerBblCrude === null ? 'font-pl-sans' : ''}>
                    {r.valuePerBblCrude === null ? 'not priced' : `$${r.valuePerBblCrude.toFixed(2)}`}
                  </NumCell>
                </NumRow>
              ))}
              <tr>
                <td className={`${NUMERIC_TABLE.rowLabel} ${NUMERIC_TABLE.total}`}>Gross value</td>
                <td className={`${NUMERIC_TABLE.cell} ${NUMERIC_TABLE.total}`} />
                <NumCell total value={slate.grossValuePerBbl}>
                  ${slate.grossValuePerBbl.toFixed(2)}/bbl
                </NumCell>
              </tr>
            </tbody>
          </NumericTable>
          {!slate.yieldsClose && (
            <p className="text-[11px] text-pl-warning-text mt-2">
              The yields total {(slate.yieldTotal * 100).toFixed(1)} percent, not 100. They do not
              account for the whole barrel, and the app reports that rather than normalising it away.
            </p>
          )}
        </div>

        <div className={PANEL}>
          <h3 className="text-sm font-semibold text-pl-text mb-1">Against the supply scenarios</h3>
          <p className="text-[11px] text-pl-muted mb-2">
            The constraint that decides most of these projects, priced.
          </p>
          <NumericTable className={IN_PANEL}>
            <thead>
              <tr>
                <NumTh sticky>Scenario</NumTh>
                <NumTh numeric>Margin/bbl</NumTh>
                <NumTh numeric>Payback</NumTh>
              </tr>
            </thead>
            <tbody>
              {scenarioComparison.map((s) => {
                const current = s.id === inputs.scenarioId;
                return (
                  <NumRow key={s.id} className={current ? 'bg-pl-sunken' : ''} aria-current={current ? 'true' : undefined}>
                    <td className={cn(NUMERIC_TABLE.rowLabel, current && 'bg-pl-sunken font-semibold')}>{s.name}</td>
                    <NumCell value={s.grossMarginPerBbl}>{signedUsd(s.grossMarginPerBbl, 2)}</NumCell>
                    <NumCell signed={false}>
                      {s.simplePaybackYears === null ? 'never' : `${s.simplePaybackYears.toFixed(1)} yr`}
                    </NumCell>
                  </NumRow>
                );
              })}
            </tbody>
          </NumericTable>
          <p className="text-[11px] text-pl-muted mt-2">
            Simple payback on the capital, undiscounted, which is the number a sponsor asks first.
          </p>
        </div>
      </div>

      <div className={PANEL}>
        <h3 className="text-sm font-semibold text-pl-text mb-1">Licensing</h3>
        <p className="text-[11px] text-pl-warning-text mb-3">
          A tracking aid and not legal advice. The sequence is the shape of the process; what each
          stage requires is set by the regulator and changes, so the regulator&apos;s current
          requirements govern.
        </p>
        <div className="space-y-2">
          {licensing.stages.map((s) => (
            <button
              key={s.id} type="button" onClick={() => toggleLicence(s.id)}
              aria-pressed={s.complete}
              className="w-full text-left flex items-start gap-3 rounded-lg border border-pl-border p-3 hover:bg-pl-sunken"
            >
              {s.complete
                ? <CheckCircle2 className="w-4 h-4 text-pl-success-text mt-0.5 shrink-0" aria-hidden="true" />
                : <Circle className="w-4 h-4 text-pl-muted mt-0.5 shrink-0" aria-hidden="true" />}
              <div>
                <p className="text-sm text-pl-text">{s.stage}. {s.name}</p>
                <p className="text-[11px] text-pl-muted mt-0.5">{s.summary}</p>
                <p className="text-[11px] text-pl-muted mt-1">Typically needs: {s.typicalEvidence.join('; ')}.</p>
              </div>
            </button>
          ))}
        </div>
        {licensing.outOfOrder && (
          <p className="text-[11px] text-pl-warning-text mt-2 flex items-start gap-1">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
            A later stage is ticked while an earlier one is not. You cannot hold a construction
            licence without an establishment one, so this is probably a data-entry slip.
          </p>
        )}
        {licensing.nextStage && (
          <p className="text-[11px] text-pl-muted mt-2">Next: {licensing.nextStage.name}.</p>
        )}
      </div>
    </div>
  );
};

export default ScaleResults;
