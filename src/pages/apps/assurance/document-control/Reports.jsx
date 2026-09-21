import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  CHART_COLORS, CHART_MARGINS, CHART_TYPOGRAPHY, GRID_STYLE, LEGEND_PROPS, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  DOC_STATUSES,
  STATUS_CHART_COLORS,
  countBy,
  reviewState,
  summarise,
} from '@/lib/documentControl';
import { exportToCSV } from '@/utils/exportUtils';
import { DocControlShell } from './components/DocControlShell';
import { EmptyState, ErrorState, Loading } from './components/SharedComponents';
import { useDocumentControl } from './hooks/useDocumentControl';

/**
 * AS4 — document control reporting.
 *
 * The page it replaces did not work at all. It built a `reports` array
 * whose first entry read `icon: FileListIcon`, and `FileListIcon` was
 * never imported: only Download, BarChart2, PieChart and TrendingUp
 * were. So the component threw a ReferenceError on render, every time,
 * and the Reports tab of Document Control was a blank error boundary
 * for as long as it has shipped.
 *
 * Behind the crash were four cards describing reports that did not
 * exist, one of them offering a "Full FDA CFR 21 Part 11 style audit
 * extract" — a regulatory claim attached to a button that toasted
 * "This feature isn't implemented yet".
 *
 * What is here instead: the master document register, counted and
 * exported from this organization's own rows.
 */
export default function Reports() {
  const { toast } = useToast();
  const { documents, categories, loading, error, refresh } = useDocumentControl();
  const today = new Date();

  const summary = useMemo(() => summarise(documents, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [documents]);

  const categoryName = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c.name]));
    return (d) => byId.get(d.category_id) || 'Uncategorised';
  }, [categories]);

  /** Department by status: the cut a document controller reports on. */
  const byDepartment = useMemo(() => {
    const rows = new Map();
    documents.forEach((d) => {
      const key = d.department || 'Unassigned';
      if (!rows.has(key)) rows.set(key, Object.fromEntries(DOC_STATUSES.map((s) => [s, 0])));
      if (rows.get(key)[d.status] !== undefined) rows.get(key)[d.status] += 1;
    });
    return [...rows.entries()].map(([name, counts]) => ({ name, ...counts }));
  }, [documents]);

  const byCategory = useMemo(
    () => countBy(documents.map((d) => ({ category: categoryName(d) })), 'category'),
    [documents, categoryName],
  );

  const presentStatuses = useMemo(
    () => DOC_STATUSES.filter((s) => summary.byStatus[s] > 0),
    [summary],
  );

  const exportRegister = () => {
    if (!documents.length) {
      toast({ description: 'There is nothing to export: the library is empty.' });
      return;
    }
    exportToCSV(documents.map((d) => ({
      Number: d.document_number || '',
      Title: d.title || '',
      Revision: d.current_revision || '',
      Status: d.status || '',
      Category: categoryName(d),
      Department: d.department || '',
      Confidentiality: d.confidentiality || '',
      Issued: d.issue_date || '',
      'Next review': d.next_review_date || '',
      'Review state': reviewState(d, today),
      Revisions: d.revisions?.length ?? 0,
    })), `master-document-register-${format(today, 'yyyy-MM-dd')}`); // exportToCSV appends .csv
  };

  if (loading) return <DocControlShell><Loading label="Loading reports..." /></DocControlShell>;
  if (error) return <DocControlShell><ErrorState error={error} onRetry={refresh} /></DocControlShell>;

  if (documents.length === 0) {
    return (
      <DocControlShell>
        <EmptyState
          icon={<Download className="w-12 h-12" />}
          title="Nothing to report on yet"
          description="These reports count this organization's own controlled documents. Register some and they will appear here."
        />
      </DocControlShell>
    );
  }

  const axisTick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  return (
    <DocControlShell>
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-wrap justify-between items-center gap-3 bg-[hsl(var(--card))] p-4 rounded-xl border border-[hsl(var(--border))] shadow-sm">
          <div>
            <p className="text-sm">
              {summary.total} controlled document{summary.total === 1 ? '' : 's'},
              {' '}{summary.published} published, {summary.overdue} overdue for review,
              as at {format(today, 'd MMM yyyy')}.
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Counted from this organization&apos;s own rows.
            </p>
          </div>
          <Button onClick={exportRegister}>
            <Download className="w-4 h-4 mr-2" /> Master document register (CSV)
          </Button>
        </div>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Department by status</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="relative h-[360px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDepartment} margin={CHART_MARGINS.legend}>
                  <CartesianGrid {...GRID_STYLE} vertical={false} />
                  <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={axisTick}
                    interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                  <Legend {...LEGEND_PROPS} />
                  {presentStatuses.map((s) => (
                    <Bar key={s} dataKey={s} stackId="status" name={s}
                      fill={STATUS_CHART_COLORS[s]} barSize={36} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              <ChartLogo />
            </div>
          </CardContent>
        </Card>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Documents by category</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="relative h-[300px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCategory} layout="vertical" margin={CHART_MARGINS.compact}>
                  <CartesianGrid {...GRID_STYLE} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                  <YAxis dataKey="name" type="category" width={140}
                    stroke={CHART_COLORS.axisLine} tick={axisTick} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                  <Bar dataKey="count" name="Documents" fill="#2563eb" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
              <ChartLogo />
            </div>
          </CardContent>
        </Card>
      </div>
    </DocControlShell>
  );
}
