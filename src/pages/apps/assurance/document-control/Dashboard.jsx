import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Clock, FileText, Plus } from 'lucide-react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { format, formatDistanceToNow } from 'date-fns';
import { CHART_COLORS, LEGEND_PROPS, TOOLTIP_STYLE } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  DOC_STATUSES,
  STATUS_CHART_COLORS,
  byReviewUrgency,
  parseDateOnly,
  reviewState,
  REVIEW,
  summarise,
} from '@/lib/documentControl';
import { DocControlShell, BASE } from './components/DocControlShell';
import { ReviewBadge, StatusBadge } from './components/StatusBadge';
import { EmptyState, ErrorState, Loading, SchemaNotice } from './components/SharedComponents';
import { useDocumentControl } from './hooks/useDocumentControl';

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
 * AS4 — the document control dashboard.
 *
 * Four panels, and not one of them described this organization.
 *
 * The tiles came from `getDashboardStats()`, which returned
 * 1245 / 28 / 982 / 14 whenever the query failed OR the library was
 * empty, and which, on the SUCCESS path, still reported `overdue: 1`
 * because the line read `overdue: 1 // Mock overdue`. So the single
 * number this app exists to produce was a literal.
 *
 * "Pending Approvals" came from `getApprovals()`, which never queried
 * anything: two hardcoded rows for "Chemical Handling Safety Policy"
 * and "Subsea Manifold Schematic V2", due in March 2024.
 *
 * "Recent Activity" came from `getActivityLog()`, which never queried
 * anything either: four rows reading "2 hours ago", "4 hours ago",
 * "1 day ago" and "2 days ago", forever, for everyone.
 *
 * The status doughnut came from `getReportData()`, also hardcoded:
 * 65 / 15 / 10 / 10.
 *
 * `doc_workflows` and `doc_activity_log` existed the whole time.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const {
    documents, approvals, activity, loading, error, hasAs4Schema, refresh,
  } = useDocumentControl();

  const today = new Date();
  const summary = useMemo(() => summarise(documents, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [documents]);

  const statusData = useMemo(
    () => DOC_STATUSES
      .map((name) => ({ name, value: summary.byStatus[name] }))
      .filter((d) => d.value > 0),
    [summary],
  );

  const reviewQueue = useMemo(
    () => documents
      .filter((d) => [REVIEW.OVERDUE, REVIEW.DUE_SOON].includes(reviewState(d, today)))
      .sort(byReviewUrgency(today))
      .slice(0, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [documents],
  );

  const pending = useMemo(
    () => approvals.filter((a) => a.status === 'Pending').slice(0, 5),
    [approvals],
  );

  if (loading) return <DocControlShell><Loading label="Loading the document library..." /></DocControlShell>;
  if (error) return <DocControlShell><ErrorState error={error} onRetry={refresh} /></DocControlShell>;

  if (documents.length === 0) {
    return (
      <DocControlShell>
        {!hasAs4Schema ? <SchemaNotice /> : null}
        <EmptyState
          icon={<FileText className="w-12 h-12" />}
          title="This organization has no controlled documents yet"
          description="Nothing is shown here until there is something real to show. Register a document and its revisions, reviews and approvals will appear."
          action={<Button onClick={() => navigate(`${BASE}/new`)}><Plus className="w-4 h-4 mr-2" /> Register a document</Button>}
        />
      </DocControlShell>
    );
  }

  return (
    <DocControlShell>
      <div className="space-y-6 animate-in fade-in duration-500">
        {!hasAs4Schema ? <SchemaNotice /> : null}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Tile label="Controlled documents" value={summary.total}
            icon={<FileText className="w-6 h-6" />} tone="--primary"
            onClick={() => navigate(`${BASE}/library`)} />
          <Tile label="In review" value={summary.inReview}
            icon={<Clock className="w-6 h-6" />} tone="--warning"
            onClick={() => navigate(`${BASE}/approvals`)} />
          <Tile label="Published" value={summary.published}
            icon={<CheckCircle className="w-6 h-6" />} tone="--success"
            onClick={() => navigate(`${BASE}/library`)} />
          <Tile label="Reviews overdue" value={summary.overdue}
            icon={<AlertTriangle className="w-6 h-6" />} tone="--destructive"
            onClick={() => navigate(`${BASE}/library`)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="panel-elevation">
            <CardHeader><CardTitle className="text-lg">The library by status</CardTitle></CardHeader>
            <CardContent>
              <div className="relative h-[300px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="45%" innerRadius={60} outerRadius={90}
                      paddingAngle={2} dataKey="value" nameKey="name">
                      {statusData.map((d) => <Cell key={d.name} fill={STATUS_CHART_COLORS[d.name]} />)}
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
              <CardTitle className="text-lg">Reviews due</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate(`${BASE}/library`)}>View library</Button>
            </CardHeader>
            <CardContent className="p-0">
              {reviewQueue.length ? (
                <ul className="divide-y divide-[hsl(var(--border))]">
                  {reviewQueue.map((d) => (
                    <li key={d.id}
                      className="px-6 py-4 flex justify-between items-center gap-4 hover:bg-[hsl(var(--secondary))]/50 cursor-pointer"
                      onClick={() => navigate(`${BASE}/${d.id}`)}>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{d.title}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] font-mono">{d.document_number}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <ReviewBadge document={d} today={today} />
                        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{showDate(d.next_review_date)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                  No document in force is overdue or inside its review window.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="panel-elevation">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Waiting on a reviewer</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate(`${BASE}/approvals`)}>All approvals</Button>
            </CardHeader>
            <CardContent className="p-0">
              {pending.length ? (
                <ul className="divide-y divide-[hsl(var(--border))]">
                  {pending.map((a) => (
                    <li key={a.id} className="px-6 py-4 flex justify-between items-center gap-4">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{a.document.title}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          {a.document.document_number} rev {a.revision?.revision_number} · {a.role}
                        </p>
                      </div>
                      <StatusBadge status={a.document.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                  No revision is waiting on a reviewer.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="panel-elevation">
            <CardHeader><CardTitle className="text-lg">Recent activity</CardTitle></CardHeader>
            <CardContent className="p-4">
              {activity.length ? (
                <ul className="space-y-3">
                  {activity.slice(0, 6).map((a) => (
                    <li key={a.id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-[hsl(var(--secondary))] flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm truncate">{a.action}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                          {a.created_at
                            ? `${formatDistanceToNow(new Date(a.created_at))} ago`
                            : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[hsl(var(--muted-foreground))] py-6 text-center">
                  Nothing has happened to these documents yet. Registrations,
                  revisions and review decisions appear here as they are made.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DocControlShell>
  );
}
