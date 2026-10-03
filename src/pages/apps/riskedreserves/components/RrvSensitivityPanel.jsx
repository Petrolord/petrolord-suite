// The Sensitivity tab of Risked Reserves Valuation (upgrade U2-003,
// 2026-10-02): the tornado of the EMV. One input at a time is moved to a
// stated low and high case and the valuation engine is asked again. The
// bars and the table are the report's own (rrvReportModel sensitivityModel),
// so the screen and the PDF figure cannot disagree. The white Petrolord
// chart template.

import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, PINNED_TOOLTIP_PROPS } from '@/utils/chartTheme';
import NumCell from './NumCell';
import { F } from '../services/rrvReportModel';

const card = 'rounded border border-pl-border bg-pl-surface p-3';
const h = 'text-xs font-semibold text-pl-text mb-2';
const AXIS = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };
const LOW = '#475569';
const HIGH = '#2563eb';
const NUMERIC = /^[-+x\d.,%/ ]+$/;

/**
 * @param {{prospect: object, sensitivity: ?object, readOnly?: boolean, onSens: function(string, *): void}} props
 *   `sensitivity` is the report model's `sensitivity` block (null while the prospect cannot be valued)
 */
export default function RrvSensitivityPanel({ prospect, sensitivity, readOnly = false, onSens }) {
  if (!sensitivity) return <p className="text-xs text-pl-muted" data-testid="rrv-sensitivity-empty">The sensitivity needs a valued prospect: fix the inputs of {prospect.name} first.</p>;
  const s = sensitivity;
  const data = s.rows.map((r, i) => ({ name: s.categories[i], low: s.lowDelta[i], high: s.highDelta[i], lowEmv: r.low.emv, highEmv: r.high.emv }));
  return (
    <div className="space-y-3" data-testid="rrv-sensitivity">
      <div className={card}>
        <div className={h}>Sensitivity of the EMV of {prospect.name}</div>
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-[11px] text-pl-muted w-44">Swing of each input, %
            <NumCell value={prospect.sens?.swing ?? s.swing} disabled={readOnly} aria-label="Swing of each input, percent" data-testid="rrv-sens-swing" onCommit={(v) => onSens('swing', v)} />
          </label>
          <label className="text-[11px] text-pl-muted w-52">Step of each chance factor, absolute
            <NumCell value={prospect.sens?.factorSwing ?? s.factorSwing} disabled={readOnly} aria-label="Step of each chance factor" data-testid="rrv-sens-factor" onCommit={(v) => onSens('factorSwing', v)} />
          </label>
          <span className="text-xs text-pl-muted">Base EMV <span className="font-pl-mono tabular-nums text-pl-text" data-testid="rrv-sens-base">{F.n1(s.base)}</span> $MM. In use: {F.plain(s.swing)}% and {F.plain(s.factorSwing)}.</span>
        </div>
      </div>
      <div className="relative bg-white rounded border border-slate-200 flex flex-col" style={{ height: 90 + data.length * 34 }} data-canvas="chart" data-testid="rrv-tornado"
        data-bars={data.length * 2} data-first={s.rows[0]?.key}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pt-2 pr-24 text-[11px] text-slate-600" data-testid="rrv-tornado-legend">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-2.5" style={{ background: LOW }} />Low case</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-2.5" style={{ background: HIGH }} />High case</span>
          <span>Change in EMV from the base, $MM. Largest swing first.</span>
        </div>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 10, right: 24, left: 8, bottom: 8 }} barGap={0}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis type="number" tick={AXIS} tickFormatter={(v) => Math.round(v).toLocaleString('en-US')}
                label={{ value: 'Change in EMV, $MM', position: 'insideBottom', offset: -4, style: AXIS }} height={36} />
              <YAxis type="category" dataKey="name" tick={AXIS} width={112} interval={0} />
              <Tooltip {...PINNED_TOOLTIP_PROPS}
                formatter={(v, name, item) => [`${v > 0 ? '+' : ''}${Number(v).toFixed(1)} $MM (EMV ${Number(name === 'low' ? item.payload.lowEmv : item.payload.highEmv).toFixed(1)})`, name === 'low' ? 'low case' : 'high case']} />
              <ReferenceLine x={0} stroke="#64748b" />
              <Bar dataKey="low" fill={LOW} isAnimationActive={false} />
              <Bar dataKey="high" fill={HIGH} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ChartLogo style={{ height: '22px', top: 6, bottom: 'auto', right: 16 }} />
      </div>
      <div className={card} data-testid="rrv-sens-table">
        <div className={h}>The cases</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-pl-muted"><tr>{s.table.head.map((c) => <th key={c} className="text-left font-medium px-1.5 py-1 border-b border-pl-border">{c}</th>)}</tr></thead>
            <tbody>
              {s.table.body.map((row, i) => (
                <tr key={s.rows[i].key} className="border-b border-pl-border last:border-0" data-testid={`rrv-sens-row-${s.rows[i].key}`}>
                  {row.map((c, j) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <td key={j} className={`px-1.5 py-1 text-pl-text ${NUMERIC.test(String(c ?? '')) ? 'font-pl-mono tabular-nums' : ''}`}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-pl-muted" data-testid="rrv-sens-note">{s.table.note}</p>
      </div>
    </div>
  );
}
