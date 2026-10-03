import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import {
  GitBranch, Plus, Copy, Trash2, Save, FolderOpen, Download, Info, HelpCircle, TrendingDown, RefreshCw,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { AppHeader } from '@/components/ui/app-shell';
import { ChartPanel } from '@/components/ui/chart-panel';
import ChartFrame from '@/components/charts/ChartFrame';
import DcaNumberField from '@/components/declineCurve/DcaNumberField';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS,
} from '@/utils/chartTheme';
import { compareCases, sampleScenarioCases, EUR_MAX_YEARS, DAYS_PER_YEAR } from '@/utils/forecastScenarioCalculations';
import { buildHubCsv, HUB_DEFAULT_START } from '@/utils/forecastScenarioExport';
import { caseFromDcaContract, caseSourceText, caseValuesFromContract } from '@/utils/forecastScenarioIntake';
import { listDcaForecasts, getDcaForecast } from '@/utils/declineCurve/dcaForecastService';
import { compareWithSource } from '@/utils/declineCurve/dcaForecastContract';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useSharedSavedProjects } from '@/lib/recordSharing/useSharedSavedProjects';
import { supabaseSharingStore } from '@/lib/recordSharing';
import { RecordSharingBar } from '@/components/recordSharing';
import { useAppUnits } from '@/lib/units/useAppUnits';
import { convert } from '@/lib/units/registry';
import { buildLabel } from '@/lib/platformBuild';
import { supabase } from '@/lib/customSupabaseClient';

// R5 (Reservoir-ROADMAP.md): the reservoir-side forecast scenario
// comparator. Production forecasting lives HERE (multi-case Arps via the
// shared DCA engine); real fiscal valuation lives in Petroleum Economics
// Studio, and the per-case economics here are indicative ranking numbers.
//
// HUB-U1 (Reservoir round, with Decline Curve Analysis U1): the decline is
// labelled nominal per year of 365.25 days; every field takes typing; a case
// carries a start date; a case can come from a Decline Curve Analysis
// forecast, read by id, with its source printed and "changed since" checked;
// the annual CSV carries the case, its parameters, units and source; the
// Suite unit profile sets rate and volume units; scenario sets are under
// record sharing.

export const HUB_TABLE = 'saved_scenario_hub_projects';
const service = createSavedProjectsService(HUB_TABLE, { signInMessage: 'Sign in to save scenario sets.' });
const SHARING_STORE = supabaseSharingStore();
const CASE_COLORS = ['#059669', '#2563eb', '#d97706', '#db2777', '#7c3aed', '#0891b2'];
const HUB_UNIT_SPEC = Object.freeze({ liquidRate: { family: 'liquidRate', allowed: ['bbl/d', 'm3/d'] } });
const RATE_LABEL = { 'bbl/d': 'bbl/d', 'm3/d': 'sm3/d' };

