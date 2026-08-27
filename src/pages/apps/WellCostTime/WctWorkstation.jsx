// Well Cost & Time workstation (D11/WC3): WorkspaceShell over an
// injected backend. The deterministic estimate recomputes synchronously
// through the pure wctRun on every edit; the Monte Carlo risk run is on
// demand (seeded, canonical sampler) and rides into the immutable run
// history.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Home, HelpCircle, Save, Copy } from 'lucide-react';
import Explorer from '../TorqueDragStudio/components/Explorer';
import ProgramTab from './components/ProgramTab';
import CostTab from './components/CostTab';
import RiskTab from './components/RiskTab';
import ReportTab from './components/ReportTab';
import { runDeterministic, runMonteCarlo, defaultCaseDoc, sectionsFromGeometry, ENGINE_VERSION } from './services/wctRun';

const TABS = [
  { id: 'program', label: 'Time Program' },
  { id: 'cost', label: 'AFE Cost' },
  { id: 'risk', label: 'Risk' },
  { id: 'report', label: 'Report' },
];

const BANNER_CLASSES = {
  PASS: 'bg-emerald-500/20 text-emerald-300',
  WARN: 'bg-amber-500/20 text-amber-300',
  UNKNOWN: 'bg-slate-700 text-slate-300',
};

