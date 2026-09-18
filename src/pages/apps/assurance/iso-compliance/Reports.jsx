import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart2, Download } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  CHART_COLORS, CHART_MARGINS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import { exportToCSV } from '@/utils/exportUtils';
import {
  FINDING_TYPES,
  FINDING_TYPE_CHART_COLORS,
  certificationReadiness,
  clauseCoverageByStandard,
  countBy,
  hasEvidenceRecord,
  isActionOverdue,
  isFindingOpen,
  summarise,
} from '@/lib/isoCompliance';
import { ISOShell, BASE } from './components/ISOShell';
import {
  BlockerList, EmptyState, ErrorState, Loading, MetricTile, SchemaNotice,
} from './components/SharedComponents';
import { CoverageBadge } from './components/ISOBadges';
import { useIsoCompliance } from './hooks/useIsoCompliance';

/**
 * AS8 — ISO reporting, from this organization's own rows.
 *
 * The page it replaces listed four report types in a sidebar —
 * compliance by standard, audit schedule, finding severity, action
 * tracking — and rendered the same one whichever was clicked, because
 * `selectedReport` was set and never read. Its Print and Export PDF
 * buttons both called `handleExport`, which toasted "Your report is
 * being generated and will download shortly" and generated nothing.
 *
 * The report that matters is first: which applicable clauses no
 * internal audit has examined this certification cycle. It is the
 * question ISO 9001 §9.2 asks, and the old app could not have
 * answered it, because it held no link at all between an audit and a
 * clause.
 */
