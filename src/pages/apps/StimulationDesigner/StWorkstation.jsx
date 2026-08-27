// Stimulation Designer workstation (D9/ST2): WorkspaceShell over an
// injected backend. Geometry, schedule, productivity and acidizing all
// recompute synchronously through the pure stRun on every edit; closure
// and reservoir pressure come from the published gm-1.0.0/pp-1.0.0
// curves; runs persist to wp_st_runs (immutable).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Home, HelpCircle, Save, Copy } from 'lucide-react';
import Explorer from '../TorqueDragStudio/components/Explorer';
import FracDesignTab from './components/FracDesignTab';
import ScheduleTab from './components/ScheduleTab';
import ProductivityTab from './components/ProductivityTab';
import AcidizingTab from './components/AcidizingTab';
import { runAll, defaultCaseDoc, ENGINE_VERSION } from './services/stRun';
import { pickPublishedGm, pickPublishedPpfg, publishedToCurves } from '../PerforationSandControl/services/prepPs';

const TABS = [
  { id: 'design', label: 'Frac Design' },
  { id: 'schedule', label: 'Pump Schedule' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'acidizing', label: 'Acidizing' },
];

const BANNER_CLASSES = {
  PASS: 'bg-emerald-500/20 text-emerald-300',
  WARN: 'bg-amber-500/20 text-amber-300',
  FAIL: 'bg-red-500/20 text-red-300',
  UNKNOWN: 'bg-slate-700 text-slate-300',
};

