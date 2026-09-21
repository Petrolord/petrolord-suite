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
  OUTCOME_CHART_COLORS,
  countBy,
  isUnapplied,
  reuseRecord,
  summarise,
} from '@/lib/lessonsLearned';
import { LessonsShell, BASE } from './components/LessonsShell';
import {
  EmptyState, ErrorState, Loading, MetricTile, SchemaNotice,
} from './components/SharedComponents';
import { LessonStatusBadge, ScopeBadge } from './components/LessonBadges';
import { useLessonsLearned } from './hooks/useLessonsLearned';

/**
 * AS9 — lessons reporting, from this organization's own rows.
 *
 * The page it replaces drew one chart from a constant —
 *
 *   const rootCauseData = [{ name: 'Procedural Omission', count: 45 },
 *     { name: 'Equipment Design', count: 32 }, ...];
 *
 * — over a "Date Range: Year to Date" label that filtered nothing, and
 * its Global Filters, Print All and Export buttons all toasted "🚧
 * This feature isn't implemented yet".
 *
 * The report that matters is first: the published lessons nobody has
 * applied to anything. That is the list a lessons database exists to
 * make short.
 */
export default function Reports() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const {
    lessons, applications, loading, error, refresh, hasAs9Schema,
  } = useLessonsLearned();
  const today = new Date();

  const summary = useMemo(() => summarise({ lessons, applications }, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lessons, applications]);

  const unapplied = useMemo(
    () => lessons.filter((l) => isUnapplied(l, l.applications)),
    [lessons]);

  const rootCauseData = useMemo(
    () => countBy(lessons.filter((l) => l.root_cause_category), 'root_cause_category'),
    [lessons]);

  const uncategorised = useMemo(
    () => lessons.filter((l) => !l.root_cause_category).length, [lessons]);

  const targetData = useMemo(
    () => countBy(applications.filter((a) => a.outcome !== 'Rejected'), 'target_type'),
    [applications]);

  const outcomeData = useMemo(() => countBy(applications, 'outcome'), [applications]);

  const exportRegister = () => {
    if (!lessons.length) {
      toast({ description: 'There is nothing to export: the register is empty.' });
      return;
    }
    exportToCSV(lessons.map((l) => {
      const record = reuseRecord(l.applications);
      return {
        Lesson: l.lesson_code || '',
        Title: l.title || '',
        Status: l.status || '',
        Category: l.category || '',
        'Root cause category': l.root_cause_category || '',
        Scope: l.applicability_scope || '',
        'Event date': l.event_date || '',
        Published: l.published_at || '',
        'Times applied': record.applied,
        'Applied to': record.targets.join('; '),
        Rejected: record.rejected,
        'Last applied': record.lastAppliedOn || '',
      };
    }), `lessons-register-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  const exportUnapplied = () => {
    if (!unapplied.length) {
      toast({ description: 'Every published lesson has been applied somewhere.' });
      return;
    }
    exportToCSV(unapplied.map((l) => ({
      Lesson: l.lesson_code || '',
      Title: l.title || '',
      'What to do about it': l.recommendation || '',
      Scope: l.applicability_scope || '',
      Category: l.category || '',
      Discipline: l.discipline || '',
      Published: l.published_at || '',
      Owner: l.author_name || '',
      Considered: (l.applications || []).length,
    })), `lessons-applied-nowhere-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  const exportApplications = () => {
    if (!applications.length) {
      toast({ description: 'No lesson has been applied to anything yet.' });
      return;
    }
    const byId = new Map(lessons.map((l) => [l.id, l]));
    exportToCSV(applications.map((a) => ({
      Lesson: byId.get(a.lesson_id)?.lesson_code || '',
      Title: byId.get(a.lesson_id)?.title || '',
      'Applied to': a.target_type || '',
      Reference: a.reference || '',
      Outcome: a.outcome || '',
      On: a.applied_on || '',
      Notes: a.notes || '',
    })), `lesson-applications-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  if (loading) return <LessonsShell title="Reports"><Loading /></LessonsShell>;
  if (error) {
    return <LessonsShell title="Reports"><ErrorState error={error} onRetry={refresh} /></LessonsShell>;
  }
  if (!hasAs9Schema) return <LessonsShell title="Reports"><SchemaNotice /></LessonsShell>;

  if (!lessons.length) {
    return (
      <LessonsShell title="Reports">
        <EmptyState
          icon={<BarChart2 className="w-12 h-12" />}
          title="Nothing to report on yet"
          description="These reports count this organization's own lessons and the record of where each one was applied."
          action={<Button onClick={() => navigate(`${BASE}/new`)}>Capture a lesson</Button>}
        />
      </LessonsShell>
    );
  }

  const axisTick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  return (
    <LessonsShell title="Reports" description="Counted from this organization's own register">
      <div className="space-y-6 animate-in fade-in duration-300 pb-20 md:pb-0">
        <div className="flex flex-wrap justify-between items-center gap-3 bg-[hsl(var(--card))] p-4 rounded-xl border border-[hsl(var(--border))] shadow-sm">
          <div>
            <p className="text-sm">
              {summary.lessons} lesson{summary.lessons === 1 ? '' : 's'},
              {' '}{summary.lessonsApplied} applied somewhere,
              {' '}{summary.lessonsUnapplied} applied nowhere,
              as at {format(today, 'd MMM yyyy')}.
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Counted from this organization&apos;s own rows.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportRegister}>
              <Download className="w-4 h-4 mr-2" /> Register (CSV)
            </Button>
            <Button variant="outline" onClick={exportApplications}>
              <Download className="w-4 h-4 mr-2" /> Applications (CSV)
            </Button>
            <Button onClick={exportUnapplied}>
              <Download className="w-4 h-4 mr-2" /> Applied nowhere (CSV)
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricTile
            label="Applied nowhere" value={summary.lessonsUnapplied}
            token={summary.lessonsUnapplied ? '--destructive' : '--success'}
          />
          <MetricTile
            label="Applications recorded" value={summary.applications}
            hint={`${summary.applied} changed something, ${summary.rejected} rejected`}
            token="--success"
          />
          <MetricTile
            label="Into the risk register" value={summary.intoRiskRegister} token="--primary" />
          <MetricTile label="Into change control" value={summary.intoMoc} token="--primary" />
        </div>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Published lessons applied to nothing</CardTitle>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              The list this app exists to make short. A lesson that changed nothing has
              not been learned.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {unapplied.length === 0 ? (
              <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                Every published lesson has been applied to something.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-grid-table w-full">
                  <thead>
                    <tr>
                      <th className="data-grid-th">Lesson</th>
                      <th className="data-grid-th">What to do about it</th>
                      <th className="data-grid-th">Scope</th>
                      <th className="data-grid-th">Published</th>
                      <th className="data-grid-th">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unapplied.map((l) => (
                      <tr key={l.id}
                        className="border-b border-[hsl(var(--border))] last:border-0 cursor-pointer hover:bg-[hsl(var(--secondary))]/50"
                        onClick={() => navigate(`${BASE}/${l.id}`)}>
                        <td className="data-grid-td font-mono text-xs">{l.lesson_code}</td>
                        <td className="data-grid-td">{l.recommendation || l.title}</td>
                        <td className="data-grid-td"><ScopeBadge scope={l.applicability_scope} /></td>
                        <td className="data-grid-td text-xs">{l.published_at || ''}</td>
                        <td className="data-grid-td"><LessonStatusBadge status={l.status} /></td>
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
              <CardTitle className="text-lg">Root cause categories</CardTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                Over the {lessons.length - uncategorised} lesson
                {lessons.length - uncategorised === 1 ? '' : 's'} that has been given a
                category.
                {uncategorised > 0 ? ` ${uncategorised} more has not.` : ''}
              </p>
            </CardHeader>
            <CardContent className="p-6">
              {rootCauseData.length === 0 ? (
                <p className="py-16 text-center text-[hsl(var(--muted-foreground))]">
                  No lesson has been given a root cause category yet.
                </p>
              ) : (
                <div className="relative h-[320px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rootCauseData} layout="vertical" margin={CHART_MARGINS.compact}>
                      <CartesianGrid {...GRID_STYLE} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                      <YAxis dataKey="name" type="category" width={200}
                        stroke={CHART_COLORS.axisLine} tick={axisTick} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                      <Bar dataKey="count" name="Lessons" fill="#0891b2" radius={[0, 4, 4, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                  <ChartLogo />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">What lessons have changed</CardTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                Adopted and adapted applications, by what they changed.
              </p>
            </CardHeader>
            <CardContent className="p-6">
              {targetData.length === 0 ? (
                <p className="py-16 text-center text-[hsl(var(--muted-foreground))]">
                  No lesson has been applied to anything yet.
                </p>
              ) : (
                <div className="relative h-[320px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={targetData} layout="vertical" margin={CHART_MARGINS.compact}>
                      <CartesianGrid {...GRID_STYLE} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                      <YAxis dataKey="name" type="category" width={170}
                        stroke={CHART_COLORS.axisLine} tick={axisTick} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                      <Bar dataKey="count" name="Applications" fill="#059669" radius={[0, 4, 4, 0]} barSize={20} />
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
            <CardTitle className="text-lg">Outcomes</CardTitle>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              A rejected application is a real record: somebody considered the lesson
              and wrote down why it was not adopted.
            </p>
          </CardHeader>
          <CardContent className="p-6">
            {outcomeData.length === 0 ? (
              <p className="py-16 text-center text-[hsl(var(--muted-foreground))]">
                No applications recorded yet.
              </p>
            ) : (
              <div className="relative h-[260px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={outcomeData} margin={CHART_MARGINS.compact}>
                    <CartesianGrid {...GRID_STYLE} vertical={false} />
                    <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={axisTick} />
                    <YAxis allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                    <Bar dataKey="count" name="Applications" radius={[4, 4, 0, 0]} barSize={40}>
                      {outcomeData.map((d) => (
                        <Cell key={d.name} fill={OUTCOME_CHART_COLORS[d.name] || '#94a3b8'} />
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
    </LessonsShell>
  );
}
