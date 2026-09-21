import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MOCPageShell, BASE } from './components/MOCPageShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, AlertTriangle, CheckCircle, Clock, Plus, Workflow } from 'lucide-react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { format } from 'date-fns';
import { CHART_COLORS, LEGEND_PROPS, TOOLTIP_STYLE } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  EMERGENCY_RATIFY_DAYS,
  EXPIRY,
  STAGES,
  STAGE_CHART_COLORS,
  byUrgency,
  daysUntil,
  expiryState,
  isExpired,
  parseDateOnly,
  summarise,
} from '@/lib/managementOfChange';
import { ExpiryBadge, RiskBadge, StageBadge } from './components/MOCBadges';
import { EmptyState, ErrorState, Loading, SchemaNotice } from './components/SharedComponents';
import { useManagementOfChange } from './hooks/useManagementOfChange';

const showDate = (v) => {
  const d = parseDateOnly(v);
  return d ? format(d, 'd MMM yyyy') : 'No date';
};

const Tile = ({ label, value, icon, tone, onClick }) => (
  <Card className={`panel-elevation ${onClick ? 'cursor-pointer hover:border-[hsl(var(--primary))]/50 transition-colors' : ''}`}
    onClick={onClick}>
    <CardContent className="p-6 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">{label}</p>
        <h3 className="text-3xl font-bold" style={tone ? { color: `hsl(var(${tone}))` } : undefined}>{value}</h3>
      </div>
      <div className="p-3 rounded-full" style={{ backgroundColor: `hsl(var(${tone || '--primary'}) / 0.1)` }}>
        <span style={{ color: `hsl(var(${tone || '--primary'}))` }}>{icon}</span>
      </div>
    </CardContent>
  </Card>
);

/**
 * AS6 — the MOC dashboard.
 *
 * Every number was a literal: Active MOCs 42, Pending Approval 12,
 * Overdue Actions 5, Implemented YTD 128. The stage breakdown, the
 * monthly trend and the recent-activity list were literals too.
 *
 * And it carried a hardcoded alert reading "MOC-2026-015 and
 * MOC-2026-033 expire in less than 7 days", naming two changes that do
 * not exist. That warning is the single most safety-relevant thing an
 * MOC dashboard shows — a temporary change past its date is a
 * deviation the facility is running on without authority — and it was
 * decoration.
 *
 * The monthly trend is not rebuilt. A trend needs dated snapshots this
 * module does not keep, and drawing one from the current register
 * would be the same invention in a new coat. Expiry, which is real and
 * was missing, takes its place.
 */
