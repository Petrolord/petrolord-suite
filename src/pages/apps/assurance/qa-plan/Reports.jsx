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
  PLAN_STATUSES,
  PLAN_STATUS_CHART_COLORS,
  countBy,
  daysUntil,
  isBlockingPoint,
  isCapaOverdue,
  isCheckpointOverdue,
  isNcrOpen,
  isNcrOverdue,
  isResolved,
  ncrAgeDays,
  planProgress,
  summarise,
} from '@/lib/qualityAssurance';
import { QAPlanShell, BASE } from './components/QAPlanShell';
import {
  EmptyState, ErrorState, Loading, MetricTile, SchemaNotice,
} from './components/SharedComponents';
import {
  CheckpointStatusBadge, NcrStatusBadge, PointTypeBadge, SeverityBadge,
} from './components/QABadges';
import { useQualityAssurance } from './hooks/useQualityAssurance';

/**
 * AS7 — QA reporting, counted from this organization's own rows.
 *
 * The page it replaces had two panels and neither of them was a chart.
 * "Plans by Status" rendered the literal string
 * "[Chart Visualization: Active 60%, Draft 20%, Closed 20%]" and
 * "NCRs by Department" rendered "[Chart Visualization: Engineering 12,
 * Drilling 5, Projects 8]" — percentages and counts of nothing, the
 * same for every organization that opened the app. Above them an
 * "Export Dashboard" button toasted "Downloading PDF..." and
 * downloaded nothing at all.
 *
 * What a quality manager actually needs off this page is the first
 * panel below: which inspection and hold points are outstanding, and
 * which of them are past their planned date. A hold point is the one
 * intervention that stops work, so an overdue one is either work that
 * is waiting or work that went ahead unverified.
 */
