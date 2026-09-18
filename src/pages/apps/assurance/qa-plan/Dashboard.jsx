import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Activity, AlertTriangle, CheckCircle, ClipboardList, FileWarning, ShieldAlert,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { format } from 'date-fns';
import {
  CHART_COLORS, CHART_MARGINS, CHART_TYPOGRAPHY, GRID_STYLE, LEGEND_PROPS, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  NCR_SEVERITIES,
  SEVERITY_CHART_COLORS,
  CHECKPOINT_STATUS_CHART_COLORS,
  CHECKPOINT_STATUSES,
  ncrAgeing,
  ncrByUrgency,
  planProgress,
  summarise,
} from '@/lib/qualityAssurance';
import { QAPlanShell, BASE } from './components/QAPlanShell';
import {
  EmptyState, ErrorState, Loading, MetricTile, SchemaNotice,
} from './components/SharedComponents';
import {
  HoldPointBadge, NcrStatusBadge, PlanStatusBadge, ProgressBar, SeverityBadge,
} from './components/QABadges';
import { useQualityAssurance } from './hooks/useQualityAssurance';

/**
 * AS7 — the quality dashboard, counted from this organization's rows.
 *
 * What it replaces: four tiles, of which "Total Plans", "Active Plans"
 * and "Open NCRs" filtered the invented arrays and "Pending Checks"
 * was the number 12. Below them, "Recent QA Plans" listed the first
 * four of the six invented plans and "Recent Non-Conformances" listed
 * both invented NCRs. There were no charts.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const {
    plans, checkpoints, ncrs, capas, activity,
    loading, error, refresh, hasAs7Schema,
  } = useQualityAssurance();
  const today = new Date();

  const summary = useMemo(
    () => summarise({ plans, checkpoints, ncrs, capas }, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans, checkpoints, ncrs, capas],
  );

  const checkpointData = useMemo(() => {
    const counts = Object.fromEntries(CHECKPOINT_STATUSES.map((s) => [s, 0]));
    checkpoints.forEach((c) => {
      if (counts[c.status] !== undefined) counts[c.status] += 1;
    });
    return CHECKPOINT_STATUSES
      .map((name) => ({ name, count: counts[name] }))
      .filter((d) => d.count > 0);
  }, [checkpoints]);

  const ageingData = useMemo(() => ncrAgeing(ncrs, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ncrs]);

  const presentSeverities = useMemo(
    () => NCR_SEVERITIES.filter((s) => summary.openBySeverity[s] > 0), [summary]);

  const urgentNcrs = useMemo(
    () => [...ncrs].sort(ncrByUrgency(today)).slice(0, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ncrs]);

  const livePlans = useMemo(
    () => plans
      .filter((p) => !['Closed', 'Cancelled', 'Superseded'].includes(p.status))
      .slice(0, 6),
    [plans],
  );

  if (loading) return <QAPlanShell><Loading label="Loading the quality register..." /></QAPlanShell>;
  if (error) {
    return <QAPlanShell><ErrorState error={error} onRetry={refresh} /></QAPlanShell>;
  }
  if (!hasAs7Schema) return <QAPlanShell><SchemaNotice /></QAPlanShell>;

  if (plans.length === 0 && ncrs.length === 0) {
    return (
      <QAPlanShell>
        <EmptyState
          icon={<ClipboardList className="w-12 h-12" />}
          title="No quality plans yet"
          description="This register is empty. Create a quality plan and its inspection and test points, or raise a non-conformance, and everything on this page will count them."
          action={(
            <div className="flex gap-2">
              <Button onClick={() => navigate(`${BASE}/new`)}>Create a plan</Button>
              <Button variant="outline" onClick={() => navigate(`${BASE}/ncr-register?raise=1`)}>
                Raise a non-conformance
              </Button>
            </div>
          )}
        />
      </QAPlanShell>
    );
  }

  const axisTick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  return (
    <QAPlanShell title="Quality dashboard"
      description={`Counted from this organization's own records, as at ${format(today, 'd MMM yyyy')}`}>
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <MetricTile
            label="Quality plans"
            value={summary.plans}
            hint={`${summary.activePlans} active`}
            token="--primary"
            icon={<ClipboardList className="w-6 h-6" />}
          />
          <MetricTile
            label="Inspection points outstanding"
            value={summary.checkpointsOutstanding}
            hint={summary.holdPointsOutstanding
              ? `${summary.holdPointsOutstanding} of them hold points, which stop work`
              : 'No hold points outstanding'}
            token={summary.holdPointsOutstanding ? '--destructive' : '--success'}
            icon={<CheckCircle className="w-6 h-6" />}
          />
          <MetricTile
            label="Inspection points failed"
            value={summary.checkpointsFailed}
            hint="A failed inspection is what raises a non-conformance"
            token={summary.checkpointsFailed ? '--destructive' : '--muted-foreground'}
            icon={<AlertTriangle className="w-6 h-6" />}
          />
          <MetricTile
            label="Open non-conformances"
            value={summary.openNcrs}
            hint={summary.seriousOpen
              ? `${summary.seriousOpen} critical or major`
              : 'None critical or major'}
            token={summary.seriousOpen ? '--destructive' : '--warning'}
            icon={<FileWarning className="w-6 h-6" />}
          />
          <MetricTile
            label="Oldest open non-conformance"
            value={summary.oldestOpenNcrDays === null ? '-' : `${summary.oldestOpenNcrDays} d`}
            hint={summary.meanOpenNcrAgeDays === null
              ? 'Nothing open'
              : `Mean age ${summary.meanOpenNcrAgeDays} days`}
            token="--warning"
            icon={<Activity className="w-6 h-6" />}
          />
          <MetricTile
            label="Actions done, effectiveness unchecked"
            value={summary.capasAwaitingEffectiveness}
            hint={summary.capasFoundIneffective
              ? `${summary.capasFoundIneffective} checked and found not to have worked`
              : 'A completed action is not a working one'}
            token={summary.capasAwaitingEffectiveness ? '--warning' : '--success'}
            icon={<ShieldAlert className="w-6 h-6" />}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">Inspection points by status</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {checkpointData.length === 0 ? (
                <p className="py-16 text-center text-[hsl(var(--muted-foreground))]">
                  No inspection points have been added to any plan yet.
                </p>
              ) : (
                <div className="relative h-[300px] rounded-lg p-2"
                  style={{ backgroundColor: CHART_COLORS.background }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={checkpointData} margin={CHART_MARGINS.compact}>
                      <CartesianGrid {...GRID_STYLE} vertical={false} />
                      <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={axisTick}
                        interval={0} angle={-20} textAnchor="end" height={64} />
                      <YAxis allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                      <Bar dataKey="count" name="Points" radius={[4, 4, 0, 0]} barSize={34}>
                        {checkpointData.map((d) => (
                          <Cell key={d.name}
                            fill={CHECKPOINT_STATUS_CHART_COLORS[d.name] || '#94a3b8'} />
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
              <CardTitle className="text-lg">Open non-conformances by age</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {presentSeverities.length === 0 ? (
                <p className="py-16 text-center text-[hsl(var(--muted-foreground))]">
                  Nothing is open.
                </p>
              ) : (
                <div className="relative h-[300px] rounded-lg p-2"
                  style={{ backgroundColor: CHART_COLORS.background }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ageingData} margin={CHART_MARGINS.legend}>
                      <CartesianGrid {...GRID_STYLE} vertical={false} />
                      <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={axisTick}
                        interval={0} height={44} />
                      <YAxis allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                      <Legend {...LEGEND_PROPS} />
                      {presentSeverities.map((s) => (
                        <Bar key={s} dataKey={s} stackId="age" name={s}
                          fill={SEVERITY_CHART_COLORS[s]} barSize={40} />
                      ))}
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
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Plans in progress</CardTitle>
              <Button variant="link" className="h-auto p-0"
                onClick={() => navigate(`${BASE}/register`)}>
                All plans
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {livePlans.length === 0 ? (
                <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                  No plan is currently live.
                </p>
              ) : livePlans.map((p) => {
                const progress = planProgress(p.checkpoints);
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => navigate(`${BASE}/${p.id}`)}
                    className="w-full text-left p-4 border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--secondary))]/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{p.title}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] font-mono mt-0.5">
                          {p.plan_code}
                          {p.department ? ` · ${p.department}` : ''}
                        </p>
                        <div className="mt-2"><ProgressBar progress={progress} /></div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <PlanStatusBadge status={p.status} />
                        <HoldPointBadge progress={progress} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Non-conformances, most urgent first</CardTitle>
              <Button variant="link" className="h-auto p-0"
                onClick={() => navigate(`${BASE}/ncr-register`)}>
                All NCRs
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {urgentNcrs.length === 0 ? (
                <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                  No non-conformance has been raised.
                </p>
              ) : urgentNcrs.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => navigate(`${BASE}/ncr/${n.id}`)}
                  className="w-full text-left p-4 border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--secondary))]/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{n.title}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))] font-mono mt-0.5">
                        {n.ncr_code}
                        {n.raised_date ? ` · raised ${n.raised_date}` : ''}
                        {n.due_date ? ` · due ${n.due_date}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <NcrStatusBadge status={n.status} />
                      <SeverityBadge severity={n.severity} />
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Recent quality activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {activity.length === 0 ? (
              <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                Nothing has happened in this register yet. Every plan created, point
                verified, non-conformance raised and effectiveness check recorded
                appears here.
              </p>
            ) : activity.slice(0, 12).map((a) => (
              <div key={a.id}
                className="p-3 px-4 border-b border-[hsl(var(--border))] last:border-0 flex items-center justify-between gap-4">
                <p className="text-sm min-w-0 truncate">{a.action}</p>
                <span className="text-xs text-[hsl(var(--muted-foreground))] shrink-0">
                  {a.created_at ? format(new Date(a.created_at), 'd MMM yyyy HH:mm') : ''}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </QAPlanShell>
  );
}