export default function MOCDashboard() {
  const navigate = useNavigate();
  const { records, actions, approvals, activity, loading, error, hasAs6Schema, refresh } = useManagementOfChange();

  const today = new Date();
  const summary = useMemo(() => summarise(records, { actions, approvals }, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records, actions, approvals]);

  const stageData = useMemo(
    () => STAGES.map((name) => ({ name, value: summary.byStage[name] })).filter((d) => d.value > 0),
    [summary],
  );

  const expiring = useMemo(
    () => records
      .filter((m) => [EXPIRY.EXPIRED, EXPIRY.EXPIRING].includes(expiryState(m, today)))
      .sort(byUrgency(today))
      .slice(0, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records],
  );

  const recent = useMemo(() => {
    const byId = new Map(records.map((m) => [m.id, m]));
    return activity.slice(0, 6).map((a) => ({ ...a, moc: byId.get(a.moc_id) }));
  }, [activity, records]);

  if (loading) return <MOCPageShell><Loading label="Loading the change register..." /></MOCPageShell>;
  if (error) return <MOCPageShell><ErrorState error={error} onRetry={refresh} /></MOCPageShell>;

  if (records.length === 0) {
    return (
      <MOCPageShell>
        {!hasAs6Schema ? <SchemaNotice /> : null}
        <EmptyState
          icon={<Workflow className="w-12 h-12" />}
          title="This organization has no change requests yet"
          description="Nothing is shown here until there is something real to show. Raise a change and its approvals, actions and expiry will appear."
          action={<Button onClick={() => navigate(`${BASE}/new`)}><Plus className="w-4 h-4 mr-2" /> Raise a change</Button>}
        />
      </MOCPageShell>
    );
  }

  return (
    <MOCPageShell>
      <div className="space-y-6 animate-in fade-in duration-300 pb-20 md:pb-0">
        {!hasAs6Schema ? <SchemaNotice /> : null}

        {summary.expired > 0 ? (
          <div className="p-4 rounded-lg border border-[hsl(var(--destructive))]/40 bg-[hsl(var(--destructive))]/5 text-sm flex gap-3">
            <AlertTriangle className="w-5 h-5 text-[hsl(var(--destructive))] shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">
                {summary.expired} temporary change{summary.expired === 1 ? ' is' : 's are'} past
                {summary.expired === 1 ? ' its' : ' their'} expiry date and still in effect
              </p>
              <p className="text-[hsl(var(--muted-foreground))] mt-1">
                Each one is a deviation the facility is running on without
                current authority. They are listed below.
              </p>
            </div>
          </div>
        ) : null}

        {summary.ratificationOverdue > 0 ? (
          <div className="p-4 rounded-lg border border-[hsl(var(--destructive))]/40 bg-[hsl(var(--destructive))]/5 text-sm flex gap-3">
            <AlertTriangle className="w-5 h-5 text-[hsl(var(--destructive))] shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">
                {summary.ratificationOverdue} emergency change{summary.ratificationOverdue === 1 ? ' has' : 's have'} not
                been ratified inside {EMERGENCY_RATIFY_DAYS} days of going in
              </p>
              <p className="text-[hsl(var(--muted-foreground))] mt-1">
                An emergency change goes in on its first approval level. The remaining
                levels still have to sign, and until they do it is running on reduced authority.
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Tile label="Active changes" value={summary.active}
            icon={<Activity className="w-6 h-6" />} tone="--primary"
            onClick={() => navigate(`${BASE}/register`)} />
          <Tile label="Awaiting approval" value={summary.awaitingApproval}
            icon={<Clock className="w-6 h-6" />} tone="--warning"
            onClick={() => navigate(`${BASE}/approvals`)} />
          <Tile label="Expired temporary" value={summary.expired}
            icon={<AlertTriangle className="w-6 h-6" />} tone="--destructive"
            onClick={() => navigate(`${BASE}/register`)} />
          <Tile label="Overdue actions" value={summary.overdueActions}
            icon={<CheckCircle className="w-6 h-6" />} tone="--warning" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="panel-elevation">
            <CardHeader><CardTitle className="text-lg">The register by stage</CardTitle></CardHeader>
            <CardContent>
              <div className="relative h-[300px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stageData} cx="50%" cy="45%" innerRadius={60} outerRadius={90}
                      paddingAngle={2} dataKey="value" nameKey="name">
                      {stageData.map((d) => <Cell key={d.name} fill={STAGE_CHART_COLORS[d.name]} />)}
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
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Expiring and expired</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate(`${BASE}/register`)}>Register</Button>
            </CardHeader>
            <CardContent className="p-0">
              {expiring.length ? (
                <ul className="divide-y divide-[hsl(var(--border))]">
                  {expiring.map((m) => (
                    <li key={m.id}
                      className="px-6 py-4 flex justify-between items-center gap-4 hover:bg-[hsl(var(--secondary))]/50 cursor-pointer"
                      onClick={() => navigate(`${BASE}/${m.id}`)}>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{m.title}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] font-mono">{m.moc_code}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <ExpiryBadge moc={m} today={today} />
                        <p className={`text-xs mt-1 ${isExpired(m, today) ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                          {showDate(m.expiry_date)}
                          {m.expiry_date ? ` · ${Math.abs(daysUntil(m.expiry_date, today))} days` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                  No temporary change is expired or inside its warning window.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="panel-elevation">
            <CardHeader><CardTitle className="text-lg">By risk level</CardTitle></CardHeader>
            <CardContent className="p-6">
              <div className="flex flex-wrap gap-6">
                {Object.entries(summary.byRisk).map(([risk, n]) => (
                  <div key={risk}>
                    <RiskBadge risk={risk} />
                    <p className="text-2xl font-bold mt-2">{n}</p>
                  </div>
                ))}
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                    Unassessed
                  </span>
                  <p className="text-2xl font-bold mt-2">
                    {summary.total - Object.values(summary.byRisk).reduce((a, b) => a + b, 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="panel-elevation">
            <CardHeader><CardTitle className="text-lg">Recent activity</CardTitle></CardHeader>
            <CardContent className="p-0">
              {recent.length ? (
                <ul className="divide-y divide-[hsl(var(--border))]">
                  {recent.map((a) => (
                    <li key={a.id} className="px-6 py-3 flex justify-between items-center gap-4">
                      <div className="min-w-0">
                        <p className="text-sm truncate">{a.action}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] font-mono">
                          {a.moc?.moc_code || ''}
                        </p>
                      </div>
                      {a.moc ? <StageBadge stage={a.moc.stage} /> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                  Nothing has happened to these changes yet. Stage moves,
                  approvals and actions appear here as they are recorded.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </MOCPageShell>
  );
}
