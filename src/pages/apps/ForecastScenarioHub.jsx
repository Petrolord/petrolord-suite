import React, { useMemo, useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import {
  GitBranch, Plus, Copy, Trash2, Save, FolderOpen, Download, Info, HelpCircle,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { AppHeader } from '@/components/ui/app-shell';
import { ChartPanel } from '@/components/ui/chart-panel';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS,
} from '@/utils/chartTheme';
import { compareCases, sampleScenarioCases, EUR_MAX_YEARS, DAYS_PER_YEAR } from '@/utils/forecastScenarioCalculations';
import { supabase } from '@/lib/customSupabaseClient';

// R5 (Reservoir-ROADMAP.md): the reservoir-side forecast scenario
// comparator. Production forecasting lives HERE (multi-case Arps via
// the shared DCA engine); real fiscal valuation lives in the
// Economics module's NPV Scenario Builder — the per-case economics
// shown here are indicative ranking numbers only, and the annual
// profile export is the handoff.

const TABLE = 'saved_scenario_hub_projects';
const CASE_COLORS = ['#059669', '#2563eb', '#d97706', '#db2777', '#7c3aed', '#0891b2'];

const numOr = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const CaseCard = ({ c, color, onChange, onDuplicate, onDelete, deletable }) => (
  <Card>
    <CardContent className="p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
        <Input value={c.name} onChange={(e) => onChange({ name: e.target.value })}
          className="h-7 text-sm font-medium" />
        <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-text" title="Duplicate case" onClick={onDuplicate}>
          <Copy size={13} />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-danger-text" title="Delete case"
          onClick={onDelete} disabled={!deletable}>
          <Trash2 size={13} />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          ['qi', 'qi (bbl/d)'],
          ['declineAnnualPct', 'Decline (%/yr)'],
          ['b', 'b factor'],
          ['years', 'Horizon (yr)'],
          ['economicLimit', 'Econ limit (bbl/d)'],
        ].map(([key, label]) => (
          <div key={key} className="space-y-0.5">
            <Label className="text-[10px] text-pl-muted">{label}</Label>
            <Input type="number" step="any" value={c[key]}
              onChange={(e) => onChange({ [key]: numOr(e.target.value) })}
              className="h-7 text-xs" />
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

function ForecastScenarioHubContent() {
  const { toast } = useToast();
  const sample = useMemo(() => sampleScenarioCases(), []);
  const [cases, setCases] = useState(sample.cases);
  const [econ, setEcon] = useState(sample.econ);
  const [projects, setProjects] = useState([]);
  const [loadOpen, setLoadOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const { summaries } = useMemo(() => compareCases(cases, econ), [cases, econ]);
  const valid = summaries.filter((s) => !s.error);

  // Merge the monthly rate series into one dataset on a years axis, keyed
  // by case id so two cases with the same name keep their own lines.
  const chartData = useMemo(() => {
    const byDay = new Map();
    valid.forEach((s) => {
      s.monthly.forEach((pt) => {
        const row = byDay.get(pt.day) || { years: pt.day / DAYS_PER_YEAR };
        row[s.id] = pt.rate;
        byDay.set(pt.day, row);
      });
    });
    return [...byDay.values()].sort((a, b) => a.years - b.years);
  }, [valid]);
  const maxYears = Math.max(1, ...valid.map((s) => Math.ceil(s.monthly.length ? s.monthly[s.monthly.length - 1].day / DAYS_PER_YEAR : 1)));
  const yearTicks = useMemo(() => {
    const step = maxYears <= 10 ? 1 : maxYears <= 25 ? 2 : 5;
    const out = [];
    for (let y = 0; y <= maxYears; y += step) out.push(y);
    return out;
  }, [maxYears]);

  const refreshProjects = async () => {
    const { data, error } = await supabase.from(TABLE)
      .select('id, project_name, updated_at').order('updated_at', { ascending: false });
    if (!error) setProjects(data || []);
  };
  useEffect(() => { refreshProjects(); }, []);

  const saveProject = async () => {
    const name = saveName.trim();
    if (!name) return;
    const { data: userData } = await supabase.auth.getUser();
    // Saving under an existing name updates that set instead of adding a twin (FSH-T1-004)
    const existing = projects.find((p) => p.project_name === name);
    const payload = { inputs_data: { cases, econ }, updated_at: new Date().toISOString() };
    const { error } = existing
      ? await supabase.from(TABLE).update(payload).eq('id', existing.id)
      : await supabase.from(TABLE).insert([{ user_id: userData?.user?.id, project_name: name, ...payload }]);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: existing ? 'Scenario set updated' : 'Scenario set saved', description: name });
      setSaveName('');
      refreshProjects();
    }
  };

  const loadProject = async (id) => {
    const { data, error } = await supabase.from(TABLE).select('inputs_data').eq('id', id).maybeSingle();
    if (error || !data) {
      toast({ title: 'Load failed', description: error?.message, variant: 'destructive' });
      return;
    }
    setCases(data.inputs_data.cases || sample.cases);
    setEcon(data.inputs_data.econ || sample.econ);
    setLoadOpen(false);
    toast({ title: 'Scenario set loaded' });
  };

  // Delete asks for a second click on the same set (FSH-T1-004)
  const deleteProject = async (id) => {
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    setConfirmDelete(null);
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (!error) refreshProjects();
  };

  const updateCase = (id, patch) => setCases((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const addCase = () => setCases((cs) => [...cs, {
    id: `c${Date.now()}`, name: `Case ${cs.length + 1}`, qi: 1000, declineAnnualPct: 18, b: 0.5, years: 20, economicLimit: 30,
  }]);
  const duplicateCase = (c) => setCases((cs) => [...cs, { ...c, id: `c${Date.now()}`, name: `${c.name} (copy)` }]);
  const removeCase = (id) => setCases((cs) => cs.filter((c) => c.id !== id));

  const exportAnnualCsv = (s) => {
    const rows = [['year', 'production_bbl'], ...s.annual.map((v, i) => [i + 1, Math.round(v)])];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${s.name.replace(/\W+/g, '_')}_annual_profile.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Annual profile exported', description: 'Feed it to NPV Scenario Builder for full fiscal modeling.' });
  };

  return (
    <>
      <Helmet>
        <title>Forecast Scenario Hub - Petrolord Suite</title>
        <meta name="description" content="Compare multi-case Arps production forecast scenarios side by side." />
      </Helmet>
      <AppHeader
        backTo="/dashboard/reservoir"
        backLabel="Back to Reservoir Management"
        icon={GitBranch}
        title="Forecast Scenario Hub"
        subtitle="Multi-case Arps production forecasting, compared side by side"
        actions={(
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard/apps/reservoir/forecast-scenario-hub/help">
              <HelpCircle className="w-4 h-4 mr-2" /> Help guide
            </Link>
          </Button>
        )}
      />
      <div className="p-4 md:p-8 flex flex-col">
        <div className="flex flex-col xl:flex-row gap-6 flex-grow min-h-0">
          {/* Cases + economics */}
          <div className="xl:w-96 shrink-0 space-y-3">
            <div className="flex gap-2">
              <Button size="sm" onClick={addCase} className="h-8">
                <Plus size={14} className="mr-1" /> Add case
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setLoadOpen(true)}>
                <FolderOpen size={14} className="mr-1" /> Load
              </Button>
            </div>
            {cases.map((c, i) => (
              <CaseCard key={c.id} c={c} color={CASE_COLORS[i % CASE_COLORS.length]}
                onChange={(patch) => updateCase(c.id, patch)}
                onDuplicate={() => duplicateCase(c)}
                onDelete={() => removeCase(c.id)}
                deletable={cases.length > 1} />
            ))}

            <Card>
              <CardHeader className="py-2 px-3"><CardTitle className="text-pl-muted text-xs uppercase tracking-wider">Indicative economics</CardTitle></CardHeader>
              <CardContent className="p-3 pt-0 grid grid-cols-3 gap-2">
                {[
                  ['pricePerBbl', 'Price ($/bbl)'],
                  ['opexPerBbl', 'Opex ($/bbl)'],
                  ['discountRatePct', 'Discount (%)'],
                ].map(([key, label]) => (
                  <div key={key} className="space-y-0.5">
                    <Label className="text-[10px] text-pl-muted">{label}</Label>
                    <Input type="number" step="any" value={econ[key]}
                      onChange={(e) => setEcon((p) => ({ ...p, [key]: numOr(e.target.value) }))}
                      className="h-7 text-xs" />
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Input placeholder="Save scenario set as..." value={saveName} onChange={(e) => setSaveName(e.target.value)}
                className="h-8 text-xs" />
              <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={saveProject} aria-label="Save scenario set" title="Save scenario set" disabled={!saveName.trim()}>
                <Save size={14} />
              </Button>
            </div>
          </div>

          {/* Comparison */}
          <div className="flex-1 min-w-0 space-y-4">
            <ChartPanel title="Rate profiles">
                  <ChartFrame height={320}>
                    <LineChart data={chartData} margin={CHART_MARGINS.legend}>
                      <CartesianGrid {...GRID_STYLE} />
                      <XAxis dataKey="years" type="number" domain={[0, maxYears]} ticks={yearTicks} allowDecimals={false}
                        tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} stroke={CHART_COLORS.axisLine}
                        label={{ value: 'Years from forecast start', position: 'insideBottom', offset: -2, style: { fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize } }} />
                      <YAxis tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} stroke={CHART_COLORS.axisLine}
                        label={{ value: 'Rate (bbl/d)', angle: -90, position: 'insideLeft', style: { fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize } }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => (typeof v === 'number' ? `${v.toFixed(0)} bbl/d` : v)}
                        labelFormatter={(y) => `Year ${Number(y).toFixed(1)}`} />
                      <Legend {...LEGEND_PROPS} />
                      {valid.map((s, i) => (
                        <Line key={s.id} type="monotone" dataKey={s.id} name={s.name} stroke={CASE_COLORS[summaries.indexOf(s) % CASE_COLORS.length]}
                          dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />
                      ))}
                    </LineChart>
                  </ChartFrame>
            </ChartPanel>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Case comparison</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-pl-muted border-b border-pl-border text-xs">
                        <th className="py-2 pr-4">Case</th>
                        <th className="py-2 pr-4">Model</th>
                        <th className="py-2 pr-4">Cum @5 yr (MMbbl)</th>
                        <th className="py-2 pr-4">Cum to horizon (MMbbl)</th>
                        <th className="py-2 pr-4">EUR (MMbbl)</th>
                        <th className="py-2 pr-4">Time to limit (yr)</th>
                        <th className="py-2 pr-4">Indicative NPV ($MM)</th>
                        <th className="py-2">Handoff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaries.map((s, i) => (
                        <tr key={s.id} className="border-b border-pl-border text-pl-text">
                          <td className="py-2 pr-4 text-pl-text flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ background: CASE_COLORS[i % CASE_COLORS.length] }} />
                            {s.name}
                          </td>
                          {s.error ? (
                            <td colSpan={7} className="py-2 text-pl-warning-text text-xs">{s.error}</td>
                          ) : (
                            <>
                              <td className="py-2 pr-4">{s.model}</td>
                              <td className="py-2 pr-4 font-pl-mono tabular-nums" data-testid={`fsh-cum5-${s.id}`}>
                                {s.cum5MMbbl.toFixed(2)}
                                {s.cum5Years < 5 && <span className="block text-[10px] text-pl-muted">at {s.cum5Years} yr</span>}
                              </td>
                              <td className="py-2 pr-4 font-pl-mono tabular-nums" data-testid={`fsh-cumh-${s.id}`}>{s.cumHorizonMMbbl.toFixed(2)}</td>
                              <td className="py-2 pr-4 font-pl-mono tabular-nums" data-testid={`fsh-eur-${s.id}`}>
                                {s.eurMMbbl.toFixed(2)}
                                {s.eurCapped && <span className="block text-[10px] text-pl-warning-text whitespace-nowrap">{EUR_MAX_YEARS} yr max life</span>}
                              </td>
                              <td className="py-2 pr-4 font-pl-mono tabular-nums" data-testid={`fsh-ttl-${s.id}`}>
                                {s.timeToLimitYears != null ? s.timeToLimitYears.toFixed(1) : s.hasLimit ? `> ${EUR_MAX_YEARS}` : 'No limit'}
                                {s.timeToLimitYears != null && !s.limitInHorizon && <span className="block text-[10px] text-pl-muted whitespace-nowrap">past horizon</span>}
                              </td>
                              <td className="py-2 pr-4 font-pl-mono tabular-nums">{s.economics ? s.economics.npv.toFixed(1) : '-'}</td>
                              <td className="py-2 whitespace-nowrap">
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-pl-muted hover:text-pl-text"
                                  onClick={() => exportAnnualCsv(s)} title="Export annual production profile (CSV)">
                                  <Download size={13} className="mr-1" /> Annual CSV
                                </Button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-pl-muted mt-3 flex gap-1.5">
                  <Info size={13} className="shrink-0 mt-0.5" />
                  Indicative NPV is flat price minus flat opex at a single discount rate, for ranking cases only.
                  For fiscal terms, taxes and portfolio views, export the annual profile and use NPV Scenario
                  Builder in the Economics module.
                </p>
                <p className="text-[11px] text-pl-muted mt-1.5 flex gap-1.5">
                  <Info size={13} className="shrink-0 mt-0.5" />
                  Cum to horizon, the chart, the annual CSV and the indicative NPV cover the horizon. EUR follows the
                  decline on to the economic limit, capped at a {EUR_MAX_YEARS} year maximum life.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog open={loadOpen} onOpenChange={(o) => { setLoadOpen(o); setConfirmDelete(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Saved scenario sets</DialogTitle></DialogHeader>
            <div className="space-y-2 max-h-72 overflow-y-auto py-2">
              {projects.length === 0 ? (
                <p className="text-sm text-pl-muted italic">No saved scenario sets yet.</p>
              ) : projects.map((p) => (
                <div key={p.id} className="flex items-center gap-2 p-2 rounded border border-pl-border bg-pl-sunken">
                  <button type="button" className="flex-1 text-left text-sm text-pl-text hover:text-pl-primary-text truncate" onClick={() => loadProject(p.id)}>
                    {p.project_name}
                    <span className="block text-[10px] text-pl-muted">{new Date(p.updated_at).toLocaleString()}</span>
                  </button>
                  {confirmDelete === p.id ? (
                    <Button variant="destructive" size="sm" className="h-7 px-2 text-xs" onClick={() => deleteProject(p.id)}>
                      Delete?
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-danger-text" title="Delete saved set" onClick={() => deleteProject(p.id)}>
                      <Trash2 size={13} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLoadOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

// Design system rollout batch 2A (docs/scope/DesignSystem-Rollout.md): the
// page wraps itself in <ThemedApp>, so it opens light and the header toggle
// switches it to dark per user. The rate chart keeps the white chart standard.
export default function ForecastScenarioHub() {
  return (
    <div className="min-h-screen" data-testid="fsh-theme-scope">
      <ForecastScenarioHubContent />
    </div>
  );
}
