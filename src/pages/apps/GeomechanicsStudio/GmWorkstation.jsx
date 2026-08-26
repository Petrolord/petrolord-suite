// Geomechanics & Wellbore Stability Studio workstation (D5/G2):
// WorkspaceShell over an injected backend. Curves come from the shared
// wells registry; results publish back as gm-1.0.0; runs persist to
// wp_gm_runs (immutable).

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Home, HelpCircle, Save } from 'lucide-react';
import Explorer from '../TorqueDragStudio/components/Explorer';
import InputsTab from './components/InputsTab';
import ProfilesTab from './components/ProfilesTab';
import WindowTab from './components/WindowTab';
import {
  assembleBaseProfile, runMem, runWindow, GM_ENGINE_VERSION,
} from './services/gmRun';
import { mapLogs, pickPublishedPpfg, publishedToBase, curvesToLogs } from './services/prepGm';
import { preparePublishLogs } from './services/publishGm';
import { exportWindowCsv, exportMemReportPdf } from './services/gmExport';

const TABS = [
  { id: 'inputs', label: 'Inputs & Logs' },
  { id: 'profiles', label: 'MEM Profiles' },
  { id: 'window', label: 'Mud Window' },
];

function defaultCase(wellboreId, designId, geoWellId) {
  return {
    wellbore_id: wellboreId,
    design_id: designId ?? null,
    name: 'Case 1',
    source: { geoWellId: geoWellId ?? null, ppSource: geoWellId ? 'published' : 'hydrostatic', mudlineMdM: 0, rhoFluidKgM3: 1030 },
    params: {
      nu: 0.25, alphaBiot: 1, frictionAngleDeg: 30, tensileStrengthPa: 0,
      epsX: 0, epsY: 0, ePa: null, shmaxAzimuthDeg: 0, regime: 'NF',
      ucs: { correlation: 'horsrud' },
    },
  };
}

