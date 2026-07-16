import React, { useMemo, useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  GitBranch, ArrowLeft, Plus, Copy, Trash2, Save, FolderOpen, Download, Info,
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
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS,
} from '@/utils/chartTheme';
import { compareCases, sampleScenarioCases } from '@/utils/forecastScenarioCalculations';
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
  <Card className="bg-slate-900/70 border-slate-800">
    <CardContent className="p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
        <Input value={c.name} onChange={(e) => onChange({ name: e.target.value })}
          className="h-7 bg-slate-800 border-slate-700 text-sm font-medium" />
        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-white" title="Duplicate case" onClick={onDuplicate}>
          <Copy size={13} />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-red-400" title="Delete case"
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
            <Label className="text-[10px] text-slate-500">{label}</Label>
            <Input type="number" step="any" value={c[key]}
              onChange={(e) => onChange({ [key]: numOr(e.target.value) })}
              className="h-7 bg-slate-800 border-slate-700 text-xs" />
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

export default function ForecastScenarioHub() {
  const { toast } = useToast();
  const sample = useMemo(() => sampleScenarioCases(), []);
  const [cases, setCases] = useState(sample.cases);
  const [econ, setEcon] = useState(sample.econ);
  const [projects, setProjects] = useState([]);
  const [loadOpen, setLoadOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  const { summaries } = useMemo(() => compareCases(cases, econ), [cases, econ]);
  const valid = summaries.filter((s) => !s.error);

  // Merge monthly rate series into one chart dataset keyed by month index.
  const chartData = useMemo(() => {
    const byMonth = new Map();
    valid.forEach((s) => {
      s.monthly.forEach((pt) => {
        const row = byMonth.get(pt.monthIndex) || { month: pt.monthIndex };
        row[s.name] = pt.rate;
        byMonth.set(pt.monthIndex, row);
      });
    });
    return [...byMonth.values()].sort((a, b) => a.month - b.month);
  }, [valid]);

  const refreshProjects = async () => {
    const { data, error } = await supabase.from(TABLE)
      .select('id, project_name, updated_at').order('updated_at', { ascending: false });
    if (!error) setProjects(data || []);
  };
  useEffect(() => { refreshProjects(); }, []);

  const saveProject = async () => {
    if (!saveName.trim()) return;
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from(TABLE).insert([{
      user_id: userData?.user?.id,
      project_name: saveName.trim(),
      inputs_data: { cases, econ },
      updated_at: new Date().toISOString(),
    }]);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Scenario set saved' });
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

  const deleteProject = async (id) => {
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
      <div className="p-4 md:p-8 h-full flex flex-col">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-6">
          <div className="flex items-center space-x-4 mb-4">
            <Link to="/dashboard/reservoir">
              <Button variant="outline" size="sm" className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Reservoir Management
              </Button>
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-3 rounded-xl">
              <GitBranch className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-4xl font-bold text-white">Forecast Scenario Hub</h1>
              <p className="text-lime-200 text-md md:text-lg">Multi-case Arps production forecasting, compared side by side</p>
            </div>
          </div>
        </motion.div>

        <div className="flex flex-col xl:flex-row gap-6 flex-grow min-h-0">
          {/* Cases + economics */}
          <div className="xl:w-96 shrink-0 space-y-3">
            <div className="flex gap-2">
              <Button size="sm" onClick={addCase} className="bg-emerald-600 hover:bg-emerald-500 h-8">
                <Plus size={14} className="mr-1" /> Add case
              </Button>
              <Button size="sm" variant="outline" className="border-slate-700 text-slate-300 h-8" onClick={() => setLoadOpen(true)}>
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

            <Card className="bg-slate-900/70 border-slate-800">
              <CardHeader className="py-2 px-3"><CardTitle className="text-slate-300 text-xs uppercase tracking-wider">Indicative economics</CardTitle></CardHeader>
              <CardContent className="p-3 pt-0 grid grid-cols-3 gap-2">
                {[
                  ['pricePerBbl', 'Price ($/bbl)'],
                  ['opexPerBbl', 'Opex ($/bbl)'],
                  ['discountRatePct', 'Discount (%)'],
                ].map(([key, label]) => (
                  <div key={key} className="space-y-0.5">
                    <Label className="text-[10px] text-slate-500">{label}</Label>
                    <Input type="number" step="any" value={econ[key]}
                      onChange={(e) => setEcon((p) => ({ ...p, [key]: numOr(e.target.value) }))}
                      className="h-7 bg-slate-800 border-slate-700 text-xs" />
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Input placeholder="Save scenario set as..." value={saveName} onChange={(e) => setSaveName(e.target.value)}
                className="h-8 bg-slate-800 border-slate-700 text-xs" />
              <Button size="sm" variant="outline" className="border-slate-700 text-slate-300 h-8 shrink-0" onClick={saveProject} disabled={!saveName.trim()}>
                <Save size={14} />
              </Button>
            </div>
          </div>

          {/* Comparison */}
          <div className="flex-1 min-w-0 space-y-4">
            <Card className="bg-slate-900/70 border-slate-800">
              <CardHeader className="pb-2"><CardTitle className="text-white text-base">Rate profiles</CardTitle></CardHeader>
              <CardContent>
                <div className="bg-white rounded-lg p-3">
                  <ChartFrame height={320}>
                    <LineChart data={chartData} margin={CHART_MARGINS.legend}>
                      <CartesianGrid {...GRID_STYLE} />
                      <XAxis dataKey="month" tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} stroke={CHART_COLORS.axisLine}
                        label={{ value: 'Month', position: 'insideBottom', offset: -2, style: { fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize } }} />
                      <YAxis tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} stroke={CHART_COLORS.axisLine}
                        label={{ value: 'Rate (bbl/d)', angle: -90, position: 'insideLeft', style: { fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize } }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => (typeof v === 'number' ? v.toFixed(0) : v)} />
                      <Legend {...LEGEND_PROPS} />
                      {valid.map((s, i) => (
                        <Line key={s.id} type="monotone" dataKey={s.name} stroke={CASE_COLORS[i % CASE_COLORS.length]}
                          dot={false} strokeWidth={2} isAnimationActive={false} connectNulls={false} />
                      ))}
                    </LineChart>
                  </ChartFrame>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/70 border-slate-800">
              <CardHeader className="pb-2"><CardTitle className="text-white text-base">Case comparison</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-800 text-xs">
                        <th className="py-2 pr-4">Case</th>
                        <th className="py-2 pr-4">Model</th>
                        <th className="py-2 pr-4">EUR (MMbbl)</th>
                        <th className="py-2 pr-4">Cum @5 yr (MMbbl)</th>
                        <th className="py-2 pr-4">Time to limit (yr)</th>
                        <th className="py-2 pr-4">Indicative NPV ($MM)</th>
                        <th className="py-2">Handoff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaries.map((s, i) => (
                        <tr key={s.id} className="border-b border-slate-800/60 text-slate-300">
                          <td className="py-2 pr-4 text-slate-100 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ background: CASE_COLORS[i % CASE_COLORS.length] }} />
                            {s.name}
                          </td>
                          {s.error ? (
                            <td colSpan={6} className="py-2 text-amber-400 text-xs">{s.error}</td>
                          ) : (
                            <>
                              <td className="py-2 pr-4">{s.model}</td>
                              <td className="py-2 pr-4 tabular-nums">{s.eurMMbbl.toFixed(2)}</td>
                              <td className="py-2 pr-4 tabular-nums">{s.cum5MMbbl.toFixed(2)}</td>
                              <td className="py-2 pr-4 tabular-nums">{s.timeToLimitYears.toFixed(1)}</td>
                              <td className="py-2 pr-4 tabular-nums">{s.economics ? s.economics.npv.toFixed(1) : '—'}</td>
                              <td className="py-2">
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-400 hover:text-white"
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
                <p className="text-[11px] text-slate-500 mt-3 flex gap-1.5">
                  <Info size={13} className="shrink-0 mt-0.5" />
                  Indicative NPV is flat price minus flat opex at a single discount rate, for ranking cases only.
                  For fiscal terms, taxes and portfolio views, export the annual profile and use NPV Scenario
                  Builder in the Economics module.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog open={loadOpen} onOpenChange={setLoadOpen}>
          <DialogContent className="bg-slate-900 border-slate-700 text-slate-100">
            <DialogHeader><DialogTitle>Saved scenario sets</DialogTitle></DialogHeader>
            <div className="space-y-2 max-h-72 overflow-y-auto py-2">
              {projects.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No saved scenario sets yet.</p>
              ) : projects.map((p) => (
                <div key={p.id} className="flex items-center gap-2 p-2 rounded border border-slate-700 bg-slate-800">
                  <button type="button" className="flex-1 text-left text-sm text-slate-200 hover:text-white truncate" onClick={() => loadProject(p.id)}>
                    {p.project_name}
                    <span className="block text-[10px] text-slate-500">{new Date(p.updated_at).toLocaleString()}</span>
                  </button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-red-400" onClick={() => deleteProject(p.id)}>
                    <Trash2 size={13} />
                  </Button>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" className="border-slate-700 text-slate-300" onClick={() => setLoadOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
