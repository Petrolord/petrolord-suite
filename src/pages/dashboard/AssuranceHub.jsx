// Assurance & Compliance module hub (AS11).
//
// What this page was. It called itself "Unified reporting and real-time
// analytics" across eight apps. Three of its panels queried anything; the
// other five were literals shown to every organization as its own
// ("Active MOCs 12", "MOC-2026-042 Review", "Subsea Tie-back Installation
// QA"). The ninth app was not on it. It had no catalogue grid, so it was
// the one module hub from which you could not open an app by its tile.
//
// What it is now. The catalogue grid every hub carries (master_apps is
// the only list of apps), and above it the one view no single app can
// give: what needs someone across all nine, worst first. Every number is
// the owning app's own count, taken through src/lib/assuranceHub.js, and
// every route comes from there too. There is no module score.
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Download, RefreshCw } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ApplicationsGrid from '@/components/ApplicationsGrid';
import { HubHeader, HubPage, HubSearch, HubSectionTitle } from '@/components/hubs/HubChrome';
import AssuranceHelp from '@/components/assurance/AssuranceHelp';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_MARGINS, CHART_TYPOGRAPHY, GRID_STYLE, LEGEND_PROPS, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { exportToCSV } from '@/utils/exportUtils';
import { useToast } from '@/hooks/use-toast';
import { APP_STATE, useAssuranceHub } from '@/hooks/useAssuranceHub';
import {
  HUB_APPS,
  TIER,
  TIER_CHART_COLORS,
  TIER_ORDER,
  attentionByApp,
  attentionItems,
  moduleHeadline,
  summariseModule,
} from '@/lib/assuranceHub';
import { toDateOnlyString } from '@/lib/managementOfChange';

const MODULE_FILTER = 'assurance';
const LIST_LIMIT = 25;

/**
 * Which of each app's own summary fields its panel shows. Selection
 * only: every value is a field the app's summarise() already returns.
 */
const PANEL_METRICS = {
  risk: (s) => [
    ['Live risks', s.live],
    ['Residual Critical', s.byResidualBand.Critical, 'bad'],
    ['Above appetite', s.aboveAppetite, 'warn'],
    ['Reviews overdue', s.reviewsOverdue, 'warn'],
  ],
  regulatory: (s) => [
    ['Obligations', s.total],
    ['Expired', s.byStatus.Expired, 'bad'],
    ['Overdue', s.byStatus.Overdue, 'bad'],
    ['Due soon', s.byStatus['Due soon'], 'warn'],
  ],
  documents: (s) => [
    ['Documents', s.total],
    ['Published', s.published],
    ['In review', s.inReview],
    ['Reviews overdue', s.overdue, 'warn'],
  ],
  peerReview: (s) => [
    ['Active reviews', s.active],
    ['Overdue', s.overdue, 'warn'],
    ['Open comments', s.openComments],
    ['Blocking comments', s.blockingComments, 'warn'],
  ],
  moc: (s) => [
    ['Active changes', s.active],
    ['Awaiting approval', s.awaitingApproval],
    ['Expired temporary', s.expired, 'bad'],
    ['Overdue actions', s.overdueActions, 'warn'],
  ],
  quality: (s) => [
    ['Active plans', s.activePlans],
    ['Hold points open', s.holdPointsOutstanding],
    ['Open NCRs', s.openNcrs, 'warn'],
    ['Critical/Major NCRs', s.seriousOpen, 'bad'],
  ],
  iso: (s) => [
    ['Applicable clauses', s.applicable],
    ['Claims without evidence', s.unevidencedClaims, 'warn'],
    ['Never audited', s.clausesNeverAudited, 'warn'],
    ['Open major NCs', s.openMajor, 'bad'],
  ],
  lessons: (s) => [
    ['Published', s.visible],
    ['Awaiting validation', s.awaitingValidation],
    ['Never applied', s.lessonsUnapplied, 'warn'],
    ['Reviews overdue', s.reviewsOverdue, 'warn'],
  ],
  audits: (s) => [
    ['Audits outstanding', s.auditsOutstanding],
    ['Audits overdue', s.auditsOverdue, 'warn'],
    ['Open findings', s.openFindings],
    ['Stop-work open', s.stopWorkOpen, 'bad'],
  ],
};

// Status roles only (design system): a count that is a problem reads in
// the danger or warning text colour, everything else in body text.
const TONE = {
  bad: 'text-pl-danger-text',
  warn: 'text-pl-warning-text',
};

const toneFor = (value, tone) => (value > 0 && tone ? TONE[tone] : 'text-pl-text');

// The three tiers are status, so they use the status badge variants.
const TIER_BADGE = {
  [TIER.EXPOSED]: 'danger',
  [TIER.OVERDUE]: 'warning',
  [TIER.DUE_SOON]: 'info',
};

const SELECT_CLASS = 'h-9 rounded-md border border-pl-border-strong bg-pl-surface px-2 text-sm text-pl-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus';

const axisTick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

