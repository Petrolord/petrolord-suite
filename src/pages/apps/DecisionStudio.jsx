import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Landmark, FileDown, GitMerge, Package, BarChart3, ExternalLink } from 'lucide-react';
import { buildBriefModel, fmtMMUsd, fmtPct } from '@/components/decisionstudio/briefModel';
import { FullPrecisionProvider, FullPrecisionToggle, useFullPrecision } from '@/components/fullprecision/FullPrecision';
import { downloadBriefPdf } from '@/components/decisionstudio/briefPdf';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend as RLegend, ReferenceLine,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import DecisionStudioHelpGuide from '@/components/decisionstudio/DecisionStudioHelpGuide';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { AppHeader } from '@/components/ui/app-shell';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ChartPanel } from '@/components/ui/chart-panel';
import { NumericTable, NumTh, NumRow, RowLabel, NumCell } from '@/components/ui/numeric-table';

// Wave C (audit 3.8): overlaid NPV S-curves for the compared cases, one line
// per saved Monte Carlo run, from the persisted results.npv.cdf arrays.
const SCURVE_COLORS = ['#2563eb', '#059669', '#7c3aed', '#d97706'];

// Decision Studio (D5, docs/scope/Economics-ROADMAP.md): the executive
// layer over the decision chain. Pulls the user's saved artifacts from the
// constituent apps (EPE Monte Carlo runs, decision trees, portfolios),
// compares economics cases side by side, and exports a one-page decision
// brief where every number carries its provenance.

const Pick = ({ items, selectedId, onSelect, render, emptyText, actionLink, actionText }) => (
  <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
    {items.length === 0 && (
      <p className="text-xs text-pl-muted">
        {emptyText}{' '}
        {actionLink && <Link to={actionLink} className="text-pl-primary-text hover:text-pl-primary-text-hover hover:underline inline-flex items-center gap-1">{actionText} <ExternalLink className="w-3 h-3" /></Link>}
      </p>
    )}
    {items.map((item) => (
      <button
        key={item.id}
        type="button"
        onClick={() => onSelect(selectedId === item.id ? null : item.id)}
        aria-pressed={selectedId === item.id}
        className={`w-full text-left px-3 py-2 rounded border text-sm transition-colors ${
          selectedId === item.id
            ? 'border-pl-primary bg-pl-primary/10'
            : 'border-pl-border hover:bg-pl-sunken'
        }`}
      >
        {render(item)}
      </button>
    ))}
  </div>
);

const SectionCard = ({ icon: Icon, title, children }) => (
  <div className="bg-pl-surface border border-pl-border rounded-xl p-4 shadow-pl-sm">
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-pl-muted" aria-hidden="true" />
      <h2 className="text-sm font-semibold text-pl-text">{title}</h2>
    </div>
    {children}
  </div>
);