export default function QAReports() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const {
    plans, checkpoints, ncrs, capas, loading, error, refresh, hasAs7Schema,
  } = useQualityAssurance();
  const today = new Date();

  const summary = useMemo(
    () => summarise({ plans, checkpoints, ncrs, capas }, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans, checkpoints, ncrs, capas],
  );

  const planById = useMemo(
    () => new Map(plans.map((p) => [p.id, p])), [plans]);

  const planLabel = (planId) => {
    const plan = planById.get(planId);
    return plan ? (plan.plan_code || plan.title || 'Unknown plan') : 'Unknown plan';
  };

  /**
   * The outstanding intervention report. Blocking points first, then
   * the most overdue, then the soonest planned. A checkpoint with no
   * planned date sorts last: it cannot be overdue, but it is still
   * outstanding.
   */
  const outstanding = useMemo(() => checkpoints
    .filter((c) => !isResolved(c))
    .map((c) => ({
      ...c,
      blocking: isBlockingPoint(c),
      overdue: isCheckpointOverdue(c, today),
      days: daysUntil(c.planned_date, today),
    }))
    .sort((a, b) => {
      if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
      if (a.days === null) return 1;
      if (b.days === null) return -1;
      return a.days - b.days;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [checkpoints]);

  const planStatusData = useMemo(
    () => PLAN_STATUSES
      .map((name) => ({ name, count: summary.byPlanStatus[name] }))
      .filter((d) => d.count > 0),
    [summary],
  );

  /** Root cause, over the non-conformances that have been given one. */
  const rootCauseData = useMemo(
    () => countBy(ncrs.filter((n) => n.root_cause_category), 'root_cause_category'),
    [ncrs],
  );

  const rootCauseUnset = useMemo(
    () => ncrs.filter((n) => !n.root_cause_category).length, [ncrs]);

  /** The literal "Engineering 12, Drilling 5, Projects 8" this replaces. */
  const departmentData = useMemo(() => countBy(ncrs, 'department'), [ncrs]);

  const overdueCapas = useMemo(
    () => capas.filter((c) => isCapaOverdue(c, today)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capas]);

  const exportPlans = () => {
    if (!plans.length) {
      toast({ description: 'There is nothing to export: no quality plans have been created.' });
      return;
    }
    exportToCSV(plans.map((p) => {
      const progress = planProgress(p.checkpoints || []);
      return {
        Plan: p.plan_code || '',
        Title: p.title || '',
        Status: p.status || '',
        Revision: p.revision || '',
        Discipline: p.discipline || '',
        Department: p.department || '',
        Contractor: p.contractor || '',
        Asset: p.asset_id || '',
        Start: p.start_date || '',
        End: p.end_date || '',
        'Inspection points': progress.total,
        'Points resolved': progress.resolved,
        'Points outstanding': progress.total - progress.resolved,
        'Hold points outstanding': progress.holdPointsOutstanding,
        'Open NCRs': (p.ncrs || []).filter(isNcrOpen).length,
      };
    }), `qa-plan-register-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  const exportOutstanding = () => {
    if (!outstanding.length) {
      toast({ description: 'There are no outstanding inspection points to report on.' });
      return;
    }
    exportToCSV(outstanding.map((c) => ({
      Plan: planLabel(c.plan_id),
      Item: c.item_no || '',
      Title: c.title || '',
      'Point type': c.point_type || '',
      'Stops work': c.blocking ? 'Yes' : 'No',
      Responsible: c.responsible_party || '',
      'Acceptance criteria': c.acceptance_criteria || '',
      'Planned date': c.planned_date || '',
      'Days to planned date': c.days === null ? 'No planned date' : c.days,
      Overdue: c.overdue ? 'Yes' : 'No',
      Status: c.status || '',
    })), `qa-outstanding-inspection-points-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  const exportNcrs = () => {
    if (!ncrs.length) {
      toast({ description: 'There is nothing to export: no non-conformances have been raised.' });
      return;
    }
    exportToCSV(ncrs.map((n) => ({
      NCR: n.ncr_code || '',
      Title: n.title || '',
      Severity: n.severity || '',
      Status: n.status || '',
      Plan: n.plan_id ? planLabel(n.plan_id) : '',
      Discipline: n.discipline || '',
      Department: n.department || '',
      Supplier: n.supplier || '',
      Raised: n.raised_date || '',
      Due: n.due_date || '',
      Overdue: isNcrOverdue(n, today) ? 'Yes' : 'No',
      'Age (days)': ncrAgeDays(n, today) ?? '',
      Disposition: n.disposition || '',
      'Root cause category': n.root_cause_category || '',
      'Corrective actions': (n.capas || []).length,
      'Actions open': (n.capas || []).filter(
        (c) => !['Complete', 'Cancelled'].includes(c.status)).length,
      Closed: n.closed_date || '',
    })), `qa-ncr-register-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  if (loading) return <QAPlanShell title="Reports"><Loading label="Loading reports..." /></QAPlanShell>;
  if (error) {
    return (
      <QAPlanShell title="Reports">
        <ErrorState error={error} onRetry={refresh} />
      </QAPlanShell>
    );
  }

  if (!hasAs7Schema) {
    return <QAPlanShell title="Reports"><SchemaNotice /></QAPlanShell>;
  }

  if (plans.length === 0 && ncrs.length === 0) {
    return (
      <QAPlanShell title="Reports">
        <EmptyState
          icon={<BarChart2 className="w-12 h-12" />}
          title="Nothing to report on yet"
          description="These reports count this organization's own quality plans, inspection points and non-conformances. Create a plan and they will appear here."
          action={<Button onClick={() => navigate(`${BASE}/new`)}>Create a quality plan</Button>}
        />
      </QAPlanShell>
    );
  }

  const axisTick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  return (
    <QAPlanShell
      title="Reports"
      description="Counted from this organization's own quality records"
    >
      <div className="space-y-6 animate-in fade-in duration-300 pb-20 md:pb-0">
        <div className="flex flex-wrap justify-between items-center gap-3 bg-[hsl(var(--card))] p-4 rounded-xl border border-[hsl(var(--border))] shadow-sm">
          <div>
            <p className="text-sm">
              {summary.plans} quality plan{summary.plans === 1 ? '' : 's'},
              {' '}{summary.checkpointsOutstanding} inspection point
              {summary.checkpointsOutstanding === 1 ? '' : 's'} outstanding,
              {' '}{summary.openNcrs} open non-conformance
              {summary.openNcrs === 1 ? '' : 's'}, as at {format(today, 'd MMM yyyy')}.
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Every figure below is counted from this organization&apos;s own rows.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportPlans}>
              <Download className="w-4 h-4 mr-2" /> Plan register (CSV)
            </Button>
            <Button variant="outline" onClick={exportNcrs}>
              <Download className="w-4 h-4 mr-2" /> NCR register (CSV)
            </Button>
            <Button onClick={exportOutstanding}>
              <Download className="w-4 h-4 mr-2" /> Outstanding points (CSV)
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricTile
            label="Hold points outstanding"
            value={summary.holdPointsOutstanding}
            hint="Work that may not proceed until verified"
            token={summary.holdPointsOutstanding > 0 ? '--warning' : '--success'}
          />
          <MetricTile
            label="Points overdue"
            value={summary.checkpointsOverdue}
            hint="Past their planned date and not resolved"
            token={summary.checkpointsOverdue > 0 ? '--destructive' : '--success'}
          />
          <MetricTile
            label="Serious NCRs open"
            value={summary.seriousOpen}
            hint="Critical or major; each blocks plan closure"
            token={summary.seriousOpen > 0 ? '--destructive' : '--success'}
          />
          <MetricTile
            label="Concessions"
            value={summary.concessions}
            hint="Accepted use as is or regraded"
            token="--primary"
          />
        </div>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Outstanding inspection and hold points</CardTitle>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              Hold points first, then the soonest planned. A failed point stays
              here: it is what raises the non-conformance.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {outstanding.length === 0 ? (
              <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                Every inspection point on this organization&apos;s plans has been
                passed, waived or marked not applicable.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-grid-table w-full">
                  <thead>
                    <tr>
                      <th className="data-grid-th">Plan</th>
                      <th className="data-grid-th">Item</th>
                      <th className="data-grid-th">Title</th>
                      <th className="data-grid-th">Type</th>
                      <th className="data-grid-th">Responsible</th>
                      <th className="data-grid-th">Planned</th>
                      <th className="data-grid-th">Days</th>
                      <th className="data-grid-th">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outstanding.map((c) => (
                      <tr
                        key={c.id}
                        className="border-b border-[hsl(var(--border))] last:border-0 cursor-pointer hover:bg-[hsl(var(--secondary))]/50"
                        onClick={() => navigate(`${BASE}/${c.plan_id}`)}
                      >
                        <td className="data-grid-td font-mono text-xs">{planLabel(c.plan_id)}</td>
                        <td className="data-grid-td font-mono text-xs">{c.item_no}</td>
                        <td className="data-grid-td">{c.title}</td>
                        <td className="data-grid-td"><PointTypeBadge checkpoint={c} /></td>
                        <td className="data-grid-td text-xs">{c.responsible_party || 'Not set'}</td>
                        <td className="data-grid-td text-xs">{c.planned_date || 'Not set'}</td>
                        <td className="data-grid-td text-xs">
                          {c.days === null ? (
                            <span className="text-[hsl(var(--muted-foreground))]">-</span>
                          ) : (
                            <span className={c.overdue ? 'text-[hsl(var(--destructive))] font-medium' : ''}>
                              {c.days < 0 ? `${Math.abs(c.days)} overdue` : c.days}
                            </span>
                          )}
                        </td>
                        <td className="data-grid-td"><CheckpointStatusBadge status={c.status} /></td>
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
              <CardTitle className="text-lg">Quality plans by status</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {planStatusData.length === 0 ? (
                <p className="py-16 text-center text-[hsl(var(--muted-foreground))]">
                  No quality plans yet.
                </p>
              ) : (
                <div className="relative h-[300px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={planStatusData} margin={CHART_MARGINS.compact}>
                      <CartesianGrid {...GRID_STYLE} vertical={false} />
                      <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={axisTick}
                        interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                      <Bar dataKey="count" name="Plans" radius={[4, 4, 0, 0]} barSize={34}>
                        {planStatusData.map((d) => (
                          <Cell key={d.name} fill={PLAN_STATUS_CHART_COLORS[d.name] || '#94a3b8'} />
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
              <CardTitle className="text-lg">Non-conformances by department</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {departmentData.length === 0 ? (
                <p className="py-16 text-center text-[hsl(var(--muted-foreground))]">
                  No non-conformances have been raised.
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
                      <Bar dataKey="count" name="NCRs" fill="#2563eb" radius={[0, 4, 4, 0]} barSize={20} />
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
              Over the {ncrs.length - rootCauseUnset} non-conformance
              {ncrs.length - rootCauseUnset === 1 ? '' : 's'} that has been given a
              category.
              {rootCauseUnset > 0
                ? ` ${rootCauseUnset} more has not, and is not counted here.`
                : ''}
            </p>
          </CardHeader>
          <CardContent className="p-6">
            {rootCauseData.length === 0 ? (
              <p className="py-16 text-center text-[hsl(var(--muted-foreground))]">
                No non-conformance has been given a root cause category yet. A
                critical or major non-conformance cannot be closed without a
                root cause recorded.
              </p>
            ) : (
              <div className="relative h-[340px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rootCauseData} layout="vertical" margin={CHART_MARGINS.compact}>
                    <CartesianGrid {...GRID_STYLE} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                    <YAxis dataKey="name" type="category" width={210}
                      stroke={CHART_COLORS.axisLine} tick={axisTick} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                    <Bar dataKey="count" name="NCRs" fill="#0891b2" radius={[0, 4, 4, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
                <ChartLogo />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Corrective action effectiveness</CardTitle>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              A corrective action that was done is not the same as a corrective
              action that worked. Only a verified one closes a critical or major
              non-conformance.
            </p>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricTile
                label="Verified effective"
                value={summary.capasVerifiedEffective}
                token="--success"
              />
              <MetricTile
                label="Found ineffective"
                value={summary.capasFoundIneffective}
                hint="Go round again"
                token={summary.capasFoundIneffective > 0 ? '--destructive' : '--muted-foreground'}
              />
              <MetricTile
                label="Awaiting a check"
                value={summary.capasAwaitingEffectiveness}
                hint="Complete, nobody has been back"
                token={summary.capasAwaitingEffectiveness > 0 ? '--warning' : '--muted-foreground'}
              />
              <MetricTile
                label="Overdue actions"
                value={summary.overdueCapas}
                token={summary.overdueCapas > 0 ? '--destructive' : '--success'}
              />
            </div>

            {overdueCapas.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="data-grid-table w-full">
                  <thead>
                    <tr>
                      <th className="data-grid-th">NCR</th>
                      <th className="data-grid-th">Severity</th>
                      <th className="data-grid-th">Action</th>
                      <th className="data-grid-th">Type</th>
                      <th className="data-grid-th">Assignee</th>
                      <th className="data-grid-th">Due</th>
                      <th className="data-grid-th">NCR status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdueCapas.map((c) => {
                      const ncr = ncrs.find((n) => n.id === c.ncr_id);
                      return (
                        <tr
                          key={c.id}
                          className="border-b border-[hsl(var(--border))] last:border-0 cursor-pointer hover:bg-[hsl(var(--secondary))]/50"
                          onClick={() => navigate(`${BASE}/ncr/${c.ncr_id}`)}
                        >
                          <td className="data-grid-td font-mono text-xs">{ncr?.ncr_code || ''}</td>
                          <td className="data-grid-td">
                            {ncr ? <SeverityBadge severity={ncr.severity} /> : null}
                          </td>
                          <td className="data-grid-td">{c.description}</td>
                          <td className="data-grid-td text-xs">{c.action_type}</td>
                          <td className="data-grid-td text-xs">{c.assignee_name || 'Unassigned'}</td>
                          <td className="data-grid-td text-xs text-[hsl(var(--destructive))] font-medium">
                            {c.due_date}
                          </td>
                          <td className="data-grid-td">
                            {ncr ? <NcrStatusBadge status={ncr.status} /> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </QAPlanShell>
  );
}
