import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, MessageSquare, Plus, Users } from 'lucide-react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { format } from 'date-fns';
import { CHART_COLORS, LEGEND_PROPS, TOOLTIP_STYLE } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  STAGES,
  STAGE_CHART_COLORS,
  bySeverityThenAge,
  byUrgency,
  isOverdue,
  parseDateOnly,
  summarise,
} from '@/lib/peerReview';
import { PeerReviewShell, BASE } from './components/PeerReviewShell';
import { SeverityBadge, StageBadge } from './components/StatusBadges';
import { EmptyState, ErrorState, Loading, SchemaNotice } from './components/SharedComponents';
import { usePeerReview } from './hooks/usePeerReview';
import { countsAsBlocking } from './utils/liveComments';

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
 * AS5 — the peer review dashboard.
 *
 * Every number on this page came from `getDashboardStats()`, which
 * never queried the database. It counted a module-level array seeded
 * from MOCK_REVIEWS, so a customer's peer review dashboard was a
 * picture of somebody else's invented project, permanently, and it
 * looked entirely plausible: four KPIs and a stage doughnut, all
 * internally consistent, all about a field that does not exist.
 *
 * "Blocking comments" is new and is the number that matters: unresolved
 * Critical and Major findings are what stop a review closing.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const { reviews, comments, loading, error, hasAs5Schema, refresh } = usePeerReview();

  const today = new Date();
  const summary = useMemo(() => summarise(reviews, comments, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reviews, comments]);

  const stageData = useMemo(
    () => STAGES.map((name) => ({ name, value: summary.byStage[name] })).filter((d) => d.value > 0),
    [summary],
  );

  const attention = useMemo(
    () => reviews.filter((r) => isOverdue(r, today)).sort(byUrgency(today)).slice(0, 5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reviews],
  );

  const blocking = useMemo(() => {
    const byId = new Map(reviews.map((r) => [r.id, r]));
    // ASC-0: exactly the comments the 'Blocking closure' tile counts.
    return comments.filter((c) => countsAsBlocking(c, byId, today)).sort(bySeverityThenAge).slice(0, 5)
      .map((c) => ({ ...c, review: byId.get(c.review_id) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments, reviews]);

  if (loading) return <PeerReviewShell><Loading label="Loading the review register..." /></PeerReviewShell>;
  if (error) return <PeerReviewShell><ErrorState error={error} onRetry={refresh} /></PeerReviewShell>;

  if (reviews.length === 0) {
    return (
      <PeerReviewShell>
        {!hasAs5Schema ? <SchemaNotice /> : null}
        <EmptyState
          icon={<Users className="w-12 h-12" />}
          title="This organization has no reviews raised yet"
          description="Nothing is shown here until there is something real to show. Raise a technical review and its comments, stages and audit trail will appear."
          action={<Button onClick={() => navigate(`${BASE}/new`)}><Plus className="w-4 h-4 mr-2" /> Raise a review</Button>}
        />
      </PeerReviewShell>
    );
  }

  return (
    <PeerReviewShell>
      <div className="space-y-6 animate-in fade-in duration-500">
        {!hasAs5Schema ? <SchemaNotice /> : null}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Tile label="Active reviews" value={summary.active}
            icon={<Users className="w-6 h-6" />} tone="--primary"
            onClick={() => navigate(`${BASE}/register`)} />
          <Tile label="Overdue" value={summary.overdue}
            icon={<Clock className="w-6 h-6" />} tone="--warning"
            onClick={() => navigate(`${BASE}/register`)} />
          <Tile label="Open comments" value={summary.openComments}
            icon={<MessageSquare className="w-6 h-6" />} tone="--primary" />
          <Tile label="Blocking closure" value={summary.blockingComments}
            icon={<AlertTriangle className="w-6 h-6" />} tone="--destructive" />
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
              <CardTitle className="text-lg">Running late</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate(`${BASE}/register`)}>Register</Button>
            </CardHeader>
            <CardContent className="p-0">
              {attention.length ? (
                <ul className="divide-y divide-[hsl(var(--border))]">
                  {attention.map((r) => (
                    <li key={r.id}
                      className="px-6 py-4 flex justify-between items-center gap-4 hover:bg-[hsl(var(--secondary))]/50 cursor-pointer"
                      onClick={() => navigate(`${BASE}/${r.id}`)}>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{r.title}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] font-mono">{r.review_code}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <StageBadge stage={r.stage} />
                        <p className="text-xs text-[hsl(var(--destructive))] mt-1">{showDate(r.due_date)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                  No live review is past its target date.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="panel-elevation">
          <CardHeader>
            <CardTitle className="text-lg">Comments blocking closure</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {blocking.length ? (
              <ul className="divide-y divide-[hsl(var(--border))]">
                {blocking.map((c) => (
                  <li key={c.id}
                    className="px-6 py-4 flex justify-between items-start gap-4 hover:bg-[hsl(var(--secondary))]/50 cursor-pointer"
                    onClick={() => c.review && navigate(`${BASE}/${c.review.id}`)}>
                    <div className="min-w-0">
                      <p className="text-sm truncate">{c.comment_text}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                        {c.review?.review_code || 'Unknown review'}
                        {c.discipline ? ` · ${c.discipline}` : ''}
                      </p>
                    </div>
                    <SeverityBadge severity={c.severity} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                No critical or major comment is waiting on anybody.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PeerReviewShell>
  );
}
