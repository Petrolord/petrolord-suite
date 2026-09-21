import React, { useMemo } from 'react';
import { MOCPageShell } from './components/MOCPageShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  CHART_COLORS, CHART_MARGINS, CHART_TYPOGRAPHY, GRID_STYLE, LEGEND_PROPS, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  EXPIRY,
  RISK_CHART_COLORS,
  RISK_LEVELS,
  STAGES,
  STAGE_CHART_COLORS,
  countBy,
  summarise,
} from '@/lib/managementOfChange';
import { exportToCSV } from '@/utils/exportUtils';
import { openActionsOf } from './utils/openActions';
import { EmptyState, ErrorState, Loading } from './components/SharedComponents';
import { useManagementOfChange } from './hooks/useManagementOfChange';
import { expiryDisplay, expiryReportRows } from './utils/expiryDisplay';

/**
 * AS6 — MOC reporting, from this organization's own rows.
 *
 * Every chart on the page it replaces was a literal: a stage breakdown
 * (8 / 15 / 10 / 20 / 45), a category breakdown (45 / 30 / 20 / 5) and,
 * worst of the three, an EXPIRY report:
 *
 *   const expiryData = [
 *     { id: 'MOC-012', daysLeft: 2 }, { id: 'MOC-044', daysLeft: 5 },
 *     { id: 'MOC-088', daysLeft: 12 }, { id: 'MOC-091', daysLeft: 15 }
 *   ];
 *
 * Four invented change numbers with invented countdowns, and each
 * chart carried CSV, Excel and PDF export buttons pointed straight at
 * the constant. The temporary-change expiry report is the one document
 * in this app that says which deviations the facility is running on and
 * for how much longer. It was fiction, and it was downloadable.
 */
