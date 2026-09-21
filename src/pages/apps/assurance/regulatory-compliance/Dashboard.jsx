import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Clock, FileCheck, Plus, Shield } from 'lucide-react';
import {
  Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { format } from 'date-fns';
import {
  CHART_COLORS, CHART_MARGINS, CHART_TYPOGRAPHY, GRID_STYLE, LEGEND_PROPS, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  ATTENTION_STATUSES,
  STATUS,
  STATUS_CHART_COLORS,
  byUrgency,
  countBy,
  deriveStatus,
  nextActionDate,
  parseDateOnly,
  summarise,
} from '@/lib/complianceStatus';
import { useRegulatoryCompliance } from './hooks/useRegulatoryCompliance';
import {
  EmptyState, ErrorState, Loading, SchemaNotice, StatusBadge,
} from './components/SharedComponents';

const BASE = '/dashboard/apps/assurance/regulatory-compliance';

const showDate = (value) => {
  const d = parseDateOnly(value);
  return d ? format(d, 'd MMM yyyy') : 'No date';
};

const Tile = ({ label, value, icon, tone, onClick }) => (
  <Card className={`panel-elevation ${onClick ? 'cursor-pointer hover:border-[hsl(var(--warning))]/50 transition-colors' : ''}`}
    onClick={onClick}>
    <CardContent className="p-5 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">{label}</p>
        <h3 className="text-3xl font-bold mt-1" style={tone ? { color: `hsl(var(${tone}))` } : undefined}>{value}</h3>
      </div>
      <div className="opacity-50" style={tone ? { color: `hsl(var(${tone}))` } : undefined}>{icon}</div>
    </CardContent>
  </Card>
);

/**
 * AS3 — the compliance dashboard.
 *
 * Three things on this page were not true.
 *
 * The "Obligations Trend" area chart was labelled Oct to Mar and was
 * computed as `metrics.total - 10`, `total - 7`, `total - 5`, `total -
 * 2`, `total`, `total`. It was a picture of a register growing steadily
 * over six months that had nothing to do with any register, drawn in
 * months with no relation to today, and the only comment marking it as
 * fiction was inside the file. It is replaced by a breakdown by regime,
 * which is a real count of real rows. A genuine trend needs dated
 * snapshots, which this module does not keep; drawing one anyway is
 * exactly the invention the AS programme exists to remove.
 *
 * "Recent Activity" printed "Record <title> was updated" for the first
 * four rows in the register, whether or not anything had been updated,
 * timestamped with created_at when updated_at was null. It is replaced
 * by real filings from regulatory_evidence.
 *
 * The status counts were computed in a forEach here, with their own
 * idea of what overdue meant, so a tile could disagree with the badge
 * on the same row in the table. They come from the one authority now.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const { obligations, authorities, evidence, loading, error, hasAs3Schema, refresh } =
    useRegulatoryCompliance();

  const today = new Date();
  const summary = useMemo(() => summarise(obligations, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obligations]);

  const statusData = useMemo(
    () => Object.entries(summary.byStatus)
      .filter(([, n]) => n > 0)
      .map(([name, value]) => ({ name, value })),
    [summary],
  );

  const regimeData = useMemo(() => countBy(obligations, 'regime'), [obligations]);

  const attention = useMemo(
    () => obligations
      .filter((o) => ATTENTION_STATUSES.includes(deriveStatus(o, today)))
      .sort(byUrgency(today))
      .slice(0, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obligations],
  );

  const recentFilings = useMemo(() => {
    const byId = new Map(obligations.map((o) => [o.id, o]));
    return [...evidence]
      .sort((a, b) => String(b.submitted_date).localeCompare(String(a.submitted_date)))
      .slice(0, 5)
      .map((e) => ({ ...e, obligation: byId.get(e.obligation_id) }));
  }, [evidence, obligations]);

  if (loading) return <Loading label="Loading the compliance dashboard..." />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;

  if (obligations.length === 0) {
    return (
      <div className="p-6">
        {!hasAs3Schema ? <SchemaNotice /> : null}
        <EmptyState
          icon={<Shield className="w-12 h-12" />}
          title="This organization has no compliance obligations logged"
          description="Add the permits, licences and returns it is held to. Nothing is shown here until there is something real to show."
          action={(
            <Button onClick={() => navigate(`${BASE}/new`)}
              className="bg-[hsl(var(--warning))] text-white hover:bg-[hsl(var(--warning))]/90 border-0">
              <Plus className="w-4 h-4 mr-2" /> Add the first obligation
            </Button>
          )}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500 pb-24">
      {!hasAs3Schema ? <SchemaNotice /> : null}

      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Regulatory compliance</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {summary.total} obligation{summary.total === 1 ? '' : 's'} across{' '}
            {authorities.length} regulator{authorities.length === 1 ? '' : 's'}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`${BASE}/reports`)}
            className="bg-[hsl(var(--background))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]">
            Reports
          </Button>
          <Button onClick={() => navigate(`${BASE}/new`)}
            className="bg-[hsl(var(--warning))] text-white hover:bg-[hsl(var(--warning))]/90 border-0">
            <Plus className="w-4 h-4 mr-2" /> Add obligation
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Tile label="Needs attention" value={summary.attention}
          tone="--destructive" icon={<AlertTriangle className="w-8 h-8" />}
          onClick={() => navigate(`${BASE}/register`)} />
        <Tile label="Expired permits" value={summary.byStatus[STATUS.EXPIRED]}
          tone="--destructive" icon={<Shield className="w-8 h-8" />}
          onClick={() => navigate(`${BASE}/register`)} />
        <Tile label="Due soon" value={summary.byStatus[STATUS.DUE_SOON]}
          tone="--warning" icon={<Clock className="w-8 h-8" />}
          onClick={() => navigate(`${BASE}/register`)} />
        <Tile label="Filed and current" value={summary.byStatus[STATUS.COMPLIANT]}
          tone="--success" icon={<CheckCircle className="w-8 h-8" />}
          onClick={() => navigate(`${BASE}/register`)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="panel-elevation">
          <CardHeader><CardTitle className="text-lg">Where the register stands</CardTitle></CardHeader>
          <CardContent>
            <div className="relative h-[300px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="45%" innerRadius={60} outerRadius={90}
                    paddingAngle={2} dataKey="value" nameKey="name">
                    {statusData.map((d) => (
                      <Cell key={d.name} fill={STATUS_CHART_COLORS[d.name]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend {...LEGEND_PROPS} />
                </PieChart>
              </ResponsiveContainer>
              <ChartLogo />
            </div>
          </CardContent>
        </Card>

        <Card className="panel-elevation">
          <CardHeader>
            <CardTitle className="text-lg">Obligations by regime</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative h-[300px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={regimeData} layout="vertical" margin={CHART_MARGINS.compact}>
                  <CartesianGrid {...GRID_STYLE} horizontal={false} />
                  <XAxis type="number" allowDecimals={false}
                    stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
                  <YAxis dataKey="name" type="category" width={120}
                    stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                  <Bar dataKey="count" name="Obligations" fill="#2563eb" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
              <ChartLogo />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Needs attention</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate(`${BASE}/register`)}
              className="text-[hsl(var(--warning))] hover:bg-[hsl(var(--warning))]/10">View all</Button>
          </CardHeader>
          <CardContent className="p-0">
            {attention.length ? (
              <ul className="divide-y divide-[hsl(var(--border))]">
                {attention.map((o) => (
                  <li key={o.id}
                    className="p-4 flex justify-between items-center gap-4 hover:bg-[hsl(var(--secondary))]/50 cursor-pointer"
                    onClick={() => navigate(`${BASE}/${o.id}`)}>
                    <div className="min-w-0">
                      <p className="font-medium text-[hsl(var(--foreground))] truncate">{o.title}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        {authorities.find((a) => a.id === o.authority_id)?.acronym || 'No regulator'}
                        {o.facility ? ` · ${o.facility}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <StatusBadge obligation={o} today={today} />
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                        {showDate(nextActionDate(o))}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                Nothing is expired, overdue or inside its warning window.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Recent filings</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {recentFilings.length ? (
              <div className="space-y-4">
                {recentFilings.map((e) => (
                  <div key={e.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-[hsl(var(--secondary))] flex items-center justify-center shrink-0">
                      <FileCheck className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-[hsl(var(--foreground))] truncate">
                        {e.obligation?.title || 'An obligation'}
                        {e.reference ? <span className="text-[hsl(var(--muted-foreground))]"> · {e.reference}</span> : null}
                      </p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                        Filed {showDate(e.submitted_date)}
                        {e.period_label ? ` for ${e.period_label}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[hsl(var(--muted-foreground))] py-6 text-center">
                No filings have been recorded yet. Record one from an
                obligation&apos;s page and it will appear here.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
