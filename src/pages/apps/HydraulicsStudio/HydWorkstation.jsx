// Drilling Fluids & Hydraulics Studio workstation (D2/H2): WorkspaceShell
// over an injected backend (wpBackend live / inMemoryBackend harness).
// Engine math runs client-side through services/hydRun; runs persist to
// wp_hyd_runs (immutable). Geometry comes from the SHARED
// wp_wellbore_geometry spine created at D1.

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Home, HelpCircle, Save } from 'lucide-react';
import Explorer from '../TorqueDragStudio/components/Explorer';
import MudRheologyTab from './components/MudRheologyTab';
import HydraulicsTab from './components/HydraulicsTab';
import SurgeSwabTab from './components/SurgeSwabTab';
import HoleCleaningTab from './components/HoleCleaningTab';
import {
  runHydraulics, runSurgeSwab, runHoleCleaning, safeTripSpeed,
  requiredFlowRate, HYD_ENGINE_VERSION,
} from './services/hydRun';
import { exportRunCsv, exportRunPdf } from './services/hydExport';
import { DRILL_PIPE, DRILL_COLLARS, HWDP, gradeYieldPa } from '../TorqueDragStudio/engine/tubulars';

const TABS = [
  { id: 'mud', label: 'Mud & Rheology' },
  { id: 'hydraulics', label: 'Hydraulics' },
  { id: 'surge', label: 'Surge & Swab' },
  { id: 'cleaning', label: 'Hole Cleaning' },
];

function defaultCase(wellboreId, designId, tdM) {
  const dp = DRILL_PIPE[3];
  const dc = DRILL_COLLARS[2];
  const hw = HWDP[3];
  return {
    wellbore_id: wellboreId,
    design_id: designId ?? null,
    name: 'Case 1',
    mud: { densityKgM3: 1440, fann: { theta600: 64, theta300: 38, theta6: 7, theta3: 6 }, model: 'auto' },
    string: [
      { type: 'dc', label: dc.designation, lengthM: 150, odM: dc.odM, idM: dc.idM, weightKgM: dc.weightKgM },
      { type: 'hwdp', label: hw.designation, lengthM: 150, odM: hw.odM, idM: hw.idM, weightKgM: hw.weightKgM, tooljointOdM: hw.tooljointOdM },
      {
        type: 'dp', label: dp.designation, lengthM: Math.max(300, (tdM || 3000) - 300),
        odM: dp.odM, idM: dp.idM, weightKgM: dp.weightKgM, tooljointOdM: dp.tooljointOdM,
        grade: 'S-135', yieldPa: gradeYieldPa('S-135'),
      },
    ],
    flow: { flowRateM3s: 0.025, nozzlesMm: [14, 14, 14], surfaceLossPa: 0 },
    trip: { mode: 'closed', maxSpeedMs: 3 },
    cuttings: { ropMs: 0.005, dParticleM: 0.006, rhoSolidKgM3: 2600 },
  };
}

// PP/FP EMW limits (kg/m3) at the bit from a mud-window row set (g/cc rows).
function limitsAtBit(mudWindow, stations) {
  if (!mudWindow?.length || !stations?.length) return null;
  const rows = mudWindow.filter((r) => r.ppEmw != null || r.fpEmw != null);
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  return {
    poreEmwKgM3: last.ppEmw != null ? last.ppEmw * 1000 : null,
    fracEmwKgM3: last.fpEmw != null ? last.fpEmw * 1000 : null,
  };
}

