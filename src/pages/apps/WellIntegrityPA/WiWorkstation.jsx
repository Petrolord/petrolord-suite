// Well Integrity & P&A workstation (D10/WI2): WorkspaceShell over an
// injected backend. Barriers, annulus limits and the abandonment program
// all recompute synchronously through the pure wiRun on every edit;
// annulus element TVDs ride the definitive trajectory; runs persist to
// wp_wi_runs (immutable).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Home, HelpCircle, Save, Copy } from 'lucide-react';
import Explorer from '../TorqueDragStudio/components/Explorer';
import BarriersTab from './components/BarriersTab';
import AnnulusTab from './components/AnnulusTab';
import PlugsTab from './components/PlugsTab';
import ProgramTab from './components/ProgramTab';
import { runAll, defaultCaseDoc, ENGINE_VERSION } from './services/wiRun';

const TABS = [
  { id: 'barriers', label: 'Barriers' },
  { id: 'annulus', label: 'Annulus Pressure' },
  { id: 'plugs', label: 'P&A Plugs' },
  { id: 'program', label: 'Program' },
];

const BANNER_CLASSES = {
  PASS: 'bg-emerald-500/20 text-emerald-300',
  WARN: 'bg-amber-500/20 text-amber-300',
  FAIL: 'bg-red-500/20 text-red-300',
  UNKNOWN: 'bg-slate-700 text-slate-300',
};