export default function WctWorkstation({ backend }) {
  const { toast } = useToast();
  const [sites, setSites] = useState(null);
  const [siteId, setSiteId] = useState(null);
  const [wellbores, setWellbores] = useState(null);
  const [wellboreId, setWellboreId] = useState(null);
  const [trajectory, setTrajectory] = useState(null);
  const [geometry, setGeometry] = useState(null);
  const [cases, setCases] = useState(null);
  const [caseId, setCaseId] = useState(null);
  const [caseDraft, setCaseDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('program');
  const [runs, setRuns] = useState(null);
  const [savingRun, setSavingRun] = useState(false);
  const [mc, setMc] = useState(null);
  const [runningMc, setRunningMc] = useState(false);

  const fail = useCallback((e) => {
    toast({ title: 'Well Cost & Time', description: e.message, variant: 'destructive' });
  }, [toast]);

  useEffect(() => {
    backend.listSites().then((rows) => {
      setSites(rows);
      if (rows.length === 1) setSiteId(rows[0].id);
    }).catch(fail);
  }, [backend, fail]);

  useEffect(() => {
    if (!siteId) return;
    backend.listWellbores(siteId).then((rows) => {
      setWellbores(rows);
      if (rows.length === 1) setWellboreId(rows[0].id);
    }).catch(fail);
  }, [backend, siteId, fail]);

  useEffect(() => {
    if (!wellboreId) return;
    setCaseId(null); setCaseDraft(null);
    Promise.all([
      backend.getDefinitiveTrajectory(wellboreId),
      backend.getGeometry(wellboreId).catch(() => null),
      backend.listCases(wellboreId),
    ]).then(([traj, geom, caseRows]) => {
      setTrajectory(traj);
      setGeometry(geom);
      setCases(caseRows);
      if (caseRows.length) setCaseId(caseRows[0].id);
    }).catch(fail);
  }, [backend, wellboreId, fail]);

  useEffect(() => {
    const row = (cases || []).find((c) => c.id === caseId);
    setCaseDraft(row ? JSON.parse(JSON.stringify(row)) : null);
    setDirty(false);
    setMc(null);
    if (caseId) backend.listRuns(caseId).then(setRuns).catch(fail);
    else setRuns(null);
  }, [backend, caseId, cases, fail]);

  const wellbore = trajectory?.wellbore || (wellbores || []).find((w) => w.id === wellboreId) || null;
  const depthUnit = wellbore?.depth_unit === 'ft' ? 'ft' : 'm';

  const evaluated = useMemo(() => {
    if (!caseDraft) return null;
    try {
      return { res: runDeterministic({ caseDoc: caseDraft }), error: null };
    } catch (e) {
      return { res: null, error: e.message };
    }
  }, [caseDraft]);
  const res = evaluated?.res ?? null;
  const runError = evaluated?.error ?? null;

  const onCaseChange = useCallback((mutate) => {
    setCaseDraft((d) => {
      const next = JSON.parse(JSON.stringify(d));
      mutate(next);
      return next;
    });
    setDirty(true);
    setMc(null); // sampled result no longer matches the edited case
  }, []);

  const onRunMc = useCallback(() => {
    if (!caseDraft) return;
    setRunningMc(true);
    // Yield a frame so the button state paints before the sampling loop.
    setTimeout(() => {
      try {
        setMc(runMonteCarlo({ caseDoc: caseDraft }));
      } catch (e) {
        fail(e);
      } finally {
        setRunningMc(false);
      }
    }, 30);
  }, [caseDraft, fail]);

  const persistDraft = useCallback(async (draft) => {
    const payload = {
      name: draft.name,
      program: draft.program,
      costs: draft.costs,
      risk: draft.risk,
      params: draft.params,
      notes: draft.notes ?? '',
      design_id: trajectory?.design?.id ?? null,
      ct_case_id: draft.ct_case_id ?? null,
    };
    const saved = await backend.updateCase(draft.id, payload);
    setCases((rows) => rows.map((r) => (r.id === saved.id ? saved : r)));
    return saved;
  }, [backend, trajectory]);

  const saveDraft = useCallback(async () => {
    if (!caseDraft?.id) return;
    try {
      await persistDraft(caseDraft);
      setDirty(false);
      toast({ title: 'Saved', description: 'Estimate saved.' });
    } catch (e) { fail(e); }
  }, [caseDraft, persistDraft, toast, fail]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveDraft();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveDraft]);

  const onNewCase = async () => {
    try {
      const tdMdM = trajectory?.stations?.length ? trajectory.stations[trajectory.stations.length - 1].md : 3000;
      const sections = sectionsFromGeometry(geometry?.hole_sections);
      const created = await backend.saveCase({
        wellbore_id: wellboreId,
        design_id: trajectory?.design?.id ?? null,
        ...defaultCaseDoc({ tdMdM, sections: sections.length ? sections : null }),
      });
      setCases((rows) => [...(rows || []), created]);
      setCaseId(created.id);
    } catch (e) { fail(e); }
  };

  const onDuplicateCase = async () => {
    if (!caseDraft) return;
    try {
      const created = await backend.saveCase({
        wellbore_id: caseDraft.wellbore_id,
        design_id: caseDraft.design_id ?? null,
        ct_case_id: caseDraft.ct_case_id ?? null,
        name: `${caseDraft.name} (copy)`,
        program: caseDraft.program,
        costs: caseDraft.costs,
        risk: caseDraft.risk,
        params: caseDraft.params,
        notes: caseDraft.notes ?? '',
      });
      setCases((rows) => [...(rows || []), created]);
      setCaseId(created.id);
      toast({ title: 'Duplicated', description: `Created "${created.name}".` });
    } catch (e) { fail(e); }
  };

  const onDeleteCase = async (id) => {
    try {
      await backend.deleteCase(id);
      setCases((rows) => rows.filter((r) => r.id !== id));
      if (caseId === id) setCaseId(null);
    } catch (e) { fail(e); }
  };

  const onSaveRun = async () => {
    if (!res || !caseDraft?.id) return;
    setSavingRun(true);
    try {
      const saved = await backend.saveRun({
        case_id: caseDraft.id,
        design_id: trajectory?.design?.id ?? null,
        params: {
          program: caseDraft.program, costs: caseDraft.costs,
          risk: caseDraft.risk, params: caseDraft.params,
        },
        results: {
          totals: res.program.totals,
          afe: {
            byItem: res.costs.byItem.map((r) => ({ id: r.id, label: r.label, category: r.category, basis: r.basis, amountUsd: r.amountUsd })),
            tangibleUsd: res.costs.tangibleUsd,
            intangibleUsd: res.costs.intangibleUsd,
            baseUsd: res.costs.baseUsd,
            contingencyUsd: res.costs.contingencyUsd,
            totalUsd: res.costs.totalUsd,
          },
          mc: mc ? {
            iterations: mc.iterations,
            valid: mc.valid,
            cost: { p10: mc.cost.p10, p50: mc.cost.p50, p90: mc.cost.p90, mean: mc.cost.mean, stdDev: mc.cost.stdDev },
            days: { p10: mc.days.p10, p50: mc.days.p50, p90: mc.days.p90, mean: mc.days.mean },
            tornado: mc.tornado,
          } : null,
          warnings: res.warnings,
        },
        summary: {
          totalDays: res.kpis.totalDays,
          totalUsd: res.kpis.totalUsd,
          baseUsd: res.kpis.baseUsd,
          mcP50Usd: mc?.cost?.p50 ?? null,
          status: res.kpis.status,
        },
        engine_version: ENGINE_VERSION,
      });
      setRuns((rows) => [saved, ...(rows || [])]);
      toast({ title: 'Run saved', description: 'Added to the immutable run history.' });
    } catch (e) { fail(e); } finally { setSavingRun(false); }
  };

  const onDeleteRun = async (id) => {
    try {
      await backend.deleteRun(id);
      setRuns((rows) => rows.filter((r) => r.id !== id));
    } catch (e) { fail(e); }
  };

  const banner = res?.kpis?.status ?? (runError ? 'UNKNOWN' : null);

  const ribbon = (
    <div className="flex h-11 items-center gap-3 border-b border-slate-800 bg-slate-900/80 px-3">
      <Link to="/dashboard/drilling" className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
        <Home className="h-3.5 w-3.5" /> Drilling
      </Link>
      <span className="text-sm font-semibold text-slate-100">Well Cost & Time Estimator</span>
      <div className="ml-2 flex gap-1">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} data-testid={`wct-tab-${t.id}`}
            className={`rounded px-2.5 py-1 text-xs ${tab === t.id ? 'bg-lime-500/20 text-lime-300' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {banner && (
          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${BANNER_CLASSES[banner]}`} data-testid="wct-banner">
            {banner}
          </span>
        )}
        {caseDraft && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onDuplicateCase} data-testid="wct-duplicate-case">
            <Copy className="mr-1 h-3 w-3" /> Duplicate
          </Button>
        )}
        {dirty && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveDraft} data-testid="wct-save-case">
            <Save className="mr-1 h-3 w-3" /> Save case
          </Button>
        )}
        <Link to="/dashboard/apps/drilling/well-cost-time/help" className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-cyan-300 hover:bg-slate-700">
          <HelpCircle className="h-3 w-3" /> Help
        </Link>
      </div>
    </div>
  );

  const statusBar = (
    <div className="flex h-6 items-center gap-4 border-t border-slate-800 bg-slate-900/80 px-3 text-[10px] text-slate-500">
      <span>{ENGINE_VERSION}</span>
      <span data-testid="wct-status-wellbore">{wellbore ? `${wellbore.name} (${depthUnit})` : 'no wellbore'}</span>
      <span>{dirty ? 'unsaved changes' : 'saved'}</span>
      <span className="ml-auto">Schedule and AFE arithmetic validated vs oracle goldens; Monte Carlo via the canonical suite sampler</span>
    </div>
  );

  const center = !caseDraft ? (
    <div className="flex h-full items-center justify-center text-sm text-slate-500" data-testid="wct-empty">
      {wellboreId ? 'Create an estimate from the explorer.' : 'Pick a site and wellbore.'}
    </div>
  ) : (
    <div className="h-full min-h-0 overflow-auto bg-slate-950">
      {runError && (
        <div className="m-3 rounded border border-red-800 bg-red-950/40 p-2 text-xs text-red-300" data-testid="wct-run-error">
          {runError}
        </div>
      )}
      {res?.warnings?.map((w) => (
        <div key={w} className="m-3 rounded border border-amber-800 bg-amber-950/30 p-2 text-xs text-amber-300" data-testid="wct-warning">
          {w}
        </div>
      ))}
      {tab === 'program' && (
        <ProgramTab caseDraft={caseDraft} onCaseChange={onCaseChange} res={res} depthUnit={depthUnit} geometry={geometry} />
      )}
      {tab === 'cost' && (
        <CostTab caseDraft={caseDraft} onCaseChange={onCaseChange} res={res} />
      )}
      {tab === 'risk' && (
        <RiskTab caseDraft={caseDraft} onCaseChange={onCaseChange} res={res}
          mc={mc} onRunMc={onRunMc} runningMc={runningMc} />
      )}
      {tab === 'report' && (
        <ReportTab caseDraft={caseDraft} res={res} mc={mc} wellboreName={wellbore?.name}
          onSaveRun={onSaveRun} savingRun={savingRun} runs={runs} onDeleteRun={onDeleteRun} />
      )}
    </div>
  );

  return (
    <WorkspaceShell
      ribbon={ribbon}
      explorer={(
        <Explorer
          sites={sites} selectedSiteId={siteId} onSelectSite={setSiteId}
          wellbores={wellbores} selectedWellboreId={wellboreId} onSelectWellbore={setWellboreId}
          cases={cases} selectedCaseId={caseId} onSelectCase={setCaseId}
          onNewCase={onNewCase} onDeleteCase={onDeleteCase}
          trajectory={trajectory}
          caseLabel="Cost & time estimates" testPrefix="wct"
        />
      )}
      center={center}
      statusBar={statusBar}
      autoSaveId="well-cost-time.workspace.v1"
      minWidth={1100}
    />
  );
}
