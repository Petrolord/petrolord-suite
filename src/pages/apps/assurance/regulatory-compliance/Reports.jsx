import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { format } from 'date-fns';
import {
  CHART_COLORS, CHART_MARGINS, CHART_TYPOGRAPHY, GRID_STYLE, LEGEND_PROPS, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  STATUS_CHART_COLORS,
  STATUS_SEVERITY,
  countBy,
  deriveStatus,
  summarise,
} from '@/lib/complianceStatus';
import { exportToCSV } from '@/utils/exportUtils';
import { useRegulatoryCompliance } from './hooks/useRegulatoryCompliance';
import { EmptyState, ErrorState, Loading } from './components/SharedComponents';

/**
 * AS3 — compliance reporting.
 *
 * The page it replaces had two panels. "Obligations by Authority" was a
 * bar chart of `[{EPA, 45}, {BSEE, 32}, {OSHA, 28}, {State Dept, 15},
 * {Local Auth, 22}]`, a module-level constant. Every organization that
 * opened this page saw 142 obligations against four American regulators
 * and a "Local Auth", whatever was actually in their register, and
 * nothing on the page said so. It is the worst thing in this app: a
 * compliance report is a document people act on.
 *
 * "Compliance Readiness Matrix" rendered the text "Matrix visualization
 * loading..." in a dashed box. It was not loading. There was no matrix.
 *
 * Both are replaced by counts of the organization's own rows, and the
 * matrix is a real one: regulator by status, which is the cut a
 * compliance lead actually reads before a regulator meeting.
 */
export default function Reports() {
  const { toast } = useToast();
  const { obligations, authorities, loading, error, refresh } = useRegulatoryCompliance();
  const today = new Date();

  const byAuthority = useMemo(() => {
    const names = new Map(authorities.map((a) => [a.id, a.acronym || a.name]));
    return countBy(
      obligations.map((o) => ({ authority: names.get(o.authority_id) || 'No regulator recorded' })),
      'authority',
    );
  }, [obligations, authorities]);

  const byType = useMemo(() => countBy(obligations, 'obligation_type'), [obligations]);

  /** Regulator by status: the cut read before a regulator meeting. */
  const matrix = useMemo(() => {
    const names = new Map(authorities.map((a) => [a.id, a.acronym || a.name]));
    const rows = new Map();
    obligations.forEach((o) => {
      const key = names.get(o.authority_id) || 'No regulator recorded';
      if (!rows.has(key)) {
        rows.set(key, Object.fromEntries(STATUS_SEVERITY.map((s) => [s, 0])));
      }
      rows.get(key)[deriveStatus(o, today)] += 1;
    });
    return [...rows.entries()].map(([name, counts]) => ({ name, ...counts }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obligations, authorities]);

  /** Only the statuses actually present, so the legend is not noise. */
  const presentStatuses = useMemo(() => {
    const s = summarise(obligations, today);
    return STATUS_SEVERITY.filter((k) => s.byStatus[k] > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obligations]);

  const exportSummary = () => {
    if (!obligations.length) {
      toast({ description: 'There is nothing to export: the register is empty.' });
      return;
    }
    exportToCSV(
      matrix.map((row) => {
        const out = { Regulator: row.name };
        presentStatuses.forEach((s) => { out[s] = row[s]; });
        out.Total = presentStatuses.reduce((n, s) => n + row[s], 0);
        return out;
      }),
      `compliance-by-regulator-${format(today, 'yyyy-MM-dd')}.csv`,
    );
  };

  if (loading) return <Loading label="Loading reports..." />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;

  if (obligations.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Download className="w-12 h-12" />}
          title="Nothing to report on yet"
          description="These reports count this organization's own obligations. Add some to the register and they will appear here."
        />
      </div>
    );
  }

  const axisTick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500 pb-24">
      <div className="flex justify-between items-center bg-[hsl(var(--card))] p-4 rounded-xl border border-[hsl(var(--border))] shadow-sm flex-wrap gap-3">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Counted from this organization&apos;s {obligations.length} logged
          obligation{obligations.length === 1 ? '' : 's'}, as at {format(today, 'd MMM yyyy')}.
        </p>
        <Button onClick={exportSummary}
          className="bg-[hsl(var(--warning))] text-white hover:bg-[hsl(var(--warning))]/90 border-0">
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Obligations by regulator</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="relative h-[300px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byAuthority} layout="vertical" margin={CHART_MARGINS.compact}>
                  <CartesianGrid {...GRID_STYLE} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                  <YAxis dataKey="name" type="category" width={140} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                  <Bar dataKey="count" name="Obligations" fill="#2563eb" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
              <ChartLogo />
            </div>
          </CardContent>
        </Card>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Obligations by type</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="relative h-[300px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byType} margin={CHART_MARGINS.compact}>
                  <CartesianGrid {...GRID_STYLE} vertical={false} />
                  <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={axisTick} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                  <Bar dataKey="count" name="Obligations" fill="#059669" radius={[4, 4, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
              <ChartLogo />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="panel-elevation">
        <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
          <CardTitle className="text-lg">Regulator by status</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="relative h-[360px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={matrix} margin={CHART_MARGINS.legend}>
                <CartesianGrid {...GRID_STYLE} vertical={false} />
                <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={axisTick} interval={0} angle={-20} textAnchor="end" height={70} />
                <YAxis allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                <Legend {...LEGEND_PROPS} />
                {presentStatuses.map((s) => (
                  <Bar key={s} dataKey={s} stackId="status" name={s} fill={STATUS_CHART_COLORS[s]} barSize={36}>
                    {matrix.map((row) => <Cell key={`${s}-${row.name}`} fill={STATUS_CHART_COLORS[s]} />)}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
            <ChartLogo />
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-3">
            Statuses are derived from each obligation&apos;s own dates and lead
            time, not from a stored word, so this chart and the register
            always agree.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