export default function WiWorkstation({ backend }) {
  const { toast } = useToast();
  const [sites, setSites] = useState(null);
  const [siteId, setSiteId] = useState(null);
  const [wellbores, setWellbores] = useState(null);
  const [wellboreId, setWellboreId] = useState(null);
  const [trajectory, setTrajectory] = useState(null);
  const [cases, setCases] = useState(null);
  const [caseId, setCaseId] = useState(null);
  const [caseDraft, setCaseDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('barriers');
  const [runs, setRuns] = useState(null);
  const [savingRun, setSavingRun] = useState(false);

  const fail = useCallback((e) => {
    toast({ title: 'Well Integrity & P&A', description: e.message, variant: 'destructive' });
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
      backend.listCases(wellboreId),
    ]).then(([traj, caseRows]) => {
      setTrajectory(traj);
      setCases(caseRows);
      if (caseRows.length) setCaseId(caseRows[0].id);
    }).catch(fail);
  }, [backend, wellboreId, fail]);

  useEffect(() => {
    const row = (cases || []).find((c) => c.id === caseId);
    setCaseDraft(row ? JSON.parse(JSON.stringify(row)) : null);
    setDirty(false);
    if (caseId) backend.listRuns(caseId).then(setRuns).catch(fail);
    else setRuns(null);
  }, [backend, caseId, cases, fail]);

  const wellbore = trajectory?.wellbore || (wellbores || []).find((w) => w.id === wellboreId) || null;
  const depthUnit = wellbore?.depth_unit === 'ft' ? 'ft' : 'm';

  const evaluated = useMemo(() => {
    if (!caseDraft) return null;
    try {
      return {
        res: runAll({ caseDoc: caseDraft, stations: trajectory?.stations || null }),
        error: null,
      };
    } catch (e) {
      return { res: null, error: e.message };
    }
  }, [caseDraft, trajectory]);
  const res = evaluated?.res ?? null;
  const runError = evaluated?.error ?? null;

  const onCaseChange = useCallback((mutate) => {
    setCaseDraft((d) => {
      const next = JSON.parse(JSON.stringify(d));
      mutate(next);
      return next;
    });
    setDirty(true);
  }, []);

  const persistDraft = useCallback(async (draft) => {
    const payload = {
      name: draft.name,
      barrier: draft.barrier,
      annulus: draft.annulus,
      pa: draft.pa,
      params: draft.params,
      notes: draft.notes ?? '',
      design_id: trajectory?.design?.id ?? null,
      ct_case_id: draft.ct_case_id ?? null,
      cd_case_id: draft.cd_case_id ?? null,
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
      toast({ title: 'Saved', description: 'Integrity case saved.' });
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
      const created = await backend.saveCase({
        wellbore_id: wellboreId,
        design_id: trajectory?.design?.id ?? null,
        ...defaultCaseDoc({ tdMdM: trajectory?.stations?.length ? trajectory.stations[trajectory.stations.length - 1].md : 3000 }),
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
        cd_case_id: caseDraft.cd_case_id ?? null,
        name: `${caseDraft.name} (copy)`,
        barrier: caseDraft.barrier,
        annulus: caseDraft.annulus,
        pa: caseDraft.pa,
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
          barrier: caseDraft.barrier, annulus: caseDraft.annulus,
          pa: caseDraft.pa, params: caseDraft.params,
        },
        results: {
          barriers: res.barriers,
          annuli: res.annuli,
          program: {
            zoneCompliance: res.program.zoneCompliance,
            surfacePlug: res.program.surfacePlug,
            steps: res.program.steps,
            takeoff: res.program.takeoff,
            pass: res.program.pass,
          },
          warnings: res.warnings,
        },
        summary: {
          category: res.kpis.category,
          mawopPa: res.kpis.mawopPa,
          programPass: res.kpis.programPass,
          slurryM3: res.kpis.slurryM3,
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
      <span className="text-sm font-semibold text-slate-100">Well Integrity & P&A Studio</span>
      <div className="ml-2 flex gap-1">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} data-testid={`wi-tab-${t.id}`}
            className={`rounded px-2.5 py-1 text-xs ${tab === t.id ? 'bg-lime-500/20 text-lime-300' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {banner && (
          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${BANNER_CLASSES[banner]}`} data-testid="wi-banner">
            {banner}
          </span>
        )}
        {caseDraft && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onDuplicateCase} data-testid="wi-duplicate-case">
            <Copy className="mr-1 h-3 w-3" /> Duplicate
          </Button>
        )}
        {dirty && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveDraft} data-testid="wi-save-case">
            <Save className="mr-1 h-3 w-3" /> Save case
          </Button>
        )}
        <Link to="/dashboard/apps/drilling/well-integrity-pa/help" className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-cyan-300 hover:bg-slate-700">
          <HelpCircle className="h-3 w-3" /> Help
        </Link>
      </div>
    </div>
  );

  const statusBar = (
    <div className="flex h-6 items-center gap-4 border-t border-slate-800 bg-slate-900/80 px-3 text-[10px] text-slate-500">
      <span>{ENGINE_VERSION}</span>
      <span data-testid="wi-status-wellbore">{wellbore ? `${wellbore.name} (${depthUnit})` : 'no wellbore'}</span>
      <span>{dirty ? 'unsaved changes' : 'saved'}</span>
      <span className="ml-auto">Barrier rules and plug arithmetic validated vs oracle goldens; NORSOK D-010 and API RP 90 documents govern</span>
    </div>
  );

  const center = !caseDraft ? (
    <div className="flex h-full items-center justify-center text-sm text-slate-500" data-testid="wi-empty">
      {wellboreId ? 'Create an integrity case from the explorer.' : 'Pick a site and wellbore.'}
    </div>
  ) : (
    <div className="h-full min-h-0 overflow-auto bg-slate-950">
      {runError && (
        <div className="m-3 rounded border border-red-800 bg-red-950/40 p-2 text-xs text-red-300" data-testid="wi-run-error">
          {runError}
        </div>
      )}
      {res?.warnings?.map((w) => (
        <div key={w} className="m-3 rounded border border-amber-800 bg-amber-950/30 p-2 text-xs text-amber-300" data-testid="wi-warning">
          {w}
        </div>
      ))}
      {tab === 'barriers' && (
        <BarriersTab caseDraft={caseDraft} onCaseChange={onCaseChange} res={res} />
      )}
      {tab === 'annulus' && (
        <AnnulusTab caseDraft={caseDraft} onCaseChange={onCaseChange} res={res} depthUnit={depthUnit} />
      )}
      {tab === 'plugs' && (
        <PlugsTab caseDraft={caseDraft} onCaseChange={onCaseChange} res={res} depthUnit={depthUnit} />
      )}
      {tab === 'program' && (
        <ProgramTab caseDraft={caseDraft} onCaseChange={onCaseChange} res={res} depthUnit={depthUnit}
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
          caseLabel="Integrity cases" testPrefix="wi"
        />
      )}
      center={center}
      statusBar={statusBar}
      autoSaveId="well-integrity-pa.workspace.v1"
      minWidth={1100}
    />
  );
}
