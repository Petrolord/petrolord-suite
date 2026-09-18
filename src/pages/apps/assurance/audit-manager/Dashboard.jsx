import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarRange, ClipboardCheck, FileWarning, ShieldAlert } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { format } from 'date-fns';
import {
  CHART_COLORS, CHART_MARGINS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  AUDIT_STATUSES,
  AUDIT_STATUS_CHART_COLORS,
  RESULT_CHART_COLORS,
  checklistProgress,
  findingByAttention,
  isAuditOverdue,
  programmeProgress,
  summarise,
} from '@/lib/auditManagement';
import { AuditShell, BASE } from './components/AuditShell';
import {
  EmptyState, ErrorState, Loading, MetricTile, SchemaNotice,
} from './components/SharedComponents';
import {
  AuditStatusBadge, ChecklistProgressBar, FindingStatusBadge, FindingTypeBadge,
  ProgrammeStatusBadge, StopWorkBadge,
} from './components/AuditBadges';
import { useAuditManagement } from './hooks/useAuditManagement';

/**
 * AS10 — the dashboard of an app that did not exist.
 *
 * Nothing here replaces anything: `safety-audit-manager` and
 * `audit-trail-manager` were sellable tiles with no page behind them.
 * So the only rule this page follows is the module's: every number on
 * it is counted from this organization's own rows, and the two that
 * matter most are the ones an audit programme is usually reported
 * without — how much of the checklist work was actually done, and
 * which audits were planned and never happened.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const {
    programmes, templates, audits, responses, findings, actions,
    itemsFor, responsesFor, auditsForProgramme,
    loading, error, refresh, hasAs10Schema,
  } = useAuditManagement();
  const today = new Date();

  const summary = useMemo(
    () => summarise({ programmes, templates, audits, responses, findings, actions }, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [programmes, templates, audits, responses, findings, actions],
  );

  const statusData = useMemo(() => AUDIT_STATUSES
    .map((name) => ({ name, count: summary.byAuditStatus[name] }))
    .filter((d) => d.count > 0), [summary]);

  const resultData = useMemo(() => ([
    { name: 'Conformant', count: responses.filter((r) => r.result === 'Conformant').length },
    { name: 'Nonconformant', count: summary.nonconformances },
    { name: 'Observation', count: responses.filter((r) => r.result === 'Observation').length },
    { name: 'Not applicable', count: summary.notApplicable },
    { name: 'Not examined', count: summary.answersOutstanding },
  ].filter((d) => d.count > 0)), [responses, summary]);

  const liveAudits = useMemo(() => audits
    .filter((a) => !['Reported', 'Closed', 'Cancelled'].includes(a.status))
    .map((a) => ({
      ...a,
      progress: checklistProgress(a.template_id ? itemsFor(a.template_id) : [], responsesFor(a.id)),
      overdue: isAuditOverdue(a, today),
    }))
    .sort((a, b) => (a.overdue === b.overdue ? 0 : (a.overdue ? -1 : 1)))
    .slice(0, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audits, itemsFor, responsesFor]);

  const attention = useMemo(
    () => [...findings].sort(findingByAttention(today)).slice(0, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [findings]);

  const liveProgrammes = useMemo(() => programmes
    .filter((p) => ['Draft', 'Approved', 'In progress'].includes(p.status))
    .map((p) => ({ ...p, progress: programmeProgress(auditsForProgramme(p.id), today) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [programmes, auditsForProgramme]);

  if (loading) return <AuditShell><Loading label="Loading the audit register..." /></AuditShell>;
  if (error) return <AuditShell><ErrorState error={error} onRetry={refresh} /></AuditShell>;
  if (!hasAs10Schema) return <AuditShell><SchemaNotice /></AuditShell>;

  if (!audits.length && !programmes.length) {
    return (
      <AuditShell>
        <EmptyState
          icon={<ClipboardCheck className="w-12 h-12" />}
          title="No audit programme yet"
          description="Plan the audits this organization will run this year, build the checklists they are run against, and the findings follow from the answers."
          action={(
            <div className="flex gap-2">
              <Button onClick={() => navigate(`${BASE}/programmes`)}>Start a programme</Button>
              <Button variant="outline" onClick={() => navigate(`${BASE}/checklists`)}>
                Build a checklist
              </Button>
            </div>
          )}
        />
      </AuditShell>
    );
  }

  const axisTick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  return (
    <AuditShell>
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricTile
            label="Audits outstanding" value={summary.auditsOutstanding}
            hint={`${summary.auditsOverdue} past their planned end`}
            token={summary.auditsOverdue ? '--destructive' : '--primary'}
            icon={<ClipboardCheck className="w-6 h-6" />}
          />
          <MetricTile
            label="Checklist items unanswered" value={summary.answersOutstanding}
            hint={`${summary.answers} answered`}
            token={summary.answersOutstanding ? '--warning' : '--success'}
          />
          <MetricTile
            label="Work stopped, still open" value={summary.stopWorkOpen}
            hint={`${summary.stopWork} raised in total`}
            token={summary.stopWorkOpen ? '--destructive' : '--success'}
            icon={<ShieldAlert className="w-6 h-6" />}
          />
          <MetricTile
            label="Major nonconformities open" value={summary.openMajor}
            hint={`${summary.openFindings} findings open in total`}
            token={summary.openMajor ? '--destructive' : '--success'}
            icon={<FileWarning className="w-6 h-6" />}
          />
        </div>

        {liveProgrammes.length ? (
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Programme delivery</CardTitle>
                <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                  Counted from audits reported, not from audits planned.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate(`${BASE}/programmes`)}>
                <CalendarRange className="w-4 h-4 mr-2" /> Programmes
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <table className="data-grid-table w-full">
                <thead>
                  <tr>
                    <th className="data-grid-th">Programme</th>
                    <th className="data-grid-th">Year</th>
                    <th className="data-grid-th">Audits</th>
                    <th className="data-grid-th">Reported</th>
                    <th className="data-grid-th">Outstanding</th>
                    <th className="data-grid-th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {liveProgrammes.map((p) => (
                    <tr key={p.id}
                      className="border-b border-[hsl(var(--border))] last:border-0 cursor-pointer hover:bg-[hsl(var(--secondary))]/50"
                      onClick={() => navigate(`${BASE}/programmes`)}>
                      <td className="data-grid-td">{p.title}</td>
                      <td className="data-grid-td text-xs">{p.programme_year}</td>
                      <td className="data-grid-td text-xs">{p.progress.total}</td>
                      <td className="data-grid-td text-xs">
                        {p.progress.reported}
                        {p.progress.percent !== null ? ` (${p.progress.percent}%)` : ''}
                      </td>
                      <td className="data-grid-td text-xs">
                        <span className={p.progress.overdue ? 'text-[hsl(var(--destructive))] font-medium' : ''}>
                          {p.progress.outstanding}
                          {p.progress.overdue ? `, ${p.progress.overdue} overdue` : ''}
                        </span>
                      </td>
                      <td className="data-grid-td"><ProgrammeStatusBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">Audits by status</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {statusData.length === 0 ? (
                <p className="py-16 text-center text-[hsl(var(--muted-foreground))]">
                  No audits planned yet.
                </p>
              ) : (
                <div className="relative h-[300px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusData} margin={CHART_MARGINS.compact}>
                      <CartesianGrid {...GRID_STYLE} vertical={false} />
                      <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={axisTick}
                        interval={0} angle={-20} textAnchor="end" height={70} />
                      <YAxis allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                      <Bar dataKey="count" name="Audits" radius={[4, 4, 0, 0]} barSize={34}>
                        {statusData.map((d) => (
                          <Cell key={d.name} fill={AUDIT_STATUS_CHART_COLORS[d.name] || '#94a3b8'} />
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
              <CardTitle className="text-lg">Checklist answers</CardTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                Across every audit. &quot;Not examined&quot; is counted rather than
                left out of the picture.
              </p>
            </CardHeader>
            <CardContent className="p-6">
              {resultData.length === 0 ? (
                <p className="py-16 text-center text-[hsl(var(--muted-foreground))]">
                  No checklist has been opened yet.
                </p>
              ) : (
                <div className="relative h-[300px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={resultData} layout="vertical" margin={CHART_MARGINS.compact}>
                      <CartesianGrid {...GRID_STYLE} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                      <YAxis dataKey="name" type="category" width={130}
                        stroke={CHART_COLORS.axisLine} tick={axisTick} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                      <Bar dataKey="count" name="Answers" radius={[0, 4, 4, 0]} barSize={22}>
                        {resultData.map((d) => (
                          <Cell key={d.name} fill={RESULT_CHART_COLORS[d.name] || '#94a3b8'} />
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-lg">Audits in progress</CardTitle>
              <Button size="sm" variant="outline" onClick={() => navigate(`${BASE}/audits`)}>
                All audits
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {liveAudits.length === 0 ? (
                <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                  No audit is currently open.
                </p>
              ) : (
                <table className="data-grid-table w-full">
                  <thead>
                    <tr>
                      <th className="data-grid-th">Audit</th>
                      <th className="data-grid-th">Title</th>
                      <th className="data-grid-th">Checklist</th>
                      <th className="data-grid-th">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveAudits.map((a) => (
                      <tr key={a.id}
                        className="border-b border-[hsl(var(--border))] last:border-0 cursor-pointer hover:bg-[hsl(var(--secondary))]/50"
                        onClick={() => navigate(`${BASE}/audits/${a.id}`)}>
                        <td className="data-grid-td font-mono text-xs">
                          <span className={a.overdue ? 'text-[hsl(var(--destructive))] font-medium' : ''}>
                            {a.audit_code}
                          </span>
                        </td>
                        <td className="data-grid-td">{a.title}</td>
                        <td className="data-grid-td">
                          <ChecklistProgressBar progress={a.progress} />
                        </td>
                        <td className="data-grid-td"><AuditStatusBadge status={a.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Findings needing attention</CardTitle>
                <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                  Open stop-work findings first.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate(`${BASE}/findings`)}>
                All findings
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {attention.length === 0 ? (
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
                      <th className="data-grid-th">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attention.map((f) => (
                      <tr key={f.id}
                        className="border-b border-[hsl(var(--border))] last:border-0 cursor-pointer hover:bg-[hsl(var(--secondary))]/50"
                        onClick={() => navigate(`${BASE}/findings/${f.id}`)}>
                        <td className="data-grid-td font-mono text-xs">{f.finding_code}</td>
                        <td className="data-grid-td">
                          {f.title}
                          <span className="ml-2"><StopWorkBadge finding={f} /></span>
                        </td>
                        <td className="data-grid-td"><FindingTypeBadge type={f.finding_type} /></td>
                        <td className="data-grid-td"><FindingStatusBadge status={f.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          As at {format(today, 'd MMM yyyy')}. Every figure on this page is counted
          from this organization&apos;s own rows.
        </p>
      </div>
    </AuditShell>
  );
}
