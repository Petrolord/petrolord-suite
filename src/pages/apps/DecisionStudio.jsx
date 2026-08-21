import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { ArrowLeft, Landmark, FileDown, GitMerge, Package, BarChart3, ExternalLink } from 'lucide-react';
import { buildBriefModel, fmtMMUsd } from '@/components/decisionstudio/briefModel';
import { downloadBriefPdf } from '@/components/decisionstudio/briefPdf';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend as RLegend, ReferenceLine,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';

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
      <p className="text-xs text-slate-400">
        {emptyText}{' '}
        {actionLink && <Link to={actionLink} className="text-sky-300 hover:text-sky-200 inline-flex items-center gap-1">{actionText} <ExternalLink className="w-3 h-3" /></Link>}
      </p>
    )}
    {items.map((item) => (
      <button
        key={item.id}
        type="button"
        onClick={() => onSelect(selectedId === item.id ? null : item.id)}
        className={`w-full text-left px-3 py-2 rounded border text-sm transition-colors ${
          selectedId === item.id
            ? 'border-lime-400/60 bg-lime-500/10'
            : 'border-white/10 hover:bg-white/5'
        }`}
      >
        {render(item)}
      </button>
    ))}
  </div>
);

const SectionCard = ({ icon: Icon, title, children }) => (
  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-lime-300" />
      <h2 className="text-sm font-semibold text-white">{title}</h2>
    </div>
    {children}
  </div>
);

const DecisionStudio = () => {
  const { user } = useAuth();
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
      <div className="p-4 md:p-6 min-h-screen bg-slate-950 text-white">
        <div className="mb-5 border-b border-slate-800 pb-4">
          <Link to="/dashboard/economics">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white pl-0 mb-2">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </Link>
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-2 rounded-xl shadow-lg">
              <Landmark className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Decision Studio</h1>
              <p className="text-slate-400 text-xs">Boardroom view of the decision chain: probabilistic economics, decision trees, and capital allocation, with provenance on every number.</p>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-slate-300 text-sm py-8">Loading your saved analyses...</p>
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
                      <span className="text-sky-300">{r.configName || 'EPE run'}</span>
                      <span className="block text-xs text-slate-400">
                        P50 {fmtMMUsd(r.results?.npv?.p50)} · P(NPV&gt;0) {(r.results?.probNpvPositive * 100).toFixed(0)}% · {new Date(r.created_at).toLocaleDateString()}
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
                      <span className="text-sky-300">{t.project_name}</span>
                      <span className="block text-xs text-slate-400">{new Date(t.updated_at || t.created_at).toLocaleString()}</span>
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
                      <span className="text-sky-300">{p.name}</span>
                      <span className="block text-xs text-slate-400">CAPEX limit {p.capex_limit} $MM · optimized at brief time over {portfolioProjects.length} projects</span>
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
                    className={`px-2.5 py-1 rounded-full text-xs border ${
                      compareIds.has(r.id) ? 'border-lime-400/70 bg-lime-500/15 text-lime-200' : 'border-white/15 text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    {r.configName || 'EPE run'} · {new Date(r.created_at).toLocaleDateString()}
                  </button>
                ))}
                {mcRuns.length === 0 && <p className="text-xs text-slate-400">Saved Monte Carlo runs appear here for side by side comparison.</p>}
              </div>
              {compareRows.length >= 2 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-white/10">
                        <th className="py-1.5 pr-4">Metric</th>
                        {compareRows.map((r) => <th key={r.id} className="py-1.5 pr-4">{r.configName || 'EPE run'}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['NPV P90 (low)', (r) => fmtMMUsd(r.results?.npv?.p90)],
                        ['NPV P50', (r) => fmtMMUsd(r.results?.npv?.p50)],
                        ['NPV P10 (high)', (r) => fmtMMUsd(r.results?.npv?.p10)],
                        ['NPV mean', (r) => fmtMMUsd(r.results?.npv?.mean)],
                        ['P(NPV positive)', (r) => `${(r.results?.probNpvPositive * 100).toFixed(1)}%`],
                        ['Deterministic base', (r) => fmtMMUsd(r.results?.base?.npv)],
                        ['Iterations / seed', (r) => `${r.results?.iterations} / ${r.results?.seed}`],
                      ].map(([label, fn]) => (
                        <tr key={label} className="border-b border-white/5">
                          <td className="py-1.5 pr-4 text-slate-300">{label}</td>
                          {compareRows.map((r) => <td key={r.id} className="py-1.5 pr-4 font-medium text-white">{fn(r)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {compareRows.length >= 2 && compareRows.some((r) => (r.results?.npv?.cdf || []).length > 1) && (
                <div className="mt-4">
                  <h4 className="text-sm font-semibold text-white mb-2">NPV S-curves</h4>
                  <ChartFrame height={340} logoHeight={24} exportFilename="decision-studio-npv-scurves">
                    <ComposedChart margin={CHART_MARGINS.withLegend}>
                      <CartesianGrid {...GRID_STYLE} />
                      <XAxis
                        dataKey="x"
                        type="number"
                        domain={['dataMin', 'dataMax']}
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
                      <ReferenceLine x={0} stroke="#dc2626" strokeDasharray="4 4" />
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
                  <p className="text-[11px] text-slate-400 mt-1">
                    Cumulative probability that each case's NPV falls at or below a value. A curve further to the right is better; a steeper curve is more certain. Runs saved before the S-curve update may not appear.
                  </p>
                </div>
              )}
            </SectionCard>

            {/* Brief builder */}
            <SectionCard icon={FileDown} title="Decision brief">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                <label className="text-xs text-slate-300">
                  Brief title
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Investment decision brief"
                    className="mt-1 w-full px-3 py-2 rounded bg-slate-800 border border-slate-600 text-white text-sm"
                  />
                </label>
                <label className="text-xs text-slate-300">
                  Recommendation (one or two sentences)
                  <textarea
                    value={recommendation}
                    onChange={(e) => setRecommendation(e.target.value)}
                    rows={2}
                    placeholder="Proceed to FID subject to..."
                    className="mt-1 w-full px-3 py-2 rounded bg-slate-800 border border-slate-600 text-white text-sm"
                  />
                </label>
              </div>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-xs text-slate-400">
                  Includes: {[selectedMcRun && 'economics', selectedTree && 'decision', selectedPortfolio && 'portfolio'].filter(Boolean).join(', ') || 'nothing selected yet'}. Each section states its source run, timestamp, and assumptions.
                </p>
                <Button onClick={exportBrief} disabled={exporting} className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white">
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

export default DecisionStudio;
