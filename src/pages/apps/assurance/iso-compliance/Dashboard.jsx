import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ClipboardCheck, FileWarning, ListChecks, ShieldCheck,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { format } from 'date-fns';
import {
  CHART_COLORS, CHART_MARGINS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CLAUSE_STATUSES,
  CLAUSE_STATUS_CHART_COLORS,
  COVERAGE_CHART_COLORS,
  certificationReadiness,
  findingByUrgency,
  summarise,
} from '@/lib/isoCompliance';
import { ISOShell, BASE } from './components/ISOShell';
import {
  BlockerList, EmptyState, ErrorState, Loading, MetricTile, SchemaNotice,
} from './components/SharedComponents';
import {
  CertificationBadge, FindingStatusBadge, FindingTypeBadge, ReadinessBadge,
} from './components/ISOBadges';
import { useIsoCompliance } from './hooks/useIsoCompliance';
import { certificateState } from './utils/isoPayload';

/**
 * AS8 — the ISO dashboard, counted from this organization's rows.
 *
 * What it replaces led with "Overall Compliance 73%", the share of
 * thirty generated clauses whose status had been decided by `i % 5`,
 * and it was a different percentage on every reload. Beside it sat
 * Total Clauses, Open Findings and Overdue Actions over the same
 * generated arrays, and two dark Recharts panels against the Suite's
 * white chart standard.
 *
 * There is no percentage on this page. Readiness is the list of things
 * a certification auditor would raise, per standard, counted.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const {
    standards, clauses, audits, auditClauses, findings, actions,
    loading, error, refresh, hasAs8Schema,
  } = useIsoCompliance();
  const today = new Date();

  const summary = useMemo(
    () => summarise({ standards, clauses, audits, findings, actions, auditClauses }, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [standards, clauses, audits, findings, actions, auditClauses],
  );

  const readinessByStandard = useMemo(
    () => standards.map((s) => ({
      standard: s,
      readiness: certificationReadiness(s, {
        clauses, findings, actions, audits, auditClauses,
      }, today),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [standards, clauses, findings, actions, audits, auditClauses],
  );

  const clauseStatusData = useMemo(() => CLAUSE_STATUSES
    .map((name) => ({ name, count: summary.byClauseStatus[name] }))
    .filter((d) => d.count > 0), [summary]);

  const coverageData = useMemo(() => ([
    { name: 'Covered', count: summary.clausesCovered },
    { name: 'Audited before this cycle', count: summary.clausesStale },
    { name: 'Never audited', count: summary.clausesNeverAudited },
  ].filter((d) => d.count > 0)), [summary]);

  const urgentFindings = useMemo(
    () => [...findings].sort(findingByUrgency(today)).slice(0, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [findings]);

  if (loading) return <ISOShell><Loading label="Loading the ISO register..." /></ISOShell>;
  if (error) return <ISOShell><ErrorState error={error} onRetry={refresh} /></ISOShell>;
  if (!hasAs8Schema) return <ISOShell><SchemaNotice /></ISOShell>;

  if (!standards.length) {
    return (
      <ISOShell>
        <EmptyState
          icon={<ShieldCheck className="w-12 h-12" />}
          title="No management system standards yet"
          description="Add the standards this organization runs, such as ISO 9001, 14001 or 45001. The clause register, internal audits and findings hang off them."
          action={<Button onClick={() => navigate(`${BASE}/standards`)}>Add a standard</Button>}
        />
      </ISOShell>
    );
  }

  const axisTick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  return (
    <ISOShell>
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricTile
            label="Applicable clauses" value={summary.applicable}
            hint={summary.excluded
              ? `${summary.excluded} excluded with a justification`
              : 'None excluded'}
            icon={<ListChecks className="w-6 h-6" />}
          />
          <MetricTile
            label="Never internally audited" value={summary.clausesNeverAudited}
            hint="ISO 9001 §9.2: the organization audits its own system"
            token={summary.clausesNeverAudited ? '--destructive' : '--success'}
            icon={<ClipboardCheck className="w-6 h-6" />}
          />
          <MetricTile
            label="Claims with no evidence" value={summary.unevidencedClaims}
            hint="Marked conformant, evidence record incomplete"
            token={summary.unevidencedClaims ? '--destructive' : '--success'}
          />
          <MetricTile
            label="Major nonconformities open" value={summary.openMajor}
            hint={`${summary.openFindings} findings open in total`}
            token={summary.openMajor ? '--destructive' : '--success'}
            icon={<FileWarning className="w-6 h-6" />}
          />
        </div>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Certification readiness</CardTitle>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              Every line below is something a certification auditor would raise,
              counted from this organization&apos;s own register. This page used to
              show one number instead: &quot;Overall Compliance&quot;, the share of
              clauses their own owners had marked compliant.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {readinessByStandard.map(({ standard, readiness }) => (
              <div key={standard.id}
                className="p-5 border-b border-[hsl(var(--border))] last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="font-medium">{standard.code}</p>
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                      {readiness.counts.applicable} applicable clause
                      {readiness.counts.applicable === 1 ? '' : 's'},
                      {' '}{readiness.counts.covered} audited this cycle
                      {standard.certificate_expires
                        ? `, certificate ${readiness.counts.certificateExpired ? 'expired' : 'expires'} ${standard.certificate_expires}`
                        : ''}
                      {certificateState(readiness.counts) ? (
                        <span className="ml-1 text-[hsl(var(--destructive))] font-medium">
                          ({certificateState(readiness.counts)})
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <CertificationBadge standard={standard} />
                    <ReadinessBadge readiness={readiness} />
                  </div>
                </div>
                <BlockerList readiness={readiness} />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">Clauses by conformity status</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {clauseStatusData.length === 0 ? (
                <p className="py-16 text-center text-[hsl(var(--muted-foreground))]">
                  No clauses in the register yet.
                </p>
              ) : (
                <div className="relative h-[300px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={clauseStatusData} margin={CHART_MARGINS.compact}>
                      <CartesianGrid {...GRID_STYLE} vertical={false} />
                      <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={axisTick}
                        interval={0} angle={-20} textAnchor="end" height={70} />
                      <YAxis allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                      <Bar dataKey="count" name="Clauses" radius={[4, 4, 0, 0]} barSize={34}>
                        {clauseStatusData.map((d) => (
                          <Cell key={d.name} fill={CLAUSE_STATUS_CHART_COLORS[d.name] || '#94a3b8'} />
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
              <CardTitle className="text-lg">Internal audit coverage</CardTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                Over the certification cycle. Only an internal audit counts.
              </p>
            </CardHeader>
            <CardContent className="p-6">
              {coverageData.length === 0 ? (
                <p className="py-16 text-center text-[hsl(var(--muted-foreground))]">
                  No applicable clauses to cover yet.
                </p>
              ) : (
                <div className="relative h-[300px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={coverageData} layout="vertical" margin={CHART_MARGINS.compact}>
                      <CartesianGrid {...GRID_STYLE} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                      <YAxis dataKey="name" type="category" width={170}
                        stroke={CHART_COLORS.axisLine} tick={axisTick} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                      <Bar dataKey="count" name="Clauses" radius={[0, 4, 4, 0]} barSize={26}>
                        {coverageData.map((d) => (
                          <Cell key={d.name} fill={COVERAGE_CHART_COLORS[d.name] || '#94a3b8'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <ChartLogo />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Findings needing attention</CardTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                Overdue major nonconformities first.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate(`${BASE}/findings`)}>
              All findings
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {urgentFindings.length === 0 ? (
              <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                No findings have been raised.
              </p>
            ) : (
              <table className="data-grid-table w-full">
                <thead>
                  <tr>
                    <th className="data-grid-th">Finding</th>
                    <th className="data-grid-th">Title</th>
                    <th className="data-grid-th">Type</th>
                    <th className="data-grid-th">Due</th>
                    <th className="data-grid-th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {urgentFindings.map((f) => (
                    <tr key={f.id}
                      className="border-b border-[hsl(var(--border))] last:border-0 cursor-pointer hover:bg-[hsl(var(--secondary))]/50"
                      onClick={() => navigate(`${BASE}/findings/${f.id}`)}>
                      <td className="data-grid-td font-mono text-xs">{f.finding_code}</td>
                      <td className="data-grid-td">{f.title}</td>
                      <td className="data-grid-td"><FindingTypeBadge type={f.finding_type} /></td>
                      <td className="data-grid-td text-xs">{f.due_date || 'Not set'}</td>
                      <td className="data-grid-td"><FindingStatusBadge status={f.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          As at {format(today, 'd MMM yyyy')}. Every figure on this page is counted
          from this organization&apos;s own rows.
        </p>
      </div>
    </ISOShell>
  );
}