export default function StWorkstation({ backend }) {
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
  const [tab, setTab] = useState('design');
  const [curveState, setCurveState] = useState({ curves: null, missing: null });
  const [runs, setRuns] = useState(null);
  const [savingRun, setSavingRun] = useState(false);

  const fail = useCallback((e) => {
    toast({ title: 'Stimulation Designer', description: e.message, variant: 'destructive' });
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
    setCaseId(null); setCaseDraft(null); setCurveState({ curves: null, missing: null });
    Promise.all([
      backend.getDefinitiveTrajectory(wellboreId),
      backend.listCases(wellboreId),
    ]).then(([traj, caseRows]) => {
      setTrajectory(traj);
      setCases(caseRows);
      if (caseRows.length) setCaseId(caseRows[0].id);
      const geoWellId = traj?.wellbore?.geo_well_id;
      if (!geoWellId) {
        setCurveState({ curves: null, missing: 'geo well link (bridge the wellbore in Well Design Studio)' });
        return;
      }
      backend.listGeoLogs(geoWellId).then(async (logs) => {
        const gm = pickPublishedGm(logs);
        const ppfg = pickPublishedPpfg(logs);
        const data = {};
        for (const [k, log] of [['SHMIN', gm.SHMIN], ['SHMAX', gm.SHMAX], ['UCS', gm.UCS], ['PP', ppfg.PP], ['OBG', ppfg.OBG]]) {
          if (log) data[k] = await backend.downloadCurve(log); // eslint-disable-line no-await-in-loop
        }
        setCurveState(publishedToCurves({ gm, ppfg, data }));
      }).catch((e) => setCurveState({ curves: null, missing: `curves (${e.message})` }));
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
        res: runAll({
          caseDoc: caseDraft,
          stations: trajectory?.stations || null,
          curves: curveState.curves,
        }),
        error: null,
      };
    } catch (e) {
      return { res: null, error: e.message };
    }
  }, [caseDraft, trajectory, curveState.curves]);
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
      interval: draft.interval,
      frac: draft.frac,
      acid: draft.acid,
      params: draft.params,
      notes: draft.notes ?? '',
      design_id: trajectory?.design?.id ?? null,
      ps_case_id: draft.ps_case_id ?? null,
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
      toast({ title: 'Saved', description: 'Stimulation case saved.' });
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
        ps_case_id: caseDraft.ps_case_id ?? null,
        name: `${caseDraft.name} (copy)`,
        interval: caseDraft.interval,
        frac: caseDraft.frac,
        acid: caseDraft.acid,
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
          interval: caseDraft.interval, frac: caseDraft.frac,
          acid: caseDraft.acid, params: caseDraft.params,
        },
        results: {
          rock: res.rock,
          geometry: res.geometry,
          balance: res.balance,
          schedule: { ...res.schedule, steps: res.schedule.steps },
          pack: res.pack ? {
            wpM: res.pack.wpM, arealKgM2: res.pack.arealKgM2,
            kfM2: res.pack.kfM2, clamped: res.pack.clamped,
          } : null,
          productivity: res.productivity,
          acid: res.acid,
        },
        summary: {
          status: res.kpis.status,
          etaFrac: res.kpis.etaFrac,
          massKg: res.kpis.massKg,
          cfd: res.kpis.cfd,
          foi: res.kpis.foi,
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
      <span className="text-sm font-semibold text-slate-100">Stimulation Designer</span>
      <div className="ml-2 flex gap-1">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} data-testid={`st-tab-${t.id}`}
            className={`rounded px-2.5 py-1 text-xs ${tab === t.id ? 'bg-lime-500/20 text-lime-300' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {banner && (
          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${BANNER_CLASSES[banner]}`} data-testid="st-banner">
            {banner}
          </span>
        )}
        {caseDraft && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onDuplicateCase} data-testid="st-duplicate-case">
            <Copy className="mr-1 h-3 w-3" /> Duplicate
          </Button>
        )}
        {dirty && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveDraft} data-testid="st-save-case">
            <Save className="mr-1 h-3 w-3" /> Save case
          </Button>
        )}
        <Link to="/dashboard/apps/drilling/stimulation-designer/help" className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-cyan-300 hover:bg-slate-700">
          <HelpCircle className="h-3 w-3" /> Help
        </Link>
      </div>
    </div>
  );

  const statusBar = (
    <div className="flex h-6 items-center gap-4 border-t border-slate-800 bg-slate-900/80 px-3 text-[10px] text-slate-500">
      <span>{ENGINE_VERSION}</span>
      <span data-testid="st-status-wellbore">{wellbore ? `${wellbore.name} (${depthUnit})` : 'no wellbore'}</span>
      <span>{dirty ? 'unsaved changes' : 'saved'}</span>
      <span className="ml-auto">2D frac + acidizing validated vs oracle goldens; proppant and PV_bt data are nominal</span>
    </div>
  );

  const center = !caseDraft ? (
    <div className="flex h-full items-center justify-center text-sm text-slate-500" data-testid="st-empty">
      {wellboreId ? 'Create a stimulation case from the explorer.' : 'Pick a site and wellbore.'}
    </div>
  ) : (
    <div className="h-full min-h-0 overflow-auto bg-slate-950">
      {runError && (
        <div className="m-3 rounded border border-red-800 bg-red-950/40 p-2 text-xs text-red-300" data-testid="st-run-error">
          {runError}
        </div>
      )}
      {curveState.missing && (
        <div className="m-3 rounded border border-amber-800 bg-amber-950/30 p-2 text-xs text-amber-300" data-testid="st-curves-missing">
          Missing published {curveState.missing}. Publish SHMIN/SHMAX/UCS from Geomechanics Studio
          and PP/OBG from Pore Pressure Studio for this wellbore, or set manual overrides.
        </div>
      )}
      {tab === 'design' && (
        <FracDesignTab caseDraft={caseDraft} onCaseChange={onCaseChange} res={res} depthUnit={depthUnit} />
      )}
      {tab === 'schedule' && (
        <ScheduleTab caseDraft={caseDraft} onCaseChange={onCaseChange} res={res} />
      )}
      {tab === 'productivity' && (
        <ProductivityTab caseDraft={caseDraft} onCaseChange={onCaseChange} res={res} />
      )}
      {tab === 'acidizing' && (
        <AcidizingTab caseDraft={caseDraft} onCaseChange={onCaseChange} res={res}
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
          caseLabel="Stimulation cases" testPrefix="st"
        />
      )}
      center={center}
      statusBar={statusBar}
      autoSaveId="stimulation-designer.workspace.v1"
      minWidth={1100}
    />
  );
}
