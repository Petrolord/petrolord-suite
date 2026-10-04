// The ranking and the verdicts (EOR-U1): the bar chart on the house chart
// standard (white surface, ChartFrame with the Petrolord mark), and one
// card per method with each criterion's required range, the project
// average, this reservoir's value, the verdict, the reason and the table it
// comes from. The same rows the report prints (RL12).
import React, { useState } from 'react';
import { CheckCircle2, XCircle, MinusCircle, AlertTriangle } from 'lucide-react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { CRITERIA_EDITION, RANKING_BASIS } from '@/utils/eorScreeningCalculations';
import { requiredText, actualText, averageText, reasonText, distanceText, STATUS_WORDS, OUTCOME_WORDS } from '@/utils/eor/format';
import { useEorScreening } from '@/contexts/EorScreeningContext';
import { mmpSection } from '@/utils/eor/reportModel';
import { MMP_CORRELATION } from '@/utils/eor/mmp';

const STATUS_META = {
  pass: { icon: CheckCircle2, chip: 'bg-pl-success-bg text-pl-success-text border-pl-success/40' },
  marginal: { icon: AlertTriangle, chip: 'bg-pl-warning-bg text-pl-warning-text border-pl-warning/40' },
  fail: { icon: XCircle, chip: 'bg-pl-danger-bg text-pl-danger-text border-pl-danger/40' },
  na: { icon: MinusCircle, chip: 'bg-pl-sunken text-pl-muted border-pl-border' },
};
const OUTCOME_FILL = { qualified: '#059669', marginal: '#d97706', 'screened out': '#94a3b8', 'not screened': '#cbd5e1' };
const OUTCOME_BADGE = { qualified: 'success', marginal: 'warning', 'screened out': 'neutral', 'not screened': 'neutral' };