// userOverride: the /dev harness only (no auth session there)
const DecisionStudioInner = ({ userOverride = null }) => {
  const { full } = useFullPrecision();
  const { user: authUser } = useAuth();
  const user = userOverride || authUser;
  const { toast } = useToast();
  const [mcRuns, setMcRuns] = useState([]);
  const [treeProjects, setTreeProjects] = useState([]);
  const [portfolios, setPortfolios] = useState([]);
  const [portfolioProjects, setPortfolioProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const [mcRunId, setMcRunId] = useState(null);
  const [treeId, setTreeId] = useState(null);
  const [portfolioId, setPortfolioId] = useState(null);
  const [compareIds, setCompareIds] = useState(new Set());

  const [title, setTitle] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [mc, trees, pfs, pps] = await Promise.all([
        supabase.from('epe_mc_runs')
          .select('id, created_at, results, mc_config, epe_run_configs(config_name)')
          .order('created_at', { ascending: false }).limit(30),
        supabase.from('saved_decision_tree_projects')
          .select('id, project_name, inputs_data, created_at, updated_at')
          .order('updated_at', { ascending: false }).limit(30),
        supabase.from('portfolios').select('*').order('created_at', { ascending: false }).limit(30),
        supabase.from('portfolio_projects').select('*').order('created_at', { ascending: false }),
      ]);
      setMcRuns((mc.data || []).map((r) => ({ ...r, configName: r.epe_run_configs?.config_name })));
      setTreeProjects(trees.data || []);
      setPortfolios(pfs.data || []);
      setPortfolioProjects(pps.data || []);
      setLoading(false);
    })();
  }, [user]);

  const selectedMcRun = mcRuns.find((r) => r.id === mcRunId) || null;
  const selectedTree = treeProjects.find((t) => t.id === treeId) || null;
  const selectedPortfolio = portfolios.find((p) => p.id === portfolioId) || null;

  const compareRows = useMemo(
    () => mcRuns.filter((r) => compareIds.has(r.id)),
    [mcRuns, compareIds],
  );

  // round NPV ticks for the S-curves (T1: they read -5.1M, -1.6M, 1.9M)
  const scurveTicks = useMemo(() => {
    const xs = compareRows.flatMap((r) => (r.results?.npv?.cdf || []).map((p) => p.x)).filter(Number.isFinite);
    if (xs.length < 2) return undefined;
    const lo = Math.min(...xs); const hi = Math.max(...xs);
    const raw = (hi - lo) / 6;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw) || 10 * mag;
    const out = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t / step) * step);
    return out;
  }, [compareRows]);

  const toggleCompare = (id) => setCompareIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else if (next.size < 4) next.add(id);
    return next;
  });

  const exportBrief = async () => {
    if (!selectedMcRun && !selectedTree && !selectedPortfolio) {
      toast({ variant: 'destructive', title: 'Nothing selected', description: 'Pick at least one source for the brief.' });
      return;
    }
    setExporting(true);
    try {
      const model = buildBriefModel({
        title,
        recommendation,
        preparedBy: user?.email || '',
        mcRun: selectedMcRun,
        treeProject: selectedTree,
        portfolio: selectedPortfolio,
        portfolioProjects,
        full,
      });
      await downloadBriefPdf(model);
      toast({ title: 'Brief exported', description: 'One-page PDF downloaded with provenance on every figure.' });
    } catch (err) {
      console.error('[DecisionStudio]', err);
      toast({ variant: 'destructive', title: 'Export failed', description: err.message });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Decision Studio - Petrolord Suite</title>
        <meta name="description" content="Executive decision briefs built on validated economics, decision trees, and portfolio analysis." />
      </Helmet>
      <AppHeader
        title="Decision Studio"
        eyebrow="Economics"
        subtitle="Boardroom view of the decision chain: probabilistic economics, decision trees, and capital allocation, with provenance on every number."
        icon={Landmark}
        backTo="/dashboard/economics"
        actions={(
          <>
            <FullPrecisionToggle app="decision-studio" />
            <DecisionStudioHelpGuide />
          </>
        )}
      />
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 text-pl-text sm:px-6">
        {loading ? (
          <p className="text-pl-muted text-sm py-8">Loading your saved analyses...</p>
        ) : (
          <div className="space-y-6">
            {/* Evidence pickers */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <SectionCard icon={BarChart3} title="Economics (EPE Monte Carlo)">
                <Pick
                  items={mcRuns}
                  selectedId={mcRunId}
                  onSelect={setMcRunId}
                  emptyText="No saved Monte Carlo runs."
                  actionLink="/dashboard/apps/economics/epe/cases"
                  actionText="Run one in EPE"
                  render={(r) => (
                    <>
                      <span className="font-medium text-pl-text">{r.configName || 'EPE run'}</span>
                      <span className="block text-xs text-pl-muted">
                        P50 {fmtMMUsd(r.results?.npv?.p50)} · P(NPV&gt;0) {fmtPct(r.results?.probNpvPositive, 0)} · {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </>
                  )}
                />
              </SectionCard>

              <SectionCard icon={GitMerge} title="Decision (tree EMV)">
                <Pick
                  items={treeProjects}
                  selectedId={treeId}
                  onSelect={setTreeId}
                  emptyText="No saved decisions."
                  actionLink="/dashboard/apps/economics/decision-tree-builder"
                  actionText="Build one"
                  render={(t) => (
                    <>
                      <span className="font-medium text-pl-text">{t.project_name}</span>
                      <span className="block text-xs text-pl-muted">{new Date(t.updated_at || t.created_at).toLocaleString()}</span>
                    </>
                  )}
                />
              </SectionCard>

              <SectionCard icon={Package} title="Portfolio (capital allocation)">
                <Pick
                  items={portfolios}
                  selectedId={portfolioId}
                  onSelect={setPortfolioId}
                  emptyText="No saved portfolios."
                  actionLink="/dashboard/apps/economics/capital-portfolio-studio"
                  actionText="Create one"
                  render={(p) => (
                    <>
                      <span className="font-medium text-pl-text">{p.name}</span>
                      <span className="block text-xs text-pl-muted">CAPEX limit {p.capex_limit} $MM · optimized at brief time over {portfolioProjects.length} projects</span>
                    </>
                  )}
                />
              </SectionCard>
            </div>

            {/* Case comparison */}
            <SectionCard icon={BarChart3} title="Compare economics cases (pick up to 4)">
              <div className="flex flex-wrap gap-2 mb-3">
                {mcRuns.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleCompare(r.id)}
                    aria-pressed={compareIds.has(r.id)}
                    className={`px-2.5 py-1 rounded-full text-xs border ${
                      compareIds.has(r.id) ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : 'border-pl-border text-pl-text hover:bg-pl-sunken'
                    }`}
                  >
                    {r.configName || 'EPE run'} · {new Date(r.created_at).toLocaleDateString()}
                  </button>
                ))}
                {mcRuns.length === 0 && <p className="text-xs text-pl-muted">Saved Monte Carlo runs appear here for side by side comparison.</p>}
              </div>
              {compareRows.length >= 2 && (
                <NumericTable className="p-0 border-0" data-testid="ds-compare-table">
                  <thead>
                    <tr>
                      <NumTh sticky>Metric</NumTh>
                      {compareRows.map((r) => <NumTh key={r.id} numeric>{r.configName || 'EPE run'}</NumTh>)}
                    </tr>
                  </thead>
                  <tbody>
                    {/* The third entry is the raw number behind a money cell,
                        so a negative NPV reads in the danger text beside its
                        minus sign (the EPE money-table recipe). */}
                    {[
                      ['NPV P90 (low)', (r) => fmtMMUsd(r.results?.npv?.p90), (r) => r.results?.npv?.p90],
                      ['NPV P50', (r) => fmtMMUsd(r.results?.npv?.p50), (r) => r.results?.npv?.p50],
                      ['NPV P10 (high)', (r) => fmtMMUsd(r.results?.npv?.p10), (r) => r.results?.npv?.p10],
                      ['NPV mean', (r) => fmtMMUsd(r.results?.npv?.mean), (r) => r.results?.npv?.mean],
                      ['P(NPV positive)', (r) => fmtPct(r.results?.probNpvPositive)],
                      ['Deterministic base', (r) => fmtMMUsd(r.results?.base?.npv), (r) => r.results?.base?.npv],
                      ['Iterations / seed', (r) => `${r.results?.iterations} / ${r.results?.seed}`],
                    ].map(([label, fn, raw]) => (
                      <NumRow key={label}>
                        <RowLabel>{label}</RowLabel>
                        {compareRows.map((r) => (
                          <NumCell key={r.id} value={raw ? raw(r) : undefined} signed={Boolean(raw)}>{fn(r)}</NumCell>
                        ))}
                      </NumRow>
                    ))}
                  </tbody>
                </NumericTable>
              )}
              {compareRows.length >= 2 && compareRows.some((r) => (r.results?.npv?.cdf || []).length > 1) && (
                <ChartPanel className="mt-4" title="NPV S-curves">
                  <ChartFrame height={340} logoHeight={24} exportFilename="decision-studio-npv-scurves">
                    <ComposedChart margin={CHART_MARGINS.withLegend}>
                      <CartesianGrid {...GRID_STYLE} />
                      <XAxis
                        dataKey="x"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        ticks={scurveTicks}
                        tickFormatter={fmtMMUsd}
                        tick={{ fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText }}
                        stroke={CHART_COLORS.axisLine}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText }}
                        stroke={CHART_COLORS.axisLine}
                      />
                      <RTooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(v) => `${Number(v).toFixed(1)}%`}
                        labelFormatter={(v) => `NPV ${fmtMMUsd(v)}`}
                      />
                      <RLegend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText, paddingTop: 8 }} />
                      <ReferenceLine x={0} stroke="#dc2626" strokeDasharray="4 4"
                        label={{ value: 'NPV = 0', position: 'insideTopRight', fontSize: 10, fill: '#b91c1c' }} />
                      {compareRows.map((r, i) => (
                        (r.results?.npv?.cdf || []).length > 1 && (
                          <Line
                            key={r.id}
                            data={r.results.npv.cdf}
                            dataKey="y"
                            name={r.configName || 'EPE run'}
                            stroke={SCURVE_COLORS[i % SCURVE_COLORS.length]}
                            strokeWidth={2}
                            dot={false}
                            type="monotone"
                          />
                        )
                      ))}
                    </ComposedChart>
                  </ChartFrame>
                  <p className="text-[11px] text-pl-muted mt-1">
                    Cumulative probability that each case's NPV falls at or below a value. A curve further to the right is better; a steeper curve is more certain. Runs saved before the S-curve update may not appear.
                  </p>
                </ChartPanel>
              )}
            </SectionCard>

            {/* Brief builder */}
            <SectionCard icon={FileDown} title="Decision brief">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                <Label className="block space-y-1 text-xs">
                  <span>Brief title</span>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Investment decision brief"
                  />
                </Label>
                <Label className="block space-y-1 text-xs">
                  <span>Recommendation (one or two sentences)</span>
                  <Textarea
                    value={recommendation}
                    onChange={(e) => setRecommendation(e.target.value)}
                    rows={2}
                    placeholder="Proceed to FID subject to..."
                  />
                </Label>
              </div>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-xs text-pl-muted">
                  Includes: {[selectedMcRun && 'economics', selectedTree && 'decision', selectedPortfolio && 'portfolio'].filter(Boolean).join(', ') || 'nothing selected yet'}. Each section states its source run, timestamp, and assumptions.
                </p>
                <Button onClick={exportBrief} disabled={exporting}>
                  <FileDown className="w-4 h-4 mr-2" /> {exporting ? 'Building PDF...' : 'Export one-page brief (PDF)'}
                </Button>
              </div>
            </SectionCard>
          </div>
        )}
      </div>
    </>
  );
};

// W3 (D3): with Full precision on, the exported brief prints the decision
// analysis money (Optimal EMV, Next best alternative, Decision advantage) in
// $MM at 4 decimals.
const DecisionStudio = ({ userOverride = null }) => (
  <div className="min-h-screen" data-testid="ds-theme-scope">
    <FullPrecisionProvider>
      <DecisionStudioInner userOverride={userOverride} />
    </FullPrecisionProvider>
  </div>
);

export default DecisionStudio;