export default function HydWorkstation({ backend }) {
  const { toast } = useToast();
  const [sites, setSites] = useState(null);
  const [siteId, setSiteId] = useState(null);
  const [wellbores, setWellbores] = useState(null);
  const [wellboreId, setWellboreId] = useState(null);
  const [trajectory, setTrajectory] = useState(null);
  const [geometryRow, setGeometryRow] = useState(null);
  const [mudWindow, setMudWindow] = useState(null);
  const [tdCases, setTdCases] = useState([]);
  const [cases, setCases] = useState(null);
  const [caseId, setCaseId] = useState(null);
  const [caseDraft, setCaseDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('mud');
  const [hyd, setHyd] = useState(null);
  const [surge, setSurge] = useState(null);
  const [cleaning, setCleaning] = useState(null);
  const [minQ, setMinQ] = useState(null);
  const [safeSpeed, setSafeSpeed] = useState(null);
  const [runs, setRuns] = useState(null);
  const [running, setRunning] = useState(false);
  const [savingRun, setSavingRun] = useState(false);
  const [runError, setRunError] = useState(null);

  const fail = useCallback((e) => {
    toast({ title: 'Hydraulics Studio', description: e.message, variant: 'destructive' });
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
    setHyd(null); setSurge(null); setCleaning(null); setCaseId(null); setCaseDraft(null);
    Promise.all([
      backend.getDefinitiveTrajectory(wellboreId),
      backend.getGeometry(wellboreId),
      backend.listCases(wellboreId),
      backend.listTdCases ? backend.listTdCases(wellboreId).catch(() => []) : [],
    ]).then(async ([traj, geom, caseRows, tdRows]) => {
      setTrajectory(traj);
      setGeometryRow(geom || { wellbore_id: wellboreId, hole_sections: [] });
      setCases(caseRows);
      setTdCases(tdRows || []);
      if (caseRows.length) setCaseId(caseRows[0].id);
      if (backend.loadMudWindow) {
        setMudWindow(await backend.loadMudWindow(traj.wellbore, traj.stations).catch(() => null));
      }
    }).catch(fail);
  }, [backend, wellboreId, fail]);

  useEffect(() => {
    const row = (cases || []).find((c) => c.id === caseId);
    setCaseDraft(row ? JSON.parse(JSON.stringify(row)) : null);
    setDirty(false);
    setHyd(null); setSurge(null); setCleaning(null); setMinQ(null); setSafeSpeed(null); setRunError(null);
    if (caseId) backend.listRuns(caseId).then(setRuns).catch(fail);
    else setRuns(null);
  }, [backend, caseId, cases, fail]);

  const wellbore = trajectory?.wellbore || (wellbores || []).find((w) => w.id === wellboreId) || null;
  const depthUnit = wellbore?.depth_unit === 'ft' ? 'ft' : 'm';
  const tdM = trajectory?.stations?.length ? trajectory.stations[trajectory.stations.length - 1].md : 0;
  const limits = limitsAtBit(mudWindow, trajectory?.stations);

  const onCaseChange = (patch) => {
    setCaseDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const saveDraft = async () => {
    try {
      if (caseDraft?.id) {
        const saved = await backend.updateCase(caseDraft.id, {
          name: caseDraft.name,
          mud: caseDraft.mud,
          string: caseDraft.string,
          flow: caseDraft.flow,
          trip: caseDraft.trip,
          cuttings: caseDraft.cuttings,
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
      const created = await backend.saveCase(defaultCase(wellboreId, trajectory?.design?.id, tdM));
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

  const onImportString = async (tdCaseId) => {
    const td = tdCases.find((c) => c.id === tdCaseId);
    if (td?.string?.length) {
      onCaseChange({ string: td.string });
      toast({ title: 'String imported', description: `Copied from T&D case '${td.name}'.` });
    }
  };

  const guarded = (fn) => () => {
    setRunning(true);
    setRunError(null);
    setTimeout(() => {
      try { fn(); } catch (e) { setRunError(e.message); } finally { setRunning(false); }
    }, 30);
  };

  const onRunHydraulics = guarded(() => {
    const args = { stations: trajectory?.stations || [], caseRow: caseDraft, geometryRow };
    setHyd(runHydraulics(args));
    setCleaning(runHoleCleaning(args));
    setMinQ(requiredFlowRate({ ...args, targetTr: 0.5 }));
  });

  const onRunSurge = guarded(() => {
    const args = { stations: trajectory?.stations || [], caseRow: caseDraft, geometryRow };
    setSurge(runSurgeSwab(args));
    setSafeSpeed(limits
      ? safeTripSpeed({ ...args, poreEmwKgM3: limits.poreEmwKgM3, fracEmwKgM3: limits.fracEmwKgM3 })
      : null);
  });

  const onRunCleaning = guarded(() => {
    const args = { stations: trajectory?.stations || [], caseRow: caseDraft, geometryRow };
    setCleaning(runHoleCleaning(args));
    setMinQ(requiredFlowRate({ ...args, targetTr: 0.5 }));
  });

  const onSaveRun = async () => {
    if (!hyd || !caseDraft?.id) return;
    setSavingRun(true);
    try {
      const saved = await backend.saveRun({
        case_id: caseDraft.id,
        design_id: trajectory?.design?.id ?? null,
        params: { flow: caseDraft.flow, mud: caseDraft.mud },
        results: { ecdProfile: hyd.ecdProfile, bit: hyd.bit },
        summary: hyd.summary,
        engine_version: HYD_ENGINE_VERSION,
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
      <span className="text-sm font-semibold text-slate-100">Drilling Fluids & Hydraulics Studio</span>
      <div className="ml-2 flex gap-1">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} data-testid={`hyd-tab-${t.id}`}
            className={`rounded px-2.5 py-1 text-xs ${tab === t.id ? 'bg-lime-500/20 text-lime-300' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {dirty && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveDraft} data-testid="hyd-save-case">
            <Save className="mr-1 h-3 w-3" /> Save case
          </Button>
        )}
        <Link to="/dashboard/apps/drilling/drilling-fluids-hydraulics/help" className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-cyan-300 hover:bg-slate-700">
          <HelpCircle className="h-3 w-3" /> Help
        </Link>
      </div>
    </div>
  );

  const statusBar = (
    <div className="flex h-6 items-center gap-4 border-t border-slate-800 bg-slate-900/80 px-3 text-[10px] text-slate-500">
      <span>{HYD_ENGINE_VERSION}</span>
      <span data-testid="hyd-status-wellbore">{wellbore ? `${wellbore.name} (${depthUnit})` : 'no wellbore'}</span>
      <span>{mudWindow ? 'PP/FP window loaded' : 'no PP/FP window'}</span>
      <span className="ml-auto">RP 13D method; validated vs oracle goldens</span>
    </div>
  );

  const center = !caseDraft ? (
    <div className="flex h-full items-center justify-center text-sm text-slate-500" data-testid="hyd-empty">
      {wellboreId ? 'Create a hydraulics case from the explorer.' : 'Pick a site and wellbore.'}
    </div>
  ) : (
    <div className="h-full min-h-0 bg-slate-950">
      {tab === 'mud' && (
        <MudRheologyTab caseDraft={caseDraft} onCaseChange={onCaseChange} depthUnit={depthUnit}
          tdCases={tdCases} onImportString={onImportString} />
      )}
      {tab === 'hydraulics' && (
        <HydraulicsTab
          caseDraft={caseDraft} onCaseChange={onCaseChange} depthUnit={depthUnit}
          hyd={hyd} mudWindow={mudWindow} onRun={onRunHydraulics} running={running} error={runError}
          onSaveRun={onSaveRun} savingRun={savingRun} runs={runs} onDeleteRun={onDeleteRun}
          onExportCsv={() => exportRunCsv(hyd, depthUnit)}
          onExportPdf={() => exportRunPdf({
            hyd, surge, cleaning, caseName: caseDraft.name,
            wellboreName: wellbore?.name, flowRateM3s: caseDraft.flow?.flowRateM3s || 0, depthUnit,
          })}
        />
      )}
      {tab === 'surge' && (
        <SurgeSwabTab caseDraft={caseDraft} onCaseChange={onCaseChange} depthUnit={depthUnit}
          surge={surge} onRun={onRunSurge} running={running} error={runError}
          safeSpeed={safeSpeed} limits={limits} />
      )}
      {tab === 'cleaning' && (
        <HoleCleaningTab caseDraft={caseDraft} onCaseChange={onCaseChange} depthUnit={depthUnit}
          cleaning={cleaning} minQ={minQ} onRun={onRunCleaning} running={running} error={runError} />
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
          caseLabel="Hydraulics cases" testPrefix="hyd"
        />
      )}
      center={center}
      statusBar={statusBar}
      autoSaveId="hydraulics-studio.workspace.v1"
      minWidth={1100}
    />
  );
}