export default function GmWorkstation({ backend }) {
  const { toast } = useToast();
  const [sites, setSites] = useState(null);
  const [siteId, setSiteId] = useState(null);
  const [wellbores, setWellbores] = useState(null);
  const [wellboreId, setWellboreId] = useState(null);
  const [trajectory, setTrajectory] = useState(null);
  const [geoWells, setGeoWells] = useState([]);
  const [cases, setCases] = useState(null);
  const [caseId, setCaseId] = useState(null);
  const [caseDraft, setCaseDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('inputs');
  const [curves, setCurves] = useState(null); // {published, logs, dt, inputLogIds, status}
  const [mem, setMem] = useState(null);
  const [win, setWin] = useState(null);
  const [runs, setRuns] = useState(null);
  const [running, setRunning] = useState(false);
  const [loadingCurves, setLoadingCurves] = useState(false);
  const [savingRun, setSavingRun] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [runError, setRunError] = useState(null);

  const fail = useCallback((e) => {
    toast({ title: 'Geomechanics Studio', description: e.message, variant: 'destructive' });
  }, [toast]);

  useEffect(() => {
    backend.listSites().then((rows) => {
      setSites(rows);
      if (rows.length === 1) setSiteId(rows[0].id);
    }).catch(fail);
    backend.listGeoWells().then(setGeoWells).catch(() => setGeoWells([]));
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
    setMem(null); setWin(null); setCurves(null); setCaseId(null); setCaseDraft(null);
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
    setMem(null); setWin(null); setCurves(null); setRunError(null);
    if (caseId) backend.listRuns(caseId).then(setRuns).catch(fail);
    else setRuns(null);
  }, [backend, caseId, cases, fail]);

  const wellbore = trajectory?.wellbore || (wellbores || []).find((w) => w.id === wellboreId) || null;
  const depthUnit = wellbore?.depth_unit === 'ft' ? 'ft' : 'm';

  const onCaseChange = (patch) => {
    setCaseDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const saveDraft = async () => {
    try {
      if (caseDraft?.id) {
        const saved = await backend.updateCase(caseDraft.id, {
          name: caseDraft.name,
          source: caseDraft.source,
          params: caseDraft.params,
          design_id: trajectory?.design?.id ?? null,
        });
        setCases((rows) => rows.map((r) => (r.id === saved.id ? saved : r)));
      }
      setDirty(false);
      toast({ title: 'Saved', description: 'Case saved.' });
    } catch (e) { fail(e); }
  };

  const onNewCase = async () => {
    try {
      const created = await backend.saveCase(defaultCase(
        wellboreId, trajectory?.design?.id, trajectory?.wellbore?.geo_well_id ?? geoWells[0]?.id,
      ));
      setCases((rows) => [...(rows || []), created]);
      setCaseId(created.id);
    } catch (e) { fail(e); }
  };

  const onDeleteCase = async (id) => {
    try {
      await backend.deleteCase(id);
      setCases((rows) => rows.filter((r) => r.id !== id));
      if (caseId === id) setCaseId(null);
    } catch (e) { fail(e); }
  };

  const onLoadCurves = async () => {
    setLoadingCurves(true);
    setRunError(null);
    try {
      const geoWellId = caseDraft.source?.geoWellId;
      const logs = await backend.listGeoLogs(geoWellId);
      const mapped = mapLogs(logs);
      const ppfg = pickPublishedPpfg(logs);
      let published = null;
      if (ppfg.PP && ppfg.OBG) {
        const [ppData, obgData] = await Promise.all([
          backend.downloadCurve(ppfg.PP), backend.downloadCurve(ppfg.OBG),
        ]);
        published = publishedToBase({ ppLog: ppfg.PP, obgLog: ppfg.OBG, ppData, obgData });
      }
      let rawLogs = null;
      let dt = null;
      if (mapped?.DEPT && mapped?.DT) {
        const [deptData, dtData] = await Promise.all([
          backend.downloadCurve(mapped.DEPT), backend.downloadCurve(mapped.DT),
        ]);
        const rhobData = mapped.RHOB ? await backend.downloadCurve(mapped.RHOB) : null;
        rawLogs = curvesToLogs({ deptData, dtLog: mapped.DT, dtData, rhobLog: mapped.RHOB, rhobData });
        dt = rawLogs.dtUsPerM;
      }
      setCurves({
        published,
        logs: rawLogs,
        dt,
        inputLogIds: [mapped?.DEPT?.id, mapped?.DT?.id, mapped?.RHOB?.id, ppfg.PP?.id, ppfg.OBG?.id].filter(Boolean),
        status: {
          DEPT: !!mapped?.DEPT, DT: !!mapped?.DT, RHOB: !!mapped?.RHOB,
          'pp-1.0.0 PP': !!ppfg.PP, 'pp-1.0.0 OBG': !!ppfg.OBG,
        },
      });
      toast({ title: 'Curves loaded', description: 'Curve mapping updated.' });
    } catch (e) { fail(e); } finally { setLoadingCurves(false); }
  };

  const guarded = (fn) => () => {
    setRunning(true);
    setRunError(null);
    setTimeout(() => {
      try { fn(); } catch (e) { setRunError(e.message); } finally { setRunning(false); }
    }, 30);
  };

  const buildMem = () => {
    if (!curves) throw new Error('Load curves first (Inputs & Logs tab).');
    const base = assembleBaseProfile({
      source: caseDraft.source, logs: curves.logs, published: curves.published,
    });
    // Align DT to the base grid when the published path is used: the
    // in-registry grids match by construction (same well); fall back to raw.
    const dt = base.dtAligned ?? curves.dt;
    return runMem({ base, dtUsPerM: dt, params: caseDraft.params });
  };

  const onRunMem = guarded(() => setMem(buildMem()));
  const onRunWindow = guarded(() => {
    const m = mem ?? buildMem();
    setMem(m);
    setWin(runWindow({ stations: trajectory?.stations || [], mem: m, params: caseDraft.params }));
  });

  const onPublish = async () => {
    if (!mem || !backend.publishCurves) return;
    setPublishing(true);
    try {
      const prepared = preparePublishLogs({
        profile: mem.profile, params: caseDraft.params,
        meta: { projectId: caseDraft.id, inputLogIds: curves?.inputLogIds || [] },
      });
      await backend.publishCurves(caseDraft.source.geoWellId, prepared, caseDraft.id);
      toast({ title: 'Published', description: 'SHMIN, SHMAX and UCS published as gm-1.0.0 (own curves replaced).' });
    } catch (e) { fail(e); } finally { setPublishing(false); }
  };

  const onSaveRun = async () => {
    if (!win || !caseDraft?.id) return;
    setSavingRun(true);
    try {
      const saved = await backend.saveRun({
        case_id: caseDraft.id,
        design_id: trajectory?.design?.id ?? null,
        params: { source: caseDraft.source, params: caseDraft.params },
        results: { rows: win.rows },
        summary: {
          tightestWidthKgM3: win.tightest?.widthKgM3 ?? null,
          tightestMd: win.tightest?.md ?? null,
          inversionMd: win.inversionMd,
          qualityScore: mem?.quality?.score ?? null,
        },
        engine_version: GM_ENGINE_VERSION,
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

  const ribbon = (
    <div className="flex h-11 items-center gap-3 border-b border-slate-800 bg-slate-900/80 px-3">
      <Link to="/dashboard/drilling" className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
        <Home className="h-3.5 w-3.5" /> Drilling
      </Link>
      <span className="text-sm font-semibold text-slate-100">Geomechanics & Wellbore Stability Studio</span>
      <div className="ml-2 flex gap-1">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} data-testid={`gm-tab-${t.id}`}
            className={`rounded px-2.5 py-1 text-xs ${tab === t.id ? 'bg-lime-500/20 text-lime-300' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {dirty && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveDraft} data-testid="gm-save-case">
            <Save className="mr-1 h-3 w-3" /> Save case
          </Button>
        )}
        <Link to="/dashboard/apps/drilling/geomechanics-studio/help" className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-cyan-300 hover:bg-slate-700">
          <HelpCircle className="h-3 w-3" /> Help
        </Link>
      </div>
    </div>
  );

  const statusBar = (
    <div className="flex h-6 items-center gap-4 border-t border-slate-800 bg-slate-900/80 px-3 text-[10px] text-slate-500">
      <span>{GM_ENGINE_VERSION}</span>
      <span data-testid="gm-status-wellbore">{wellbore ? `${wellbore.name} (${depthUnit})` : 'no wellbore'}</span>
      <span>{curves ? 'curves loaded' : 'no curves'}</span>
      <span className="ml-auto">1D MEM + Kirsch stability; validated vs oracle goldens</span>
    </div>
  );

  const center = !caseDraft ? (
    <div className="flex h-full items-center justify-center text-sm text-slate-500" data-testid="gm-empty">
      {wellboreId ? 'Create a MEM case from the explorer.' : 'Pick a site and wellbore.'}
    </div>
  ) : (
    <div className="h-full min-h-0 bg-slate-950">
      {tab === 'inputs' && (
        <InputsTab caseDraft={caseDraft} onCaseChange={onCaseChange}
          geoWells={geoWells} curveStatus={curves?.status ?? null}
          onLoadCurves={onLoadCurves} loading={loadingCurves} error={runError} />
      )}
      {tab === 'profiles' && (
        <ProfilesTab mem={mem} depthUnit={depthUnit} onRun={onRunMem} running={running}
          error={runError} onPublish={onPublish} publishing={publishing}
          canPublish={!!backend.publishCurves && !!caseDraft.source?.geoWellId} />
      )}
      {tab === 'window' && (
        <WindowTab win={win} depthUnit={depthUnit} onRun={onRunWindow} running={running}
          error={runError} onSaveRun={onSaveRun} savingRun={savingRun}
          runs={runs} onDeleteRun={onDeleteRun}
          onExportCsv={() => exportWindowCsv(win, depthUnit)}
          onExportPdf={() => exportMemReportPdf({ mem, win, caseRow: caseDraft, wellboreName: wellbore?.name, depthUnit })} />
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
          caseLabel="MEM cases" testPrefix="gm"
        />
      )}
      center={center}
      statusBar={statusBar}
      autoSaveId="geomechanics-studio.workspace.v1"
      minWidth={1100}
    />
  );
}