export default function ISOReports() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const {
    standards, clauses, audits, auditClauses, findings, actions,
    loading, error, refresh, hasAs8Schema,
  } = useIsoCompliance();
  const today = new Date();

  const summary = useMemo(
    () => summarise({ standards, clauses, audits, findings, actions, auditClauses }, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [standards, clauses, audits, findings, actions, auditClauses]);

  const standardByT = useMemo(() => new Map(standards.map((s) => [s.id, s])), [standards]);

  const coverage = useMemo(
    () => clauseCoverageByStandard({ standards, clauses, auditClauses, audits }, today)
      .sort((a, b) => {
        const rank = (r) => (r.lastExaminedOn ? (r.stale ? 1 : 2) : 0);
        const diff = rank(a) - rank(b);
        if (diff !== 0) return diff;
        return String(a.clause_ref).localeCompare(String(b.clause_ref), undefined, { numeric: true });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [standards, clauses, auditClauses, audits]);

  const gaps = useMemo(() => coverage.filter((c) => !c.covered), [coverage]);

  const findingTypeData = useMemo(() => FINDING_TYPES
    .map((name) => ({ name, count: summary.byFindingType[name] }))
    .filter((d) => d.count > 0), [summary]);

  const departmentData = useMemo(() => countBy(findings, 'department'), [findings]);

  const readiness = useMemo(() => standards.map((s) => ({
    standard: s,
    verdict: certificationReadiness(s, { clauses, findings, actions, audits, auditClauses }, today),
  })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [standards, clauses, findings, actions, audits, auditClauses]);

  const exportCoverage = () => {
    if (!coverage.length) {
      toast({ description: 'There are no applicable clauses to report on.' });
      return;
    }
    exportToCSV(coverage.map((row) => ({
      Standard: standardByT.get(row.clause.standard_id)?.code || '',
      Clause: row.clause_ref || '',
      Title: row.clause.title || '',
      Owner: row.clause.owner_name || '',
      'Register status': row.clause.status || '',
      Evidenced: hasEvidenceRecord(row.clause) ? 'Yes' : 'No',
      'Last internal audit': row.lastExaminedOn || 'Never',
      'Audit result': row.lastResult || '',
      'Covered this cycle': row.covered ? 'Yes' : 'No',
      State: row.covered ? 'Covered' : (row.stale ? 'Audited before this cycle' : 'Never audited'),
    })), `iso-clause-coverage-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  const exportFindings = () => {
    if (!findings.length) {
      toast({ description: 'There is nothing to export: no findings have been raised.' });
      return;
    }
    exportToCSV(findings.map((f) => ({
      Finding: f.finding_code || '',
      Title: f.title || '',
      Type: f.finding_type || '',
      Status: f.status || '',
      Department: f.department || '',
      Owner: f.owner_name || '',
      Raised: f.raised_date || '',
      Due: f.due_date || '',
      Correction: f.correction || '',
      'Root cause': f.root_cause || '',
      'Root cause category': f.root_cause_category || '',
      Actions: (f.actions || []).length,
      'Actions overdue': (f.actions || []).filter((a) => isActionOverdue(a, today)).length,
      Closed: f.closed_date || '',
    })), `iso-findings-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  const exportReadiness = () => {
    if (!readiness.length) {
      toast({ description: 'No standards are in the register.' });
      return;
    }
    const rows = [];
    readiness.forEach(({ standard, verdict }) => {
      if (!verdict.blockers.length) {
        rows.push({
          Standard: standard.code, Severity: 'none', Count: 0,
          Item: 'Nothing is blocking a certification audit of this standard.',
        });
        return;
      }
      verdict.blockers.forEach((b) => rows.push({
        Standard: standard.code, Severity: b.severity, Count: b.count, Item: b.text,
      }));
    });
    exportToCSV(rows, `iso-certification-readiness-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  if (loading) return <ISOShell title="Reports"><Loading label="Loading reports..." /></ISOShell>;
  if (error) return <ISOShell title="Reports"><ErrorState error={error} onRetry={refresh} /></ISOShell>;
  if (!hasAs8Schema) return <ISOShell title="Reports"><SchemaNotice /></ISOShell>;

  if (!standards.length && !clauses.length) {
    return (
      <ISOShell title="Reports">
        <EmptyState
          icon={<BarChart2 className="w-12 h-12" />}
          title="Nothing to report on yet"
          description="These reports count this organization's own standards, clauses, audits and findings."
          action={<Button onClick={() => navigate(`${BASE}/standards`)}>Add a standard</Button>}
        />
      </ISOShell>
    );
  }

  const axisTick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  return (
    <ISOShell
      title="Reports"
      description="Counted from this organization's own register"
    >
      <div className="space-y-6 animate-in fade-in duration-300 pb-20 md:pb-0">
        <div className="flex flex-wrap justify-between items-center gap-3 bg-[hsl(var(--card))] p-4 rounded-xl border border-[hsl(var(--border))] shadow-sm">
          <div>
            <p className="text-sm">
              {summary.applicable} applicable clause{summary.applicable === 1 ? '' : 's'},
              {' '}{summary.clausesCovered} audited this cycle,
              {' '}{summary.openFindings} finding{summary.openFindings === 1 ? '' : 's'} open,
              as at {format(today, 'd MMM yyyy')}.
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Counted from this organization&apos;s own rows.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportReadiness}>
              <Download className="w-4 h-4 mr-2" /> Readiness (CSV)
            </Button>
            <Button variant="outline" onClick={exportFindings}>
              <Download className="w-4 h-4 mr-2" /> Findings (CSV)
            </Button>
            <Button onClick={exportCoverage}>
              <Download className="w-4 h-4 mr-2" /> Clause coverage (CSV)
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricTile
            label="Never internally audited" value={summary.clausesNeverAudited}
            token={summary.clausesNeverAudited ? '--destructive' : '--success'}
          />
          <MetricTile
            label="Audited before this cycle" value={summary.clausesStale}
            token={summary.clausesStale ? '--warning' : '--success'}
          />
          <MetricTile
            label="Claims with no evidence" value={summary.unevidencedClaims}
            token={summary.unevidencedClaims ? '--destructive' : '--success'}
          />
          <MetricTile
            label="Actions overdue" value={summary.overdueActions}
            token={summary.overdueActions ? '--destructive' : '--success'}
          />
        </div>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Internal audit coverage gaps</CardTitle>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              Applicable clauses that no internal audit has examined within the
              certification cycle. Never audited first.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {gaps.length === 0 ? (
              <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                Every applicable clause has been examined by an internal audit within
                the certification cycle.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-grid-table w-full">
                  <thead>
                    <tr>
                      <th className="data-grid-th">Standard</th>
                      <th className="data-grid-th">Clause</th>
                      <th className="data-grid-th">Title</th>
                      <th className="data-grid-th">Owner</th>
                      <th className="data-grid-th">Register status</th>
                      <th className="data-grid-th">Internal audit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gaps.map((row) => (
                      <tr key={row.clause.id} className="border-b border-[hsl(var(--border))] last:border-0">
                        <td className="data-grid-td text-xs">
                          {standardByT.get(row.clause.standard_id)?.code || ''}
                        </td>
                        <td className="data-grid-td font-mono text-xs">{row.clause_ref}</td>
                        <td className="data-grid-td">{row.clause.title}</td>
                        <td className="data-grid-td text-xs">
                          {row.clause.owner_name || 'Unassigned'}
                        </td>
                        <td className="data-grid-td text-xs">{row.clause.status}</td>
                        <td className="data-grid-td"><CoverageBadge row={row} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Certification readiness, by standard</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {readiness.length === 0 ? (
              <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                No standards are in the register.
              </p>
            ) : readiness.map(({ standard, verdict }) => (
              <div key={standard.id} className="p-5 border-b border-[hsl(var(--border))] last:border-0">
                <p className="font-medium mb-2">{standard.code}</p>
                <BlockerList readiness={verdict} />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">Findings by type</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {findingTypeData.length === 0 ? (
                <p className="py-16 text-center text-[hsl(var(--muted-foreground))]">
                  No findings have been raised.
                </p>
              ) : (
                <div className="relative h-[300px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={findingTypeData} margin={CHART_MARGINS.compact}>
                      <CartesianGrid {...GRID_STYLE} vertical={false} />
                      <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={axisTick}
                        interval={0} angle={-20} textAnchor="end" height={80} />
                      <YAxis allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                      <Bar dataKey="count" name="Findings" radius={[4, 4, 0, 0]} barSize={34}>
                        {findingTypeData.map((d) => (
                          <Cell key={d.name} fill={FINDING_TYPE_CHART_COLORS[d.name] || '#94a3b8'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <ChartLogo />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">Findings by department</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {departmentData.length === 0 ? (
                <p className="py-16 text-center text-[hsl(var(--muted-foreground))]">
                  No findings have been raised.
                </p>
              ) : (
                <div className="relative h-[300px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={departmentData} layout="vertical" margin={CHART_MARGINS.compact}>
                      <CartesianGrid {...GRID_STYLE} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                      <YAxis dataKey="name" type="category" width={150}
                        stroke={CHART_COLORS.axisLine} tick={axisTick} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                      <Bar dataKey="count" name="Findings" fill="#2563eb" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                  <ChartLogo />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Open findings past their due date</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {findings.filter((f) => isFindingOpen(f) && f.due_date
              && new Date(f.due_date) < today).length === 0 ? (
                <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                  No open finding is past its due date.
                </p>
              ) : (
                <table className="data-grid-table w-full">
                  <thead>
                    <tr>
                      <th className="data-grid-th">Finding</th>
                      <th className="data-grid-th">Title</th>
                      <th className="data-grid-th">Type</th>
                      <th className="data-grid-th">Owner</th>
                      <th className="data-grid-th">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings
                      .filter((f) => isFindingOpen(f) && f.due_date && new Date(f.due_date) < today)
                      .map((f) => (
                        <tr key={f.id}
                          className="border-b border-[hsl(var(--border))] last:border-0 cursor-pointer hover:bg-[hsl(var(--secondary))]/50"
                          onClick={() => navigate(`${BASE}/findings/${f.id}`)}>
                          <td className="data-grid-td font-mono text-xs">{f.finding_code}</td>
                          <td className="data-grid-td">{f.title}</td>
                          <td className="data-grid-td text-xs">{f.finding_type}</td>
                          <td className="data-grid-td text-xs">{f.owner_name || 'Unassigned'}</td>
                          <td className="data-grid-td text-xs text-[hsl(var(--destructive))] font-medium">
                            {f.due_date}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
          </CardContent>
        </Card>
      </div>
    </ISOShell>
  );
}