function TierBadge({ tier }) {
  return (
    <Badge variant={TIER_BADGE[tier]} className="whitespace-nowrap text-[11px] font-medium">
      {tier}
    </Badge>
  );
}

function lateLabel(days) {
  if (days === null || days === undefined) return '';
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} late`;
  if (days === 0) return 'due today';
  return `due in ${-days} day${days === -1 ? '' : 's'}`;
}

export default function AssuranceHub() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [appFilter, setAppFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const [showAll, setShowAll] = useState(false);
  const {
    data, states, messages, loading, refresh, lastUpdated, orgId,
  } = useAssuranceHub();

  const today = useMemo(() => new Date(), [lastUpdated]); // eslint-disable-line react-hooks/exhaustive-deps
  const summaries = useMemo(() => summariseModule(data, today), [data, today]);
  const items = useMemo(() => attentionItems(data, today), [data, today]);
  const byApp = useMemo(() => attentionByApp(items), [items]);
  const availability = useMemo(() => Object.fromEntries(
    HUB_APPS.map((a) => [a.key, states[a.key] === APP_STATE.OK]),
  ), [states]);
  const headline = useMemo(() => moduleHeadline(items, availability), [items, availability]);

  const filtered = useMemo(() => items.filter((i) => (
    (appFilter === 'all' || i.app === appFilter)
    && (tierFilter === 'all' || i.tier === tierFilter)
  )), [items, appFilter, tierFilter]);
  const shown = showAll ? filtered : filtered.slice(0, LIST_LIMIT);

  const unavailable = HUB_APPS.filter((a) => states[a.key] === APP_STATE.UNAVAILABLE);
  const failed = HUB_APPS.filter((a) => states[a.key] === APP_STATE.ERROR);
  const chartData = byApp.filter((r) => r.total > 0);

  const handleExport = () => {
    const rows = filtered.map((i) => ({
      tier: i.tier,
      app: i.appName,
      code: i.code || '',
      title: i.title || '',
      reason: i.reason,
      days_late: i.daysLate ?? '',
    }));
    if (!exportToCSV(rows, `assurance_attention_${toDateOnlyString(new Date())}`)) {
      toast({ title: 'Nothing to export', description: 'The list is empty.' });
    }
  };

  return (
    <HubPage>
      <HubHeader
        title="Assurance & Compliance"
        description={(
          <>What needs someone across the nine Assurance apps, counted from your
          organization&apos;s own records. Each count is the owning app&apos;s own, so
          the hub and the app always agree.</>
        )}
        actions={(
          <>
            <AssuranceHelp appKey="hub" />
            {lastUpdated ? (
              <span className="text-xs text-pl-muted">
                Read at {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : null}
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
            </Button>
          </>
        )}
      />

      {!orgId && !loading ? (
        <p className="text-pl-muted">
          Your account is not attached to an organization, so there are no records to read.
        </p>
      ) : null}

      {/* Headline: counts, never a score */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          [TIER.EXPOSED, headline.exposed, 'Exposure that exists today'],
          [TIER.OVERDUE, headline.overdue, 'A control past its own date'],
          [TIER.DUE_SOON, headline.dueSoon, "Inside the owning app's lead window"],
        ].map(([tier, count, hint]) => (
          <button key={tier} type="button"
            aria-pressed={tierFilter === tier}
            onClick={() => setTierFilter(tierFilter === tier ? 'all' : tier)}
            className={`text-left p-4 rounded-xl border bg-pl-surface shadow-pl-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus ${
              tierFilter === tier ? 'border-pl-primary ring-1 ring-pl-primary' : 'border-pl-border hover:border-pl-border-strong'}`}>
            <TierBadge tier={tier} />
            <p className="text-3xl font-semibold mt-3 font-pl-mono tabular-nums text-pl-text">{loading ? '–' : count}</p>
            <p className="text-xs text-pl-muted mt-1">{hint}</p>
          </button>
        ))}
        <div className="p-4 rounded-xl border border-pl-border bg-pl-surface shadow-pl-sm">
          <span className="text-[11px] uppercase tracking-wide text-pl-muted">Apps reporting</span>
          <p className="text-3xl font-semibold mt-3 font-pl-mono tabular-nums text-pl-text">
            {loading ? '–' : `${headline.appsReporting} of ${HUB_APPS.length}`}
          </p>
          <p className="text-xs text-pl-muted mt-1">
            An app that cannot be read is named below and is not counted as zero
          </p>
        </div>
      </div>

      {unavailable.length || failed.length ? (
        <div className="p-4 rounded-xl border border-pl-warning/40 bg-pl-warning-bg text-sm space-y-2" role="status">
          <div className="flex items-center gap-2 font-medium text-pl-warning-text">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" /> Some apps are not included in these counts
          </div>
          {unavailable.length ? (
            <p className="text-pl-text">
              Not set up in this environment yet: {unavailable.map((a) => a.name).join(', ')}.
              Their records cannot be read until their database update is applied.
            </p>
          ) : null}
          {failed.map((a) => (
            <p key={a.key} className="text-pl-text">
              {a.name} could not be read: {messages[a.key]}
            </p>
          ))}
        </div>
      ) : null}

      {/* The attention list */}
      <Card>
        <CardHeader className="border-b border-pl-border pb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Needs attention</CardTitle>
            <p className="text-sm text-pl-muted mt-1">
              Worst first: exposure before lateness, then the longest overdue.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Filter by app" value={appFilter}
              onChange={(e) => setAppFilter(e.target.value)}
              className={SELECT_CLASS}>
              <option value="all">All apps</option>
              {HUB_APPS.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
            </select>
            <select aria-label="Filter by tier" value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className={SELECT_CLASS}>
              <option value="all">All tiers</option>
              {TIER_ORDER.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={handleExport} disabled={!filtered.length}>
              <Download className="w-4 h-4 mr-2" aria-hidden="true" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-8 text-center text-pl-muted" role="status">Reading the nine apps...</p>
          ) : filtered.length === 0 ? (
            <p className="p-8 text-center text-pl-muted">
              {items.length === 0
                ? 'Nothing in the apps that report is exposed, overdue or due soon.'
                : 'Nothing matches this filter.'}
            </p>
          ) : (
            <ul className="divide-y divide-pl-border">
              {shown.map((i) => (
                <li key={`${i.app}-${i.id}-${i.reason}`}>
                  <button type="button" onClick={() => navigate(i.href)}
                    className="w-full text-left px-5 py-3 hover:bg-pl-sunken focus-visible:outline-none focus-visible:bg-pl-sunken focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pl-focus flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                    <TierBadge tier={i.tier} />
                    <span className="text-xs text-pl-muted md:w-44 shrink-0">{i.appName}</span>
                    <span className="flex-1 min-w-0">
                      <span className="font-pl-mono text-xs text-pl-muted mr-2">{i.code}</span>
                      <span className="text-sm text-pl-text">{i.title || 'Untitled'}</span>
                      <span className="block text-xs text-pl-muted">{i.reason}</span>
                    </span>
                    <span className="text-xs text-pl-muted whitespace-nowrap">{lateLabel(i.daysLate)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && filtered.length > LIST_LIMIT ? (
            <div className="p-3 border-t border-pl-border text-center">
              <Button size="sm" variant="ghost" onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Show fewer' : `Show all ${filtered.length}`}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* The one module-wide chart */}
      <Card>
        <CardHeader className="border-b border-pl-border pb-4">
          <CardTitle className="text-lg">Attention by app</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {chartData.length === 0 ? (
            <p className="py-12 text-center text-pl-muted">
              {loading ? 'Reading the nine apps...' : 'Nothing to chart: no item needs attention.'}
            </p>
          ) : (
            <div data-canvas="chart" className="relative h-[320px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={CHART_MARGINS.withLegend}>
                  <CartesianGrid {...GRID_STYLE} vertical={false} />
                  <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={axisTick}
                    interval={0} angle={-15} textAnchor="end" height={70} />
                  <YAxis allowDecimals={false} stroke={CHART_COLORS.axisLine} tick={axisTick} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                  <Legend {...LEGEND_PROPS} />
                  {TIER_ORDER.map((t) => (
                    <Bar key={t} dataKey={t} stackId="tier" fill={TIER_CHART_COLORS[t]} barSize={34} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              <ChartLogo />
            </div>
          )}
        </CardContent>
      </Card>

      {/* One panel per app, each from the app's own summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {HUB_APPS.map((a) => {
          const s = summaries[a.key];
          const state = states[a.key];
          return (
            <Card key={a.key} className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{a.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                {loading ? (
                  <p className="text-sm text-pl-muted">Reading...</p>
                ) : s ? (
                  <div className="grid grid-cols-2 gap-3">
                    {PANEL_METRICS[a.key](s).map(([label, value, tone]) => (
                      <div key={label}>
                        <p className="text-[11px] uppercase tracking-wide text-pl-muted">{label}</p>
                        <p className={`text-xl font-semibold font-pl-mono tabular-nums ${toneFor(value, tone)}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-pl-muted">
                    {state === APP_STATE.UNAVAILABLE
                      ? 'Not set up in this environment yet.'
                      : `Could not be read${messages[a.key] ? `: ${messages[a.key]}` : '.'}`}
                  </p>
                )}
                <div className="mt-auto pt-4">
                  <Button size="sm" variant="ghost" onClick={() => navigate(a.base)}
                    className="px-2 -ml-2 text-pl-primary-text hover:text-pl-primary-text-hover">
                    Open {a.name} <ArrowRight className="w-4 h-4 ml-1" aria-hidden="true" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* The catalogue: the only list of apps */}
      <section className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <HubSectionTitle>All Applications</HubSectionTitle>
          <HubSearch value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <ApplicationsGrid moduleFilter={MODULE_FILTER} searchQuery={searchTerm} />
      </section>
    </HubPage>
  );
}