const CaseCard = ({ c, color, onChange, onDuplicate, onDelete, deletable, rateUnit, toView, toEngine, sourceState, onRefresh, disabled }) => {
  const source = caseSourceText(c);
  return (
    <Card data-testid={`fsh-case-${c.id}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
          <Input value={c.name} onChange={(e) => onChange({ name: e.target.value })} disabled={disabled}
            className="h-7 text-sm font-medium" aria-label="Case name" />
          <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-text" title="Duplicate case" onClick={onDuplicate} disabled={disabled}>
            <Copy size={13} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-danger-text" title="Delete case"
            onClick={onDelete} disabled={!deletable || disabled}>
            <Trash2 size={13} />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DcaNumberField id={`fsh-${c.id}-qi`} label="qi" unit={rateUnit} value={c.qi} toView={toView} toEngine={toEngine}
            onCommit={(v) => onChange({ qi: v ?? 0 })} labelClassName="text-[10px] text-pl-muted" testId={`fsh-${c.id}-qi`} disabled={disabled} />
          <DcaNumberField id={`fsh-${c.id}-decline`} label="Decline (nominal)" unit="%/yr" value={c.declineAnnualPct}
            onCommit={(v) => onChange({ declineAnnualPct: v ?? 0 })} labelClassName="text-[10px] text-pl-muted" testId={`fsh-${c.id}-decline`} disabled={disabled} />
          <DcaNumberField id={`fsh-${c.id}-b`} label="b factor" value={c.b}
            onCommit={(v) => onChange({ b: v ?? 0 })} labelClassName="text-[10px] text-pl-muted" testId={`fsh-${c.id}-b`} disabled={disabled} />
          <DcaNumberField id={`fsh-${c.id}-years`} label="Horizon" unit="yr" value={c.years}
            onCommit={(v) => onChange({ years: v ?? 0 })} labelClassName="text-[10px] text-pl-muted" testId={`fsh-${c.id}-years`} disabled={disabled} />
          <DcaNumberField id={`fsh-${c.id}-limit`} label="Econ limit" unit={rateUnit} value={c.economicLimit} toView={toView} toEngine={toEngine}
            onCommit={(v) => onChange({ economicLimit: v ?? 0 })} labelClassName="text-[10px] text-pl-muted" testId={`fsh-${c.id}-limit`} disabled={disabled} />
          <div className="space-y-1">
            <Label htmlFor={`fsh-${c.id}-start`} className="text-[10px] text-pl-muted">Start date</Label>
            <Input id={`fsh-${c.id}-start`} type="date" value={c.startDate || ''} onChange={(e) => onChange({ startDate: e.target.value || null })}
              className="h-8 text-xs" disabled={disabled} data-testid={`fsh-${c.id}-start`} />
          </div>
        </div>
        {source && (
          <div className="rounded border border-pl-border bg-pl-sunken p-2 text-[10px] text-pl-muted space-y-1" data-testid={`fsh-${c.id}-source`}>
            <p>{source}</p>
            {sourceState && (
              <p className={sourceState.state === 'unchanged' ? 'text-pl-muted' : 'text-pl-warning-text'} data-testid={`fsh-${c.id}-source-state`}>
                {sourceState.text}
                {sourceState.state === 'changed' && (
                  <Button variant="outline" size="sm" className="h-6 ml-2 text-[10px] gap-1" onClick={onRefresh} disabled={disabled} data-testid={`fsh-${c.id}-refresh`}>
                    <RefreshCw size={10} /> Refresh
                  </Button>
                )}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

function ForecastScenarioHubContent({ sharingStore = SHARING_STORE }) {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const sample = useMemo(() => sampleScenarioCases(), []);
  const [cases, setCases] = useState(sample.cases);
  const [econ, setEcon] = useState(sample.econ);
  const [setStart, setSetStart] = useState(HUB_DEFAULT_START);
  const [currentId, setCurrentId] = useState(null);
  const [loadOpen, setLoadOpen] = useState(false);
  const [dcaOpen, setDcaOpen] = useState(false);
  const [dcaList, setDcaList] = useState(null);
  const [saveName, setSaveName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [sourceStates, setSourceStates] = useState({});

  const shared = useSharedSavedProjects({ table: HUB_TABLE, service, sharingStore });
  const canWrite = shared.canWrite;
  const unitsHook = useAppUnits('forecast-scenario-hub', HUB_UNIT_SPEC, { fallback: { liquidRate: 'bbl/d' } });
  const rateUnitKey = unitsHook.units.liquidRate;
  const metric = rateUnitKey === 'm3/d';
  const rateUnit = RATE_LABEL[rateUnitKey] || rateUnitKey;
  const toView = useCallback((v) => (metric ? convert('liquidRate', v, 'bbl/d', 'm3/d') : v), [metric]);
  const toEngine = useCallback((v) => (metric ? convert('liquidRate', v, 'm3/d', 'bbl/d') : v), [metric]);
  const volUnit = metric ? '10^6 sm3' : 'MMbbl';
  const volView = useCallback((mmbbl) => (metric ? convert('liquidVolume', mmbbl, 'MMbbl', '10^6 m3') : mmbbl), [metric]);

  const startIso = `${setStart || HUB_DEFAULT_START}T00:00:00Z`;
  const { summaries } = useMemo(() => compareCases(cases, econ, startIso), [cases, econ, startIso]);
  const valid = summaries.filter((s) => !s.error);
  const ownStart = cases.some((c) => c.startDate);

  // Merge the monthly rate series into one dataset on a years axis, keyed
  // by case id so two cases with the same name keep their own lines.
  const chartData = useMemo(() => {
    const byDay = new Map();
    valid.forEach((s) => {
      s.monthly.forEach((pt) => {
        const row = byDay.get(pt.day) || { years: pt.day / DAYS_PER_YEAR };
        row[s.id] = toView(pt.rate);
        byDay.set(pt.day, row);
      });
    });
    return [...byDay.values()].sort((a, b) => a.years - b.years);
  }, [valid, toView]);
  const maxYears = Math.max(1, ...valid.map((s) => Math.ceil(s.monthly.length ? s.monthly[s.monthly.length - 1].day / DAYS_PER_YEAR : 1)));
  const yearTicks = useMemo(() => {
    const step = maxYears <= 10 ? 1 : maxYears <= 25 ? 2 : 5;
    const out = [];
    for (let y = 0; y <= maxYears; y += step) out.push(y);
    return out;
  }, [maxYears]);

  const refreshProjects = useCallback(async () => {
    try { await shared.refreshList(); } catch { /* signed out: nothing to list */ }
  }, [shared.refreshList]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { refreshProjects(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // "source changed since": read every received forecast again by id
  const checkSources = useCallback(async (list) => {
    const out = {};
    for (const c of list) {
      const k = c.source?.contract;
      if (!k) continue;
      try {
        const now = await getDcaForecast(supabase, { projectId: k.projectId, wellId: k.source?.wellId, stream: k.stream });
        out[c.id] = compareWithSource(k, now);
      } catch (e) {
        out[c.id] = { state: 'unreadable', text: `The source could not be read: ${e.message}` };
      }
    }
    setSourceStates(out);
  }, []);
  const sourceKey = cases.map((c) => `${c.id}:${c.source?.contract?.fingerprint || ''}`).join('|');
  useEffect(() => { checkSources(cases); }, [sourceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const takeContract = useCallback((contract) => {
    const made = caseFromDcaContract(contract, { id: `dca-${uuidv4().slice(0, 8)}`, build: buildLabel() });
    if (!made.ok) {
      toast({ title: 'Not added', description: made.reason, variant: 'destructive' });
      return false;
    }
    setCases((cs) => [...cs, made.case]);
    toast({ title: 'Case added from Decline Curve Analysis', description: made.case.name });
    return true;
  }, [toast]);

  // a deep link from Decline Curve Analysis: ?dcaProject=&dcaWell=&dcaStream=
  useEffect(() => {
    const projectId = params.get('dcaProject');
    const wellId = params.get('dcaWell');
    const stream = params.get('dcaStream') || 'oil';
    if (!projectId || !wellId) return;
    (async () => {
      try {
        const got = await getDcaForecast(supabase, { projectId, wellId, stream }, { build: buildLabel() });
        if (!got) toast({ title: 'Not added', description: 'The Decline Curve Analysis project or well could not be read.', variant: 'destructive' });
        else if (!got.ok) toast({ title: 'Not added', description: got.reason, variant: 'destructive' });
        else takeContract(got.contract);
      } catch (e) {
        toast({ title: 'Not added', description: e.message, variant: 'destructive' });
      } finally {
        const next = new URLSearchParams(params);
        ['dcaProject', 'dcaWell', 'dcaStream'].forEach((k) => next.delete(k));
        setParams(next, { replace: true });
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openDca = async () => {
    setDcaOpen(true);
    setDcaList(null);
    try {
      setDcaList(await listDcaForecasts(supabase, { build: buildLabel() }));
    } catch (e) {
      setDcaList([]);
      toast({ title: 'Could not list forecasts', description: e.message, variant: 'destructive' });
    }
  };

  const payload = (name) => ({ name, cases, econ, startDate: setStart, schema: 2 });
  const saveProject = async () => {
    const name = saveName.trim();
    if (!name) return;
    // Saving under an existing name updates that set instead of adding a twin (FSH-T1-004)
    const existing = shared.projects.find((p) => p.name === name);
    const id = existing ? existing.id : uuidv4();
    try {
      if (existing) {
        // the row (and its version) of the set being overwritten
        if (shared.projectRow?.id !== existing.id) await shared.loadForOpen(existing.id);
        const res = await shared.write(id, payload(name));
        if (!res.ok) {
          toast({ title: 'Not saved', description: res.message, variant: 'destructive' });
          return;
        }
      } else {
        await service.save(id, payload(name));
        await shared.adoptRow(id);
      }
      setCurrentId(id);
      toast({ title: existing ? 'Scenario set updated' : 'Scenario set saved', description: name });
      setSaveName('');
      refreshProjects();
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
  };

  const loadProject = async (id) => {
    try {
      const data = await shared.loadForOpen(id);
      if (!data) throw new Error('The scenario set is not there.');
      setCases(data.cases || sample.cases);
      setEcon(data.econ || sample.econ);
      setSetStart(data.startDate || HUB_DEFAULT_START);
      setCurrentId(id);
      setLoadOpen(false);
      toast({ title: 'Scenario set loaded' });
    } catch (e) {
      toast({ title: 'Load failed', description: e?.message, variant: 'destructive' });
    }
  };

  // Delete asks for a second click on the same set (FSH-T1-004)
  const deleteProject = async (id) => {
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    setConfirmDelete(null);
    try {
      await service.remove(id);
      if (id === currentId) { setCurrentId(null); shared.close(); }
      refreshProjects();
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    }
  };

  const saveCopy = async () => {
    const name = shared.copyNameFor(shared.projectRow?.project_name || 'Scenario set');
    const id = uuidv4();
    await service.save(id, payload(name));
    await shared.adoptRow(id);
    setCurrentId(id);
    refreshProjects();
    toast({ title: 'Saved a copy', description: name });
  };

  const updateCase = (id, patch) => setCases((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const refreshCase = (c) => {
    const now = sourceStates[c.id]?.now;
    if (!now) return;
    updateCase(c.id, { ...caseValuesFromContract(now), source: { ...c.source, contract: now, receivedAt: new Date().toISOString(), receivedBuild: buildLabel() } });
    toast({ title: 'Case refreshed from Decline Curve Analysis', description: c.name });
  };
  const addCase = () => setCases((cs) => [...cs, {
    id: `c${Date.now()}`, name: `Case ${cs.length + 1}`, qi: 1000, declineAnnualPct: 18, b: 0.5, years: 20, economicLimit: 30,
  }]);
  const duplicateCase = (c) => setCases((cs) => [...cs, { ...c, id: `c${Date.now()}`, name: `${c.name} (copy)` }]);
  const removeCase = (id) => setCases((cs) => cs.filter((c) => c.id !== id));

  const exportAnnualCsv = (s) => {
    const c = cases.find((x) => x.id === s.id);
    const text = buildHubCsv(s, c, { econ, setStart, build: buildLabel(), metric });
    const blob = new Blob([text], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${s.name.replace(/\W+/g, '_')}_annual_profile.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Annual profile exported', description: 'Petroleum Economics Studio imports saved scenario sets directly: Production, Import from Forecast Scenario Hub.' });
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
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={addCase} className="h-8" disabled={!canWrite}>
                <Plus size={14} className="mr-1" /> Add case
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={openDca} disabled={!canWrite} data-testid="fsh-from-dca">
                <TrendingDown size={14} className="mr-1" /> From Decline Curve Analysis
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setLoadOpen(true)}>
                <FolderOpen size={14} className="mr-1" /> Load
              </Button>
            </div>
            {shared.projectRow && (
              <RecordSharingBar sharing={shared.sharing} label="scenario set" onSaveCopy={saveCopy} onReload={() => loadProject(currentId)}
                fieldLabels={{ project_name: 'name', inputs_data: 'cases and economics' }} />
            )}
            {shared.projectRow && shared.sharing.ready && !canWrite && (
              <p className="text-xs text-pl-warning-text" data-testid="fsh-read-only">{shared.sharing.readOnlyReason || 'This scenario set is open read-only.'} Changes you make here are not saved to it.</p>
            )}
            <div className="rounded-lg border border-pl-border bg-pl-surface p-3 space-y-2" data-testid="fsh-set-start">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="fsh-set-start" className="text-xs text-pl-text">Forecast start (cases without their own)</Label>
                <Input id="fsh-set-start" type="date" value={setStart} onChange={(e) => setSetStart(e.target.value || HUB_DEFAULT_START)} className="h-8 w-40 text-xs" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-pl-muted">Rates</span>
                <div className="flex gap-1">
                  {['bbl/d', 'm3/d'].map((k) => (
                    <Button key={k} size="sm" variant={rateUnitKey === k ? 'secondary' : 'ghost'} className="h-6 text-[11px]" onClick={() => unitsHook.setUnit('liquidRate', k)} aria-pressed={rateUnitKey === k}>
                      {RATE_LABEL[k]}
                    </Button>
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-pl-muted">Decline is the nominal (instantaneous) decline at the case start, percent per year of 365.25 days. Rates are oil at stock-tank conditions.</p>
            </div>
            {cases.map((c, i) => (
              <CaseCard key={c.id} c={c} color={CASE_COLORS[i % CASE_COLORS.length]}
                onChange={(patch) => updateCase(c.id, patch)}
                onDuplicate={() => duplicateCase(c)}
                onDelete={() => removeCase(c.id)}
                deletable={cases.length > 1}
                rateUnit={rateUnit} toView={toView} toEngine={toEngine}
                sourceState={sourceStates[c.id]} onRefresh={() => refreshCase(c)}
                disabled={!canWrite} />
            ))}

            <Card>
              <CardHeader className="py-2 px-3"><CardTitle className="text-pl-muted text-xs uppercase tracking-wider">Indicative economics</CardTitle></CardHeader>
              <CardContent className="p-3 pt-0 grid grid-cols-3 gap-2">
                {[
                  ['pricePerBbl', 'Price', '$/bbl'],
                  ['opexPerBbl', 'Opex', '$/bbl'],
                  ['discountRatePct', 'Discount', '%'],
                ].map(([key, label, unit]) => (
                  <DcaNumberField key={key} id={`fsh-econ-${key}`} label={label} unit={unit} value={econ[key]}
                    onCommit={(v) => setEcon((p) => ({ ...p, [key]: v ?? 0 }))} labelClassName="text-[10px] text-pl-muted" disabled={!canWrite} />
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
                        label={{ value: ownStart ? 'Years from each case start' : 'Years from forecast start', position: 'insideBottom', offset: -2, style: { fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize } }} />
                      <YAxis tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} stroke={CHART_COLORS.axisLine}
                        label={{ value: `Rate (${rateUnit})`, angle: -90, position: 'insideLeft', style: { fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize } }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => (typeof v === 'number' ? `${v.toFixed(metric ? 1 : 0)} ${rateUnit}` : v)}
                        labelFormatter={(y) => `Year ${Number(y).toFixed(1)}`} />
                      <Legend {...LEGEND_PROPS} />
                      {valid.map((s) => (
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
                        <th className="py-2 pr-4">Start</th>
                        <th className="py-2 pr-4">Cum @5 yr ({volUnit})</th>
                        <th className="py-2 pr-4">Cum to horizon ({volUnit})</th>
                        <th className="py-2 pr-4">EUR ({volUnit})</th>
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
                            <td colSpan={8} className="py-2 text-pl-warning-text text-xs">{s.error}</td>
                          ) : (
                            <>
                              <td className="py-2 pr-4">{s.model}</td>
                              <td className="py-2 pr-4 font-pl-mono tabular-nums text-xs">{s.startDate || setStart}</td>
                              <td className="py-2 pr-4 font-pl-mono tabular-nums" data-testid={`fsh-cum5-${s.id}`}>
                                {volView(s.cum5MMbbl).toFixed(2)}
                                {s.cum5Years < 5 && <span className="block text-[10px] text-pl-muted">at {s.cum5Years} yr</span>}
                              </td>
                              <td className="py-2 pr-4 font-pl-mono tabular-nums" data-testid={`fsh-cumh-${s.id}`}>{volView(s.cumHorizonMMbbl).toFixed(2)}</td>
                              <td className="py-2 pr-4 font-pl-mono tabular-nums" data-testid={`fsh-eur-${s.id}`}>
                                {volView(s.eurMMbbl).toFixed(2)}
                                {s.eurCapped && <span className="block text-[10px] text-pl-warning-text whitespace-nowrap">{EUR_MAX_YEARS} yr max life</span>}
                              </td>
                              <td className="py-2 pr-4 font-pl-mono tabular-nums" data-testid={`fsh-ttl-${s.id}`}>
                                {s.timeToLimitYears != null ? s.timeToLimitYears.toFixed(1) : s.hasLimit ? `> ${EUR_MAX_YEARS}` : 'No limit'}
                                {s.timeToLimitYears != null && !s.limitInHorizon && <span className="block text-[10px] text-pl-muted whitespace-nowrap">past horizon</span>}
                              </td>
                              <td className="py-2 pr-4 font-pl-mono tabular-nums">{s.economics ? s.economics.npv.toFixed(1) : 'n/a'}</td>
                              <td className="py-2 whitespace-nowrap">
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-pl-muted hover:text-pl-text"
                                  onClick={() => exportAnnualCsv(s)} title="Export the annual production profile with the case, its parameters, units and source (CSV)">
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
                  Indicative NPV is flat price minus flat opex at a single discount rate, discounted at each year end, for ranking cases only.
                  For fiscal terms, taxes and portfolio views, save the set and import it in Petroleum Economics Studio.
                </p>
                <p className="text-[11px] text-pl-muted mt-1.5 flex gap-1.5">
                  <Info size={13} className="shrink-0 mt-0.5" />
                  Cum to horizon, the chart, the annual CSV and the indicative NPV cover the horizon. EUR follows the
                  decline on to the economic limit, capped at a {EUR_MAX_YEARS} year maximum life. A year is 365.25 days.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog open={loadOpen} onOpenChange={(o) => { setLoadOpen(o); setConfirmDelete(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Saved scenario sets</DialogTitle></DialogHeader>
            <div className="space-y-2 max-h-72 overflow-y-auto py-2">
              {shared.projects.length === 0 && shared.sharedProjects.length === 0 ? (
                <p className="text-sm text-pl-muted italic">No saved scenario sets yet.</p>
              ) : [...shared.projects.map((p) => ({ ...p, mine: true })), ...shared.sharedProjects.map((p) => ({ ...p, mine: false }))].map((p) => (
                <div key={p.id} className="flex items-center gap-2 p-2 rounded border border-pl-border bg-pl-sunken">
                  <button type="button" className="flex-1 text-left text-sm text-pl-text hover:text-pl-primary-text truncate" onClick={() => loadProject(p.id)}>
                    {p.name}
                    <span className="block text-[10px] text-pl-muted">{p.mine ? '' : 'Shared with me. '}{p.updatedAt ? new Date(p.updatedAt).toLocaleString() : ''}</span>
                  </button>
                  {!p.mine ? null : confirmDelete === p.id ? (
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

        <Dialog open={dcaOpen} onOpenChange={setDcaOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Forecasts in Decline Curve Analysis</DialogTitle></DialogHeader>
            <p className="text-xs text-pl-muted">A case starts the day after the well's data cut-off with the fitted curve restarted there, so it reproduces the Decline Curve Analysis forecast. The case keeps where it came from.</p>
            <div className="space-y-2 max-h-80 overflow-y-auto py-2" data-testid="fsh-dca-list">
              {dcaList === null ? <p className="text-sm text-pl-muted">Reading your projects...</p>
                : dcaList.length === 0 ? <p className="text-sm text-pl-muted italic">No Decline Curve Analysis forecasts found. Fit and forecast a well there, and save the project.</p>
                  : dcaList.map((f) => (
                    <div key={`${f.projectId}-${f.wellId}-${f.stream}`} className="flex items-center gap-2 p-2 rounded border border-pl-border bg-pl-sunken text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="text-pl-text truncate">{f.wellName}, {f.stream}</div>
                        <div className="text-[10px] text-pl-muted truncate">{f.projectName}{f.ok ? `, remaining ${Math.round(f.contract.forecast.remaining).toLocaleString()} ${f.contract.units.volume}` : `: ${f.reason}`}</div>
                      </div>
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={!f.ok || f.stream !== 'oil'}
                        title={f.stream !== 'oil' ? 'The hub holds oil cases' : undefined}
                        onClick={() => { if (takeContract(f.contract)) setDcaOpen(false); }}>Use</Button>
                    </div>
                  ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDcaOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

// Design system rollout batch 2A (docs/scope/DesignSystem-Rollout.md): the
// page sits in the dashboard scope, so it opens light and the header toggle
// switches it to dark per user. The rate chart keeps the white chart standard.
export default function ForecastScenarioHub(props) {
  return (
    <div className="min-h-screen" data-testid="fsh-theme-scope">
      <ForecastScenarioHubContent {...props} />
    </div>
  );
}
