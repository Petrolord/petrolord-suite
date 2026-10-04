// Run compare (SIM-U2-005): pick two or more completed runs of the case, the
// first picked is the base; one vector overlaid on the calendar axis and a
// difference table against the base. The same model feeds the report.
import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { GitCompare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useSimStudio } from '@/contexts/SimStudioContext';
import { compareRuns, compareSeries, COMPARE_VECTORS, runLabel } from '@/utils/simstudio/runCompare';
import { VECTOR_META } from '@/components/simstudio/resultAdapters';

const LINE_COLORS = ['#166534', '#1d4ed8', '#b45309', '#b91c1c', '#7c3aed', '#0e7490'];
const axisProps = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize } };
const monthTick = (t) => (Number.isFinite(t) ? new Date(t).toISOString().slice(0, 7) : '');

const RunComparePanel = ({ completeRuns }) => {
  const { compareIds, compareEntries, toggleCompare, system } = useSimStudio();
  const [vector, setVector] = useState('FOPR');
  const model = useMemo(() => compareRuns({ entries: compareEntries, system }), [compareEntries, system]);
  const overlay = useMemo(() => compareSeries(compareEntries, vector, system), [compareEntries, vector, system]);
  if (completeRuns.length < 2) return null;
  return (
    <Card data-testid="sim-compare">
      <CardHeader className="pb-1"><CardTitle className="text-sm inline-flex items-center gap-1"><GitCompare className="w-3.5 h-3.5" /> Compare runs</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="flex flex-wrap gap-x-4 gap-y-1" data-testid="sim-compare-picks">
          {completeRuns.map((r) => {
            const k = compareIds.indexOf(r.id);
            return (
              <label key={r.id} className="inline-flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={k >= 0} onChange={() => toggleCompare(r)} data-testid={`sim-compare-${r.id}`} />
                <span>{runLabel(r)}{k === 0 ? ' (base)' : ''}</span>
              </label>
            );
          })}
        </div>
        {!model.ok ? (
          <p className="text-pl-muted" data-testid="sim-compare-why">{model.reason} The first run you pick is the base of the difference table.</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-pl-muted">Overlay</span>
              <select value={vector} onChange={(e) => setVector(e.target.value)} data-testid="sim-compare-vector"
                className="h-7 rounded-md border border-pl-border-strong bg-pl-surface px-2 text-xs text-pl-text">
                {COMPARE_VECTORS.map((k) => <option key={k} value={k}>{k}: {VECTOR_META[k]?.label || k}</option>)}
              </select>
            </div>
            {overlay.series.length ? (
              <ChartFrame height={240}>
                <LineChart margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="t" type="number" scale="time" {...axisProps} domain={['dataMin', 'dataMax']} tickCount={5} tickFormatter={monthTick} allowDuplicatedCategory={false} />
                  <YAxis {...axisProps} width={60} label={{ value: overlay.unit, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => (Number.isFinite(v) ? new Date(v).toISOString().slice(0, 10) : '')} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {overlay.series.map((s, i) => (
                    <Line key={s.runId} data={s.pts.map(([t, y]) => ({ t, y }))} dataKey="y" name={`${i === 0 ? 'Base ' : ''}${s.name}`} dot={false} isAnimationActive={false}
                      stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} strokeDasharray={i === 0 ? undefined : '6 3'} />
                  ))}
                </LineChart>
              </ChartFrame>
            ) : <p className="text-pl-muted">None of the picked runs holds {vector}.</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="sim-compare-table">
                <thead><tr className="text-pl-muted text-left">{model.head.map((h) => <th key={h} className="py-1 pr-3 font-normal">{h}</th>)}</tr></thead>
                <tbody>{model.rows.map((r) => <tr key={r[0]} className="border-b border-pl-border">{r.map((c, j) => <td key={j} className="py-1 pr-3 text-pl-text">{c}</td>)}</tr>)}</tbody>
              </table>
            </div>
            {model.notes.length > 0 && <ul className="list-disc pl-4 text-[11px] text-pl-muted">{model.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
            <p className="text-[11px] text-pl-muted">The comparison prints in the report of the run shown above, as a table and a figure.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default RunComparePanel;