const EorResults = () => {
  const { results, u, mmp } = useEorScreening();
  const mmpModel = mmp ? mmpSection(mmp, u) : null;
  const mmpRows = mmpModel ? mmpModel.rows.filter(([k]) => ['Minimum miscibility pressure', 'Reservoir pressure', 'Pressure minus MMP', 'Verdict'].includes(k)) : [];
  const [expanded, setExpanded] = useState(null);
  const qualified = results.filter((r) => r.outcome === 'qualified');
  const marginal = results.filter((r) => r.outcome === 'marginal');
  const chartData = results.map((r) => ({ name: r.name, score: r.applicable ? Math.round(r.score * 100) : 0, outcome: r.outcome }));
  const sys = u.system;

  return (
    <div className="flex-1 min-w-0 space-y-4" data-testid="eor-results">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-pl-text text-base">
            Method ranking
            <span className="ml-2 text-xs font-normal text-pl-muted" data-testid="eor-summary">
              {qualified.length} of {results.length} methods qualify on every screened criterion{marginal.length ? `; ${marginal.length} marginal` : ''}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-white rounded-lg p-3" data-canvas="chart">
            <ChartFrame height={280}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
                <CartesianGrid {...GRID_STYLE} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} stroke={CHART_COLORS.axisLine} unit="%" />
                <YAxis type="category" dataKey="name" width={150} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} stroke={CHART_COLORS.axisLine} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}% of screened criteria pass`, 'Share passing']} />
                <Bar dataKey="score" isAnimationActive={false} radius={[0, 3, 3, 0]}>
                  {chartData.map((d) => <Cell key={d.name} fill={OUTCOME_FILL[d.outcome]} />)}
                  <LabelList dataKey="score" position="right" formatter={(v) => `${v}%`} style={{ fill: CHART_COLORS.axisText, fontSize: 11 }} />
                </Bar>
              </BarChart>
            </ChartFrame>
          </div>
          <p className="text-[11px] text-pl-muted mt-2">{RANKING_BASIS} Green qualified, amber marginal, grey screened out.</p>
        </CardContent>
      </Card>

      {mmp && (
        <Card data-testid="eor-mmp" data-status={mmp.status} data-verdict={mmp.verdict || ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-pl-text text-base">CO2 miscibility: MMP against reservoir pressure</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            {mmp.status === 'not made'
              ? <p className="text-pl-muted" data-testid="eor-mmp-reason">{mmp.reason}</p>
              : (
                <>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {mmpRows.map(([k, v]) => (
                      <div key={k} className="rounded-md border border-pl-border bg-pl-sunken px-2 py-1.5">
                        <dt className="text-[10px] text-pl-muted">{k}</dt>
                        <dd className={`text-pl-text ${k === 'Verdict' ? 'font-semibold' : ''}`} data-testid={`eor-mmp-${k.split(' ')[0].toLowerCase()}`}>{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className={mmp.within_error || mmp.outside?.length ? 'text-pl-warning-text' : 'text-pl-muted'} data-testid="eor-mmp-reason">{mmpModel.why}</p>
                </>
              )}
            <p className="text-[10px] text-pl-muted">
              {MMP_CORRELATION.short}, {MMP_CORRELATION.where}. {MMP_CORRELATION.scope} Error: {MMP_CORRELATION.errorText} Printed beside the
              Taber verdicts; it changes none of them. The full rows are on the Report tab.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {results.map((r) => {
          const open = expanded === r.id;
          return (
            <Card key={r.id} className={r.outcome === 'qualified' ? 'border-pl-success/40' : undefined} data-testid={`eor-method-${r.id}`}>
              <button type="button" className="w-full text-left px-4 py-3 flex items-center gap-3" onClick={() => setExpanded(open ? null : r.id)} aria-expanded={open}>
                {r.outcome === 'qualified'
                  ? <CheckCircle2 size={18} className="text-pl-success-text shrink-0" />
                  : r.outcome === 'marginal' ? <AlertTriangle size={18} className="text-pl-warning-text shrink-0" /> : <XCircle size={18} className="text-pl-muted shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-pl-text font-medium truncate">{r.name}</div>
                  <div className="text-[11px] text-pl-muted">
                    {r.group} · {r.passes}/{r.applicable} screened criteria met{r.marginals ? `, ${r.marginals} marginal` : ''}{r.unscored ? `, ${r.unscored} not screened (no input)` : ''}
                  </div>
                </div>
                <Badge variant={OUTCOME_BADGE[r.outcome]}>{OUTCOME_WORDS[r.outcome]}</Badge>
              </button>
              {open && (
                <CardContent className="pt-0 pb-4">
                  <div className="text-[11px] text-pl-muted mb-2">Oil composition guide (not screened, no composition input): {r.composition}</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-pl-muted border-b border-pl-border">
                          <th className="py-1.5 pr-3">Criterion</th>
                          <th className="py-1.5 pr-3">Required</th>
                          <th className="py-1.5 pr-3">Project average</th>
                          <th className="py-1.5 pr-3">This reservoir</th>
                          <th className="py-1.5 pr-3">Verdict</th>
                          <th className="py-1.5 pr-3" title="How far the value sits from the limit, for information; never a score">Distance to the limit</th>
                          <th className="py-1.5">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.verdicts.map((v) => {
                          const meta = STATUS_META[v.status];
                          const IconEl = meta.icon;
                          return (
                            <tr key={v.key} className="border-b border-pl-border text-pl-text align-top">
                              <td className="py-1.5 pr-3">{v.criterion}</td>
                              <td className="py-1.5 pr-3">{requiredText(v, sys)}</td>
                              <td className="py-1.5 pr-3">{averageText(v, sys) || 'n/a'}</td>
                              <td className="py-1.5 pr-3">{actualText(v, sys)}</td>
                              <td className="py-1.5 pr-3">
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] ${meta.chip}`}>
                                  <IconEl size={11} /> {STATUS_WORDS[v.status]}
                                </span>
                                <div className="text-[10px] text-pl-muted mt-0.5">{reasonText(v, sys)}</div>
                              </td>
                              <td className="py-1.5 pr-3 text-[10px] text-pl-muted" data-testid={`eor-distance-${r.id}-${v.key}`}>{distanceText(v, sys)}</td>
                              <td className="py-1.5 text-[10px] text-pl-muted">{v.source}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <p className="text-[11px] text-pl-muted">
        Criteria: {CRITERIA_EDITION.part1}; {CRITERIA_EDITION.part2}. The project averages are the values the paper underlines (the
        approximate mean of the field projects of 1996) and are shown for context only; verdicts use the limits.
      </p>
    </div>
  );
};

export default EorResults;
