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
  checklistProgress,
  countBy,
  isActionOverdue,
  isAuditOverdue,
  isFindingOverdue,
  programmeProgress,
  summarise,
  unansweredItems,
} from '@/lib/auditManagement';
import { AuditShell, BASE } from './components/AuditShell';
import {
  EmptyState, ErrorState, Loading, MetricTile, SchemaNotice,
} from './components/SharedComponents';
import { AuditStatusBadge, ChecklistProgressBar } from './components/AuditBadges';
import { useAuditManagement } from './hooks/useAuditManagement';

/**
 * AS10 — audit reporting, from this organization's own rows.
 *
 * The report this page leads with is the one an audit programme is
 * usually presented without: the audits that were planned and have not
 * happened, and the checklist items nobody answered. Both are counted
 * rather than described.
 */
export default function Reports() {
  const { toast } = useToast();
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
    [programmes, templates, audits, responses, findings, actions]);

  /** Audits planned and not delivered: the programme's real gap. */
  const notDelivered = useMemo(() => audits
    .filter((a) => !['Reported', 'Closed', 'Cancelled'].includes(a.status))
    .map((a) => ({
      ...a,
      progress: checklistProgress(a.template_id ? itemsFor(a.template_id) : [], responsesFor(a.id)),
      unanswered: a.template_id
        ? unansweredItems(itemsFor(a.template_id), responsesFor(a.id)).length : 0,
      overdue: isAuditOverdue(a, today),
    }))
    .sort((a, b) => (a.overdue === b.overdue ? 0 : (a.overdue ? -1 : 1))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audits, itemsFor, responsesFor]);

  const findingTypeData = useMemo(() => FINDING_TYPES
    .map((name) => ({ name, count: summary.byFindingType[name] }))
    .filter((d) => d.count > 0), [summary]);

  const siteData = useMemo(() => countBy(findings, 'site'), [findings]);

  // The engine's overdue predicate, by calendar day. AS10 compared
  // `new Date(due_date) < today`, which parses a date as UTC midnight and
  // listed a finding due TODAY as past due, while the Overdue tiles,
  // using isFindingOverdue, did not count it (AS13).
  const pastDue = useMemo(
    () => findings.filter((f) => isFindingOverdue(f, today)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [findings]);

  const rootCauseData = useMemo(
    () => countBy(findings.filter((f) => f.root_cause_category), 'root_cause_category'),
    [findings]);

  const exportProgrammes = () => {
    if (!programmes.length) {
      toast({ description: 'No programmes to report on.' });
      return;
    }
    exportToCSV(programmes.map((p) => {
      const progress = programmeProgress(auditsForProgramme(p.id), today);
      return {
        Programme: p.title,
        Year: p.programme_year,
        Status: p.status,
        Owner: p.owner_name || '',
        Approved: p.approved_at || '',
        'Audits planned': progress.total,
        'Audits reported': progress.reported,
        'Audits cancelled': progress.cancelled,
        'Audits outstanding': progress.outstanding,
        'Audits overdue': progress.overdue,
        'Delivered (%)': progress.percent === null ? 'n/a' : progress.percent,
      };
    }), `audit-programme-delivery-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  const exportNotDelivered = () => {
    if (!notDelivered.length) {
      toast({ description: 'Every audit has been reported or cancelled.' });
      return;
    }
    exportToCSV(notDelivered.map((a) => ({
      Audit: a.audit_code || '',
      Title: a.title || '',
      Type: a.audit_type || '',
      Site: a.site || '',
      'Lead auditor': a.lead_auditor_name || '',
      Planned: a.planned_start || '',
      'Planned end': a.planned_end || '',
      Overdue: a.overdue ? 'Yes' : 'No',
      Status: a.status || '',
      'Checklist answered': a.progress.total
        ? `${a.progress.answered} of ${a.progress.total}` : 'No checklist',
      'Items unanswered': a.unanswered,
    })), `audits-not-delivered-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  const exportFindings = () => {
    if (!findings.length) {
      toast({ description: 'No findings have been raised.' });
      return;
    }
    exportToCSV(findings.map((f) => ({
      Finding: f.finding_code || '',
      Title: f.title || '',
      Type: f.finding_type || '',
      'Work stopped': f.stop_work ? 'Yes' : 'No',
      Status: f.status || '',
      Site: f.site || '',
      Department: f.department || '',
      Owner: f.owner_name || '',
      Raised: f.raised_date || '',
      Due: f.due_date || '',
      'Root cause category': f.root_cause_category || '',
      Actions: (f.actions || []).length,
      'Actions overdue': (f.actions || []).filter((a) => isActionOverdue(a, today)).length,
      Closed: f.closed_date || '',
    })), `audit-findings-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  if (loading) return <AuditShell title="Reports"><Loading /></AuditShell>;
  if (error) {
    return <AuditShell title="Reports"><ErrorState error={error} onRetry={refresh} /></AuditShell>;
  }
  if (!hasAs10Schema) return <AuditShell title="Reports"><SchemaNotice /></AuditShell>;

  if (!audits.length && !programmes.length) {
    return (
      <AuditShell title="Reports">
        <EmptyState
          icon={<BarChart2 className="w-12 h-12" />}
          title="Nothing to report on yet"
          description="These reports count this organization's own programmes, audits, checklist answers and findings."
          action={<Button onClick={() => navigate(`${BASE}/programmes`)}>Start a programme</Button>}
        />
      </AuditShell>
    );
  }

  const axisTick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  return (
    <AuditShell title="Reports" description="Counted from this organization's own audit records">
      <div className="space-y-6 animate-in fade-in duration-300 pb-20 md:pb-0">
        <div className="flex flex-wrap justify-between items-center gap-3 bg-[hsl(var(--card))] p-4 rounded-xl border border-[hsl(var(--border))] shadow-sm">
          <div>
            <p className="text-sm">
              {summary.audits} audit{summary.audits === 1 ? '' : 's'},
              {' '}{summary.auditsReported} reported,
              {' '}{summary.auditsOutstanding} outstanding,
              {' '}{summary.openFindings} finding{summary.openFindings === 1 ? '' : 's'} open,
              as at {format(today, 'd MMM yyyy')}.
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Counted from this organization&apos;s own rows.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportProgrammes}>
              <Download className="w-4 h-4 mr-2" /> Programme delivery (CSV)
            </Button>
            <Button variant="outline" onClick={exportFindings}>
              <Download className="w-4 h-4 mr-2" /> Findings (CSV)
            </Button>
            <Button onClick={exportNotDelivered}>
              <Download className="w-4 h-4 mr-2" /> Not delivered (CSV)
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricTile
            label="Audits not delivered" value={summary.auditsOutstanding}
            hint={`${summary.auditsOverdue} past their planned end`}
            token={summary.auditsOutstanding ? '--warning' : '--success'}
          />
          <MetricTile
            label="Checklist items unanswered" value={summary.answersOutstanding}
            token={summary.answersOutstanding ? '--warning' : '--success'}
          />
          <MetricTile
            label="Work stopped, still open" value={summary.stopWorkOpen}
            token={summary.stopWorkOpen ? '--destructive' : '--success'}
          />
          <MetricTile
            label="Actions overdue" value={summary.overdueActions}
            token={summary.overdueActions ? '--destructive' : '--success'}
          />
        </div>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Audits planned and not delivered</CardTitle>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              Past their planned end first. An audit that quietly stays Planned all year
              is the one a programme report usually leaves out.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {notDelivered.length === 0 ? (
              <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                Every audit has been reported or cancelled with a reason.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-grid-table w-full">
                  <thead>
                    <tr>
                      <th className="data-grid-th">Audit</th>
                      <th className="data-grid-th">Title</th>
                      <th className="data-grid-th">Lead auditor</th>
                      <th className="data-grid-th">Planned end</th>
                      <th className="data-grid-th">Checklist</th>
                      <th className="data-grid-th">Unanswered</th>
                      <th className="data-grid-th">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notDelivered.map((a) => (
                      <tr key={a.id}
                        className="border-b border-[hsl(var(--border))] last:border-0 cursor-pointer hover:bg-[hsl(var(--secondary))]/50"
                        onClick={() => navigate(`${BASE}/audits/${a.id}`)}>
                        <td className="data-grid-td font-mono text-xs">{a.audit_code}</td>
                        <td className="data-grid-td">{a.title}</td>
                        <td className="data-grid-td text-xs">{a.lead_auditor_name || 'Not named'}</td>
                        <td className="data-grid-td text-xs">
                          <span className={a.overdue ? 'text-[hsl(var(--destructive))] font-medium' : ''}>
                            {a.planned_end || 'Not set'}
                          </span>
                        </td>
                        <td className="data-grid-td">
                          <ChecklistProgressBar progress={a.progress} />
                        </td>
                        <td className="data-grid-td text-xs">{a.unanswered || ''}</td>
                        <td className="data-grid-td"><AuditStatusBadge status={a.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
              <CardTitle className="text-lg">Findings by site</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {siteData.length === 0 ? (
                <p className="py-16 text-center text-[hsl(var(--muted-foreground))]">
                  No findings have been raised.
                </p>
              ) : (
                <div className="relative h-[300px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={siteData} layout="vertical" margin={CHART_MARGINS.compact}>
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
            <CardTitle className="text-lg">Root cause categories</CardTitle>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              Over the findings that have been given a category. The category is
              optional; the root cause itself is written on the finding, and a major
              nonconformity cannot close until it is.
            </p>
          </CardHeader>
          <CardContent className="p-6">
            {rootCauseData.length === 0 ? (
              <p className="py-16 text-center text-[hsl(var(--muted-foreground))]">
                No finding has been given a root cause category yet.
              </p>
            ) : (
              <div className="relative h-[320px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rootCauseData} layout="vertical" margin={CHART_MARGINS.compact}>
                    <CartesianGrid {...GRID_STYLE} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                    <YAxis dataKey="name" type="category" width={210}
                      stroke={CHART_COLORS.axisLine} tick={axisTick} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                    <Bar dataKey="count" name="Findings" fill="#0891b2" radius={[0, 4, 4, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
                <ChartLogo />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Open findings past their due date</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {pastDue.length === 0 ? (
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
                    {pastDue.map((f) => (
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
    </AuditShell>
  );
}
