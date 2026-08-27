// Completion Design Studio workstation (D7/CD2): WorkspaceShell over an
// injected backend. The completion string, casing program and checks all
// recompute synchronously through the pure cdRun on every edit; runs
// persist to wp_cd_runs (immutable).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Home, HelpCircle, Save, Copy } from 'lucide-react';
import Explorer from '../TorqueDragStudio/components/Explorer';
import StringBuilderTab from './components/StringBuilderTab';
import SchematicTab from './components/SchematicTab';
import ChecksTab from './components/ChecksTab';
import TubingSizingTab from './components/TubingSizingTab';
import { runAll, defaultCaseDoc, ENGINE_VERSION } from './services/cdRun';

const TABS = [
  { id: 'builder', label: 'String & Program' },
  { id: 'schematic', label: 'Schematic' },
  { id: 'checks', label: 'Checks' },
  { id: 'sizing', label: 'Tubing Sizing' },
];

const BANNER_CLASSES = {
  PASS: 'bg-emerald-500/20 text-emerald-300',
  WARN: 'bg-amber-500/20 text-amber-300',
  FAIL: 'bg-red-500/20 text-red-300',
  UNKNOWN: 'bg-slate-700 text-slate-300',
};

export default function CdWorkstation({ backend }) {
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
  const [tab, setTab] = useState('builder');
  const [ctCases, setCtCases] = useState([]);
  const [runs, setRuns] = useState(null);
  const [savingRun, setSavingRun] = useState(false);

  const fail = useCallback((e) => {
    toast({ title: 'Completion Design Studio', description: e.message, variant: 'destructive' });
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
      backend.listCtCases(wellboreId).catch(() => []),
    ]).then(([traj, caseRows, ctRows]) => {
      setTrajectory(traj);
      setCases(caseRows);
      setCtCases(ctRows || []);
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

  // Synchronous evaluation of the draft; a broken draft (e.g. a section
  // outside the catalog) surfaces as the error card, never a crash.
  const evaluated = useMemo(() => {
    if (!caseDraft) return null;
    try {
      return { res: runAll({ caseDoc: caseDraft }), error: null };
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
  }, []);

  const persistDraft = useCallback(async (draft) => {
    const payload = {
      name: draft.name,
      string: draft.string,
      casing_program: draft.casing_program,
      params: draft.params,
      notes: draft.notes ?? '',
      design_id: trajectory?.design?.id ?? null,
      ct_case_id: draft.casing_program?.ct_case_id ?? null,
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
      toast({ title: 'Saved', description: 'Completion case saved.' });
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
        ct_case_id: caseDraft.casing_program?.ct_case_id ?? null,
        name: `${caseDraft.name} (copy)`,
        string: caseDraft.string,
        casing_program: caseDraft.casing_program,
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
        params: { string: caseDraft.string, casing_program: caseDraft.casing_program, params: caseDraft.params },
        results: {
          clearance: res.clearance.rows,
          throughBore: res.throughBore.rows,
          volumes: res.volumes,
          spaceOut: res.spaceOut,
        },
        summary: {
          banner: res.kpis.banner,
          stringBottomMdM: res.kpis.stringBottomMdM,
          minThroughBoreM: res.kpis.minThroughBoreM,
          worstClearanceM: res.kpis.worstClearanceM,
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

  const banner = res?.kpis?.banner ?? (runError ? 'UNKNOWN' : null);

  const ribbon = (
    <div className="flex h-11 items-center gap-3 border-b border-slate-800 bg-slate-900/80 px-3">
      <Link to="/dashboard/drilling" className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
        <Home className="h-3.5 w-3.5" /> Drilling
      </Link>
      <span className="text-sm font-semibold text-slate-100">Completion Design Studio</span>
      <div className="ml-2 flex gap-1">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} data-testid={`cd-tab-${t.id}`}
            className={`rounded px-2.5 py-1 text-xs ${tab === t.id ? 'bg-lime-500/20 text-lime-300' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {banner && (
          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${BANNER_CLASSES[banner]}`} data-testid="cd-banner">
            {banner}
          </span>
        )}
        {caseDraft && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onDuplicateCase} data-testid="cd-duplicate-case">
            <Copy className="mr-1 h-3 w-3" /> Duplicate
          </Button>
        )}
        {dirty && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveDraft} data-testid="cd-save-case">
            <Save className="mr-1 h-3 w-3" /> Save case
          </Button>
        )}
        <Link to="/dashboard/apps/drilling/completion-design-studio/help" className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-cyan-300 hover:bg-slate-700">
          <HelpCircle className="h-3 w-3" /> Help
        </Link>
      </div>
    </div>
  );

  const statusBar = (
    <div className="flex h-6 items-center gap-4 border-t border-slate-800 bg-slate-900/80 px-3 text-[10px] text-slate-500">
      <span>{ENGINE_VERSION}</span>
      <span data-testid="cd-status-wellbore">{wellbore ? `${wellbore.name} (${depthUnit})` : 'no wellbore'}</span>
      <span>{dirty ? 'unsaved changes' : 'saved'}</span>
      <span className="ml-auto">API 5CT drift and clearances validated vs oracle goldens; equipment dims are nominal</span>
    </div>
  );

  const center = !caseDraft ? (
    <div className="flex h-full items-center justify-center text-sm text-slate-500" data-testid="cd-empty">
      {wellboreId ? 'Create a completion case from the explorer.' : 'Pick a site and wellbore.'}
    </div>
  ) : (
    <div className="h-full min-h-0 overflow-auto bg-slate-950">
      {runError && (
        <div className="m-3 rounded border border-red-800 bg-red-950/40 p-2 text-xs text-red-300" data-testid="cd-run-error">
          {runError}
        </div>
      )}
      {tab === 'builder' && (
        <StringBuilderTab caseDraft={caseDraft} onCaseChange={onCaseChange}
          res={res} depthUnit={depthUnit} ctCases={ctCases} />
      )}
      {tab === 'schematic' && (
        <SchematicTab caseDraft={caseDraft} res={res} depthUnit={depthUnit} wellboreName={wellbore?.name} />
      )}
      {tab === 'checks' && (
        <ChecksTab caseDraft={caseDraft} onCaseChange={onCaseChange} res={res} depthUnit={depthUnit}
          onSaveRun={onSaveRun} savingRun={savingRun} runs={runs} onDeleteRun={onDeleteRun} />
      )}
      {tab === 'sizing' && (
        <TubingSizingTab caseDraft={caseDraft} onCaseChange={onCaseChange}
          stations={trajectory?.stations || null} res={res} />
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
          caseLabel="Completion cases" testPrefix="cd"
        />
      )}
      center={center}
      statusBar={statusBar}
      autoSaveId="completion-design-studio.workspace.v1"
      minWidth={1100}
    />
  );
}