export default function MOCReports() {
  const { toast } = useToast();
  const { records, actions, approvals, loading, error, refresh } = useManagementOfChange();
  const today = new Date();

  const summary = useMemo(() => summarise(records, { actions, approvals }, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records, actions, approvals]);

  const stageData = useMemo(
    () => STAGES.map((name) => ({ name, count: summary.byStage[name] })).filter((d) => d.count > 0),
    [summary],
  );

  const categoryData = useMemo(() => countBy(records, 'category'), [records]);

  /**
   * The real expiry report: temporary and emergency changes still to be
   * reverted, in effect or on their way in, soonest first. Rejected and
   * Cancelled changes never went in, and Closed ones read 'Closed out'
   * and have nothing left to revert, so expiryReportRows leaves all three
   * out. One not yet in effect reads "Not yet in effect" rather than
   * "No expiry" beside its own date.
   */
  const expiryRows = useMemo(
    () => expiryReportRows(records, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records],
  );

  const riskByStage = useMemo(() => {
    const rows = new Map();
    records.forEach((m) => {
      const key = m.stage || 'Unknown';
      if (!rows.has(key)) rows.set(key, Object.fromEntries(RISK_LEVELS.map((r) => [r, 0])));
      if (rows.get(key)[m.risk_level] !== undefined) rows.get(key)[m.risk_level] += 1;
    });
    return [...rows.entries()].map(([name, counts]) => ({ name, ...counts }));
  }, [records]);

  const presentRisks = useMemo(
    () => RISK_LEVELS.filter((r) => summary.byRisk[r] > 0), [summary]);

  const exportRegister = () => {
    if (!records.length) {
      toast({ description: 'There is nothing to export: the register is empty.' });
      return;
    }
    exportToCSV(records.map((m) => ({
      Number: m.moc_code || '',
      Title: m.title || '',
      Type: m.type || '',
      Category: m.category || '',
      Stage: m.stage || '',
      Risk: m.risk_level || '',
      Asset: m.asset_id || '',
      'Target implementation': m.target_implementation_date || '',
      Expires: m.expiry_date || '',
      'Expiry state': expiryDisplay(m, today)?.state || '',
      'Open actions': openActionsOf(m, today),
    })), `moc-register-${format(today, 'yyyy-MM-dd')}`);
  };

  const exportExpiry = () => {
    if (!expiryRows.length) {
      toast({ description: 'No temporary or emergency change is in effect or on its way in.' });
      return;
    }
    exportToCSV(expiryRows.map((m) => ({
      Number: m.moc_code || '',
      Title: m.title || '',
      Type: m.type || '',
      Stage: m.stage || '',
      Asset: m.asset_id || '',
      Expires: m.expiry_date || '',
      'Days remaining': m.days === null ? 'No expiry set' : m.days,
      State: m.state,
    })), `moc-temporary-change-expiry-${format(today, 'yyyy-MM-dd')}`);
  };

  if (loading) return <MOCPageShell><Loading label="Loading reports..." /></MOCPageShell>;
  if (error) return <MOCPageShell><ErrorState error={error} onRetry={refresh} /></MOCPageShell>;

  if (records.length === 0) {
    return (
      <MOCPageShell>
        <EmptyState
          icon={<Download className="w-12 h-12" />}
          title="Nothing to report on yet"
          description="These reports count this organization's own change records. Raise some and they will appear here."
        />
      </MOCPageShell>
    );
  }

  const axisTick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  return (
    <MOCPageShell title="Reports" description="Counted from this organization's own change records">
      <div className="space-y-6 animate-in fade-in duration-300 pb-20 md:pb-0">
        <div className="flex flex-wrap justify-between items-center gap-3 bg-[hsl(var(--card))] p-4 rounded-xl border border-[hsl(var(--border))] shadow-sm">
          <div>
            <p className="text-sm">
              {summary.total} change{summary.total === 1 ? '' : 's'},
              {' '}{summary.active} active, {summary.expired} expired temporary,
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
            <Button onClick={exportExpiry}>
              <Download className="w-4 h-4 mr-2" /> Temporary change expiry (CSV)
            </Button>
          </div>
        </div>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Temporary and emergency changes by expiry</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {expiryRows.length === 0 ? (
              <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                No temporary or emergency change is in effect or on its way in.
                Closed, rejected and cancelled ones are not listed.
              </p>
            ) : (
              <table className="data-grid-table w-full">
                <thead>
                  <tr>
                    <th className="data-grid-th">Number</th>
                    <th className="data-grid-th">Title</th>
                    <th className="data-grid-th">Type</th>
                    <th className="data-grid-th">Stage</th>
                    <th className="data-grid-th">Expires</th>
                    <th className="data-grid-th">Days</th>
                    <th className="data-grid-th">State</th>
                  </tr>
                </thead>
                <tbody>
                  {expiryRows.map((m) => (
                    <tr key={m.id} className="border-b border-[hsl(var(--border))] last:border-0">
                      <td className="data-grid-td font-mono text-xs">{m.moc_code}</td>
                      <td className="data-grid-td">{m.title}</td>
                      <td className="data-grid-td text-xs">{m.type}</td>
                      <td className="data-grid-td text-xs">{m.stage}</td>
                      <td className="data-grid-td text-xs">{m.expiry_date || 'Not set'}</td>
                      <td className="data-grid-td text-xs">
                        {m.days === null ? '-' : m.days}
                      </td>
                      <td className="data-grid-td text-xs">
                        <span className={m.state === EXPIRY.EXPIRED ? 'text-[hsl(var(--destructive))] font-medium' : ''}>
                          {m.state}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">Changes by stage</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="relative h-[300px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stageData} margin={CHART_MARGINS.compact}>
                    <CartesianGrid {...GRID_STYLE} vertical={false} />
                    <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={axisTick}
                      interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                    <Bar dataKey="count" name="Changes" radius={[4, 4, 0, 0]} barSize={34}>
                      {stageData.map((d) => (
                        <Cell key={d.name} fill={STAGE_CHART_COLORS[d.name] || '#94a3b8'} />
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
              <CardTitle className="text-lg">Changes by category</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="relative h-[300px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryData} layout="vertical" margin={CHART_MARGINS.compact}>
                    <CartesianGrid {...GRID_STYLE} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                    <YAxis dataKey="name" type="category" width={170}
                      stroke={CHART_COLORS.axisLine} tick={axisTick} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                    <Bar dataKey="count" name="Changes" fill="#2563eb" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
                <ChartLogo />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Risk by stage</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="relative h-[340px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskByStage} margin={CHART_MARGINS.legend}>
                  <CartesianGrid {...GRID_STYLE} vertical={false} />
                  <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={axisTick}
                    interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                  <Legend {...LEGEND_PROPS} />
                  {presentRisks.map((r) => (
                    <Bar key={r} dataKey={r} stackId="risk" name={r}
                      fill={RISK_CHART_COLORS[r]} barSize={40} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              <ChartLogo />
            </div>
          </CardContent>
        </Card>
      </div>
    </MOCPageShell>
  );
}
