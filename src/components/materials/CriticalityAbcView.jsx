// Criticality classes and ABC by annual usage value (SC3).
import React from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis, Legend,
} from 'recharts';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS,
} from '@/utils/chartTheme';
import { useMaterialsSpares } from '@/contexts/MaterialsSparesContext';
import { fmtNum, fmtPct } from '@/utils/supplychain/materialsAdapters';
import {
  Basis, EmptyRegister, NumField, Panel, ResultGate, SelectField, Stat, TextField,
} from './common';

const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
const CLASS_COLORS = ['#dc2626', '#d97706', '#2563eb', '#059669', '#7c3aed', '#0891b2'];
const ABC_COLORS = { A: '#dc2626', B: '#d97706', C: '#2563eb' };

const CriticalityInputs = () => {
  const { inputs, setSection } = useMaterialsSpares();
  const c = inputs.criticality;
  const set = (patch) => setSection('criticality', patch);
  const setCriterion = (i, patch) => set({ criteria: c.criteria.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setClass = (i, patch) => set({ classes: c.classes.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const toggleTop = (id) => set({
    topClassOnMaxScore: c.topClassOnMaxScore.includes(id) ? c.topClassOnMaxScore.filter((x) => x !== id) : [...c.topClassOnMaxScore, id],
  });
  return (
    <Panel title="Criticality policy" testId="criticality-inputs">
      <div>
        <p className="mb-1 text-[11px] font-medium text-slate-300">Criteria (weights add to 100; ids match the register&apos;s score columns)</p>
        {c.criteria.map((x, i) => (
          <div key={i} className="mb-1 grid grid-cols-[1fr_2fr_1fr_auto] items-end gap-2">
            <TextField testId={`crit-id-${i}`} value={x.id} onChange={(v) => setCriterion(i, { id: v })} placeholder="id" />
            <TextField testId={`crit-label-${i}`} value={x.label} onChange={(v) => setCriterion(i, { label: v })} placeholder="label (optional)" />
            <NumField label={i === 0 ? 'Weight' : ''} testId={`crit-weight-${i}`} value={x.weight} onChange={(v) => setCriterion(i, { weight: v })} />
            <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400" onClick={() => set({ criteria: c.criteria.filter((_, j) => j !== i) })} aria-label={`Remove criterion ${i + 1}`}><X className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" className="text-sky-300" onClick={() => set({ criteria: [...c.criteria, { id: '', label: '', weight: '' }] })} data-testid="add-criterion">
          <Plus className="mr-1 h-3 w-3" /> Criterion
        </Button>
      </div>
      <NumField label="Maximum score on each criterion" testId="crit-scoremax" value={c.scoreMax} onChange={(v) => set({ scoreMax: v })} hint="Weighted score = sum of weight x score / maximum, so it runs 0 to 100." />
      <div>
        <p className="mb-1 text-[11px] font-medium text-slate-300">Classes, highest first, the last at minimum score 0</p>
        {c.classes.map((x, i) => (
          <div key={i} className="mb-1 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <TextField testId={`class-label-${i}`} value={x.label} onChange={(v) => setClass(i, { label: v })} placeholder="label" />
            <NumField label={i === 0 ? 'Minimum score' : ''} testId={`class-min-${i}`} value={x.minScore} onChange={(v) => setClass(i, { minScore: v })} />
            <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400" onClick={() => set({ classes: c.classes.filter((_, j) => j !== i) })} aria-label={`Remove class ${i + 1}`}><X className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" className="text-sky-300" onClick={() => set({ classes: [...c.classes, { label: '', minScore: '' }] })} data-testid="add-class">
          <Plus className="mr-1 h-3 w-3" /> Class
        </Button>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium text-slate-300">Top class on a maximum score (a stated override; tick none for no override)</p>
        {c.criteria.length === 0 ? <p className="text-[11px] text-slate-500">Add criteria first.</p> : c.criteria.map((x, i) => (
          <label key={i} className="mr-3 inline-flex items-center gap-1 text-xs text-slate-300">
            <input type="checkbox" checked={c.topClassOnMaxScore.includes(x.id)} onChange={() => toggleTop(x.id)} data-testid={`top-${x.id}`} /> {x.id || '(no id)'}
          </label>
        ))}
      </div>
    </Panel>
  );
};

const CriticalityResults = () => {
  const { results, inputs } = useMaterialsSpares();
  const classes = inputs.criticality.classes;
  return (
    <ResultGate result={results.criticality} testId="criticality">
      {(r) => {
        const color = (label) => CLASS_COLORS[Math.max(0, classes.findIndex((x) => x.label === label)) % CLASS_COLORS.length];
        const data = r.items.map((it) => ({ id: it.id, score: it.weightedScore, cls: it.class }));
        return (
          <Panel title="Criticality classes" testId="criticality-results">
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(r.counts).map(([k, n]) => <Stat key={k} label={`Class ${k}`} value={`${n} items`} testId={`crit-count-${k}`} />)}
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-700">
              <ChartFrame height={240} exportFilename="criticality-scores">
                <BarChart data={data} margin={{ top: 16, right: 20, left: 0, bottom: 40 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="id" tick={{ ...tick, fontSize: 9 }} angle={-45} textAnchor="end" interval={0} height={60} />
                  <YAxis tick={tick} domain={[0, 100]} label={{ value: 'Weighted score', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 11 }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmtNum(v, 2)} />
                  {classes.map((x) => (Number(x.minScore) > 0 ? <ReferenceLine key={x.label} y={Number(x.minScore)} stroke="#475569" strokeDasharray="4 4" label={{ value: `${x.label} from ${x.minScore}`, fill: '#475569', fontSize: 10, position: 'right' }} /> : null))}
                  <Bar dataKey="score" name="Weighted score" isAnimationActive={false}>
                    {data.map((d) => <Cell key={d.id} fill={color(d.cls)} />)}
                  </Bar>
                </BarChart>
              </ChartFrame>
            </div>
            <table className="w-full text-xs">
              <thead className="text-left text-slate-400"><tr><th className="p-1">Item</th><th className="p-1 text-right">Weighted score</th><th className="p-1">Class</th><th className="p-1">Reason</th></tr></thead>
              <tbody>
                {r.items.map((it) => (
                  <tr key={it.id} className="border-t border-slate-800 text-slate-200" data-testid={`crit-row-${it.id}`}>
                    <td className="p-1 font-mono">{it.id}</td>
                    <td className="p-1 text-right font-mono" data-testid={`crit-score-${it.id}`}>{fmtNum(it.weightedScore, 2)}</td>
                    <td className="p-1 font-semibold" data-testid={`crit-class-${it.id}`}>{it.class}</td>
                    <td className="p-1 text-slate-400">{it.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Basis basis={r.basis} testId="criticality-basis" />
          </Panel>
        );
      }}
    </ResultGate>
  );
};

const AbcInputs = () => {
  const { inputs, setSection } = useMaterialsSpares();
  const a = inputs.abc;
  const set = (patch) => setSection('abc', patch);
  return (
    <Panel title="ABC policy" testId="abc-inputs">
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Class A closes at cumulative value share (%)" testId="abc-a" value={a.aPct} onChange={(v) => set({ aPct: v })} />
        <NumField label="Class B closes at cumulative value share (%)" testId="abc-b" value={a.bPct} onChange={(v) => set({ bPct: v })} />
      </div>
      <SelectField
        label="Boundary rule"
        testId="abc-rule"
        value={a.boundaryRule}
        onChange={(v) => set({ boundaryRule: v })}
        options={[
          { value: 'at-or-below', label: 'At or below: the cumulative share including the item decides' },
          { value: 'include-crossing', label: 'Include crossing: the share before the item decides' },
        ]}
        hint="Under include-crossing, the item that crosses a cut-off joins the higher class."
      />
    </Panel>
  );
};

const AbcResults = () => {
  const { results, inputs } = useMaterialsSpares();
  const cur = inputs.register.currency;
  return (
    <ResultGate result={results.abc} testId="abc">
      {(r) => {
        const data = r.items.map((it) => ({ id: it.id, value: it.annualValue, cum: it.cumulativePct, cls: it.class }));
        return (
          <Panel title="ABC by annual usage value" testId="abc-results">
            <div className="grid grid-cols-4 gap-2">
              <Stat label={`Total annual value${cur ? ` (${cur})` : ''}`} value={fmtNum(r.totalAnnualValue, 2)} testId="abc-total" />
              {['A', 'B', 'C'].map((k) => (
                <Stat key={k} label={`Class ${k}`} value={`${r.summary[k].count} items, ${fmtPct(r.summary[k].valueSharePct)} of value`} testId={`abc-summary-${k}`} />
              ))}
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-700">
              <ChartFrame height={260} exportFilename="abc-pareto">
                <ComposedChart data={data} margin={{ top: 16, right: 20, left: 10, bottom: 8 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="id" tick={{ ...tick, fontSize: 9 }} angle={-45} textAnchor="end" interval={0} height={60} />
                  <YAxis yAxisId="v" tick={tick} tickFormatter={(v) => fmtNum(v, 0)} width={80} />
                  <YAxis yAxisId="c" orientation="right" domain={[0, 100]} tick={tick} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => (n === 'Cumulative share' ? fmtPct(v, 2) : fmtNum(v, 2))} />
                  <Legend {...LEGEND_PROPS} />
                  <ReferenceLine yAxisId="c" y={Number(inputs.abc.aPct)} stroke="#dc2626" strokeDasharray="4 4" />
                  <ReferenceLine yAxisId="c" y={Number(inputs.abc.bPct)} stroke="#d97706" strokeDasharray="4 4" />
                  <Bar yAxisId="v" dataKey="value" name="Annual usage value" isAnimationActive={false}>
                    {data.map((d) => <Cell key={d.id} fill={ABC_COLORS[d.cls]} />)}
                  </Bar>
                  <Line yAxisId="c" dataKey="cum" name="Cumulative share" stroke="#0f172a" dot={{ r: 2 }} isAnimationActive={false} />
                </ComposedChart>
              </ChartFrame>
            </div>
            <table className="w-full text-xs">
              <thead className="text-left text-slate-400"><tr><th className="p-1">Rank</th><th className="p-1">Item</th><th className="p-1 text-right">Annual value</th><th className="p-1 text-right">Share</th><th className="p-1 text-right">Cumulative</th><th className="p-1">Class</th><th className="p-1">Reason</th></tr></thead>
              <tbody>
                {r.items.map((it) => (
                  <tr key={it.id} className="border-t border-slate-800 text-slate-200" data-testid={`abc-row-${it.id}`}>
                    <td className="p-1">{it.rank}</td>
                    <td className="p-1 font-mono">{it.id}</td>
                    <td className="p-1 text-right font-mono" data-testid={`abc-value-${it.id}`}>{fmtNum(it.annualValue, 2)}</td>
                    <td className="p-1 text-right font-mono">{fmtPct(it.sharePct, 2)}</td>
                    <td className="p-1 text-right font-mono" data-testid={`abc-cum-${it.id}`}>{fmtPct(it.cumulativePct, 2)}</td>
                    <td className="p-1 font-semibold" data-testid={`abc-class-${it.id}`}>{it.class}</td>
                    <td className="p-1 text-slate-400">{it.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Basis basis={r.basis} testId="abc-basis" />
          </Panel>
        );
      }}
    </ResultGate>
  );
};

const CriticalityAbcView = () => {
  const { items } = useMaterialsSpares();
  return (
    <div className="space-y-4">
      {items.length === 0 ? <EmptyRegister /> : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <CriticalityInputs />
        <CriticalityResults />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <AbcInputs />
        <AbcResults />
      </div>
    </div>
  );
};

export default CriticalityAbcView;
