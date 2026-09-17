import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, GitBranch, ShieldAlert } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { format } from 'date-fns';
import {
  CHART_COLORS, CHART_MARGINS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  LESSON_STATUSES,
  STATUS_CHART_COLORS,
  countBy,
  isUnapplied,
  lessonByAttention,
  summarise,
} from '@/lib/lessonsLearned';
import { LessonsShell, BASE } from './components/LessonsShell';
import {
  EmptyState, ErrorState, Loading, MetricTile, SchemaNotice,
} from './components/SharedComponents';
import {
  LessonStatusBadge, ReuseBadge, ScopeBadge, UnappliedBadge,
} from './components/LessonBadges';
import { useLessonsLearned } from './hooks/useLessonsLearned';

/**
 * AS9 — the lessons dashboard, counted from this organization's rows.
 *
 * What it replaces rendered seven tiles straight out of a literal —
 * `METRICS = { total: 156, published: 110, highReusability: 89, ... }` —
 * two of them with trend badges reading "+12% MoM" and "+5% MoM" over
 * nothing at all, above a captured-trend chart of six hardcoded months
 * and a category pie of four hardcoded slices.
 *
 * The tile that matters here did not exist there: how many published
 * lessons have been applied to nothing.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const {
    lessons, applications, applicationsByLesson,
    loading, error, refresh, hasAs9Schema,
  } = useLessonsLearned();
  const today = new Date();

  const summary = useMemo(() => summarise({ lessons, applications }, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lessons, applications]);

  const statusData = useMemo(() => LESSON_STATUSES
    .map((name) => ({ name, count: summary.byStatus[name] }))
    .filter((d) => d.count > 0), [summary]);

  const categoryData = useMemo(() => countBy(lessons, 'category'), [lessons]);

  const attention = useMemo(
    () => [...lessons].sort(lessonByAttention(applicationsByLesson, today)).slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lessons, applicationsByLesson]);

  if (loading) return <LessonsShell><Loading label="Loading the register..." /></LessonsShell>;
  if (error) return <LessonsShell><ErrorState error={error} onRetry={refresh} /></LessonsShell>;
  if (!hasAs9Schema) return <LessonsShell><SchemaNotice /></LessonsShell>;

  if (!lessons.length) {
    return (
      <LessonsShell>
        <EmptyState
          icon={<BookOpen className="w-12 h-12" />}
          title="No lessons captured yet"
          description="Capture what happened, why it happened and what to do about it. This app used to show five invented lessons and a total of 156 to every organization."
          action={<Button onClick={() => navigate(`${BASE}/new`)}>Capture the first one</Button>}
        />
      </LessonsShell>
    );
  }

  const axisTick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  return (
    <LessonsShell>
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricTile
            label="Lessons" value={summary.lessons}
            hint={`${summary.visible} published or embedded`}
            icon={<BookOpen className="w-6 h-6" />}
          />
          <MetricTile
            label="Applied nowhere" value={summary.lessonsUnapplied}
            hint="Published, and nothing has changed because of it"
            token={summary.lessonsUnapplied ? '--destructive' : '--success'}
            icon={<ShieldAlert className="w-6 h-6" />}
          />
          <MetricTile
            label="Awaiting validation" value={summary.awaitingValidation}
            hint="Submitted, and nobody has reviewed it"
            token={summary.awaitingValidation ? '--warning' : '--muted-foreground'}
          />
          <MetricTile
            label="Pushed into a register"
            value={summary.intoRiskRegister + summary.intoMoc}
            hint={`${summary.intoRiskRegister} risks, ${summary.intoMoc} change records`}
            token="--success"
            icon={<GitBranch className="w-6 h-6" />}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">Lessons by status</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="relative h-[300px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData} margin={CHART_MARGINS.compact}>
                    <CartesianGrid {...GRID_STYLE} vertical={false} />
                    <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={axisTick}
                      interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                    <Bar dataKey="count" name="Lessons" radius={[4, 4, 0, 0]} barSize={34}>
                      {statusData.map((d) => (
                        <Cell key={d.name} fill={STATUS_CHART_COLORS[d.name] || '#94a3b8'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <ChartLogo />
              </div>
            </CardContent>
          </Card>

          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">Lessons by category</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {categoryData.length === 0 ? (
                <p className="py-16 text-center text-[hsl(var(--muted-foreground))]">
                  No categories recorded yet.
                </p>
              ) : (
                <div className="relative h-[300px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData} layout="vertical" margin={CHART_MARGINS.compact}>
                      <CartesianGrid {...GRID_STYLE} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                      <YAxis dataKey="name" type="category" width={150}
                        stroke={CHART_COLORS.axisLine} tick={axisTick} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                      <Bar dataKey="count" name="Lessons" fill="#2563eb" radius={[0, 4, 4, 0]} barSize={20} />
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
              <CardTitle className="text-lg">Needing attention</CardTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                Published lessons nobody has applied first, then lessons waiting for
                somebody to validate them.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate(`${BASE}/register`)}>
              The whole register
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <table className="data-grid-table w-full">
              <thead>
                <tr>
                  <th className="data-grid-th">Lesson</th>
                  <th className="data-grid-th">Title</th>
                  <th className="data-grid-th">Scope</th>
                  <th className="data-grid-th">Applied</th>
                  <th className="data-grid-th">Status</th>
                </tr>
              </thead>
              <tbody>
                {attention.map((l) => (
                  <tr key={l.id}
                    className="border-b border-[hsl(var(--border))] last:border-0 cursor-pointer hover:bg-[hsl(var(--secondary))]/50"
                    onClick={() => navigate(`${BASE}/${l.id}`)}>
                    <td className="data-grid-td font-mono text-xs">{l.lesson_code}</td>
                    <td className="data-grid-td">{l.title}</td>
                    <td className="data-grid-td"><ScopeBadge scope={l.applicability_scope} /></td>
                    <td className="data-grid-td">
                      <ReuseBadge applications={l.applications} />
                      <UnappliedBadge lesson={l} applications={l.applications} />
                      {!isUnapplied(l, l.applications) && !l.applications.length ? (
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">-</span>
                      ) : null}
                    </td>
                    <td className="data-grid-td"><LessonStatusBadge status={l.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          As at {format(today, 'd MMM yyyy')}. Every figure on this page is counted
          from this organization&apos;s own rows.
        </p>
      </div>
    </LessonsShell>
  );
}
